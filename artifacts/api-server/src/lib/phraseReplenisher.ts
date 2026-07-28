// Background phrase replenishment for Plus learners: when a learner is
// approaching the end of a topic's phrase set, the server proactively
// generates a few more phrases so fresh content is already waiting the next
// time the list is fetched — no manual "Add more phrases" tap needed.
//
// This module owns two things:
//   - the pure trigger decision (`shouldReplenish`), so the threshold and the
//     Plus-only gate are unit-testable without a database, and
//   - the concurrency-safe background generation (`replenishPhrases`), which
//     dedups overlapping triggers both in-process (same server, topic opened
//     twice quickly) and across processes/devices (a Postgres advisory lock),
//     so a topic is never double-replenished.
import {
  db,
  pool,
  phrasesTable,
  lessonGroupsTable,
  lessonGenerationsTable,
} from "@workspace/db";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import {
  generateAdditionalPhrases,
  type AdditionalPhrasesRequest,
  type GeneratedPhrase,
} from "./lessonGenerator";
import { recordLessonGeneration } from "./lessonLimits";
import { featuresForPlan, type Plan } from "./entitlements";
import type { PhraseStats } from "./progressMetrics";

// A topic is "approaching the end" once this share of its phrases has been
// engaged (attempted at least once or mastered). 0.6 means: with the default
// 8-phrase starter set, replenishment kicks in when the learner has touched 5,
// so fresh content is already waiting well before the last phrase.
export const REPLENISH_THRESHOLD = 0.6;

// How many fresh phrases each background replenishment asks the AI for. Kept
// small so content grows steadily rather than in overwhelming bursts.
export const REPLENISH_BATCH_SIZE = 3;

// Minimum gap between AI generations for the same (language, topic). Without
// this, a fully-engaged topic where the model can only produce duplicates
// (nothing inserted, so the trigger keeps firing) would re-run a paid AI call
// on every poll/focus refetch. The check is DB-backed (lesson_generations
// carries every real generation, including zero-add runs and manual adds), so
// it holds across server processes and restarts.
export const REPLENISH_COOLDOWN_MS = 10 * 60 * 1000;

// Free-tier background replenishment constants. Free learners get a much
// slower cadence (once per day instead of every 10 minutes) and a hard ceiling
// so the starter set grows modestly without ballooning.
export const FREE_REPLENISH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
export const FREE_PHRASE_CEILING = 20; // max phrases a Free topic may grow to

// D1a Slice 2: size cap for appending replenished phrases to the last
// phrase-stage lesson group. 14 = the largest group Slice 1's partitioner
// itself produces (target 10 + merged tail of up to 4). At or above the cap a
// new phrase-stage group is created instead.
export const GROUP_SIZE_CAP = 14;

// Postgres unique_violation, possibly wrapped by drizzle (err.cause).
function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string } | null)?.code ??
    ((err as { cause?: { code?: string } } | null)?.cause?.code ?? null);
  return code === "23505";
}

// Loose key for de-duplicating phrases by their native-script text (shared
// with the manual "Add more phrases" endpoint's guard).
export function phraseKey(nativeScript: string): string {
  return nativeScript.trim().toLowerCase().replace(/\s+/g, " ");
}

// Pure trigger decision: should a fetch of this topic's phrase list kick off
// background replenishment for this caller?
//   - Only Plus (the extended-library plan) ever replenishes via this path —
//     Free and One Language use shouldReplenishFree instead.
//   - The learner must have engaged (attempted or mastered) at least
//     REPLENISH_THRESHOLD of the phrases they can see.
export function shouldReplenish(
  plan: Plan,
  phraseIds: number[],
  stats: Map<number, PhraseStats>,
): boolean {
  if (!featuresForPlan(plan).extendedLibrary) return false;
  if (phraseIds.length === 0) return false;
  const engaged = phraseIds.filter((id) => {
    const s = stats.get(id);
    return s != null && (s.mastered || s.attemptCount > 0);
  }).length;
  return engaged / phraseIds.length >= REPLENISH_THRESHOLD;
}

// Pure trigger decision for Free (and One Language) learners. Fires when:
//   - The caller does NOT have the extended library (i.e. not Plus), AND
//   - The topic's visible phrase count is below FREE_PHRASE_CEILING, AND
//   - The learner has engaged at least 80 % of those phrases.
// Engagement is kept at 80 % (not the lowered Plus threshold) so the daily
// AI call only fires once the learner is clearly near the end of their set.
export function shouldReplenishFree(
  plan: Plan,
  phraseIds: number[],
  stats: Map<number, PhraseStats>,
): boolean {
  if (featuresForPlan(plan).extendedLibrary) return false; // Plus has its own path
  if (phraseIds.length === 0) return false;
  if (phraseIds.length >= FREE_PHRASE_CEILING) return false; // already at ceiling
  const engaged = phraseIds.filter((id) => {
    const s = stats.get(id);
    return s != null && (s.mastered || s.attemptCount > 0);
  }).length;
  return engaged / phraseIds.length >= 0.8;
}

export interface ReplenishOptions {
  languageCode: string;
  categoryId: number;
  // Recorded against generation tracking.
  userId: string;
  count?: number;
  // Injectable so tests never call OpenAI.
  generate?: (req: AdditionalPhrasesRequest) => Promise<GeneratedPhrase[]>;
  // For Free-tier replenishment: use a longer cooldown and hard ceiling.
  // Defaults to the Plus values (REPLENISH_COOLDOWN_MS, no ceiling).
  cooldownMs?: number;
  // If set, replenishment is skipped when the existing phrase count >= this.
  phraseCeiling?: number;
  // Prefix for the Postgres advisory-lock key so Free and Plus locks never
  // collide, allowing both to run independently for the same (lang, topic).
  // Defaults to "phrase-replenish".
  lockKeyPrefix?: string;
  // Generation kind written to lesson_generations. Use 'replenishment' for
  // background top-ups so they are never counted toward the Free daily cap.
  // Defaults to 'replenishment' (every replenishPhrases call is a top-up).
  generationKind?: "initial" | "replenishment";
}

// In-process dedup: one replenishment per (lock-key prefix + language + category)
// at a time. Free and Plus use distinct prefixes so they dedup independently.
const inFlight = new Map<string, Promise<number>>();

// Generates and appends fresh phrases to an existing lesson, in the
// background. Returns how many phrases were added (0 when another
// replenishment already held the lock, the lesson doesn't exist, the AI
// only produced duplicates, or the topic is already at its ceiling).
// Fire-and-forget: never blocks the HTTP response.
export function replenishPhrases(opts: ReplenishOptions): Promise<number> {
  const prefix = opts.lockKeyPrefix ?? "phrase-replenish";
  const key = `${prefix}:${opts.languageCode}:${opts.categoryId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const run = doReplenish(opts).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, run);
  return run;
}

async function doReplenish(opts: ReplenishOptions): Promise<number> {
  const { languageCode, categoryId, userId } = opts;
  const generate = opts.generate ?? generateAdditionalPhrases;
  const count = opts.count ?? REPLENISH_BATCH_SIZE;
  const cooldownMs = opts.cooldownMs ?? REPLENISH_COOLDOWN_MS;
  const lockPrefix = opts.lockKeyPrefix ?? "phrase-replenish";

  // Cross-process/device dedup: a session-level Postgres advisory lock keyed
  // on the (prefix, language, category) triple. Free and Plus use distinct
  // prefixes so they never block each other for the same topic.
  const lockKey = `${lockPrefix}:${languageCode}:${categoryId}`;
  const client = await pool.connect();
  let locked = false;
  try {
    const res = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockKey],
    );
    locked = res.rows[0]?.locked === true;
    if (!locked) return 0;

    const [language, category, lesson] = await Promise.all([
      db.query.languagesTable.findFirst({
        where: (t, { eq: eqFn }) => eqFn(t.code, languageCode),
      }),
      db.query.categoriesTable.findFirst({
        where: (t, { eq: eqFn }) => eqFn(t.id, categoryId),
      }),
      db.query.lessonsTable.findFirst({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(
            eqFn(t.languageCode, languageCode),
            eqFn(t.categoryId, categoryId),
          ),
      }),
    ]);
    // Replenishment only tops up an existing lesson — it never creates one.
    if (!language || !category || !lesson) return 0;

    // Cooldown: if ANY generation for this (language, topic) happened recently
    // — a previous replenishment (even one that only produced duplicates and
    // inserted nothing), a manual "Add more phrases", or the initial lesson
    // build — skip. This makes the trigger idempotent under the clients'
    // routine poll/focus refetches instead of re-paying the AI every cycle.
    // Free uses a 24-hour cooldown; Plus uses 10 minutes.
    const since = new Date(Date.now() - cooldownMs);
    const recent = await db
      .select({ id: lessonGenerationsTable.id })
      .from(lessonGenerationsTable)
      .where(
        and(
          eq(lessonGenerationsTable.languageCode, languageCode),
          eq(lessonGenerationsTable.categoryId, categoryId),
          gte(lessonGenerationsTable.createdAt, since),
        ),
      )
      .limit(1);
    if (recent.length > 0) return 0;

    const existing = await db.query.phrasesTable.findMany({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(t.lessonId, lesson.id), eqFn(t.stage, "phrase")),
      orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
    });
    if (existing.length === 0) return 0;

    // Ceiling check (Free only): if the topic already has as many phrases as
    // the tier allows, skip without calling the AI.
    if (opts.phraseCeiling != null && existing.length >= opts.phraseCeiling) {
      return 0;
    }

    const generated = await generate({
      languageName: language.name,
      nativeName: language.nativeName,
      script: language.script,
      topicTitle: category.title,
      topicDescription: category.description,
      existing: existing.map((p) => ({
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        english: p.english,
      })),
      count,
    });

    // A real AI generation happened — record it in the existing generation
    // tracking. Background top-ups use kind='replenishment' so they are never
    // counted toward the Free daily new-lesson cap.
    const generationKind = opts.generationKind ?? "replenishment";
    await recordLessonGeneration(userId, languageCode, categoryId, generationKind);

    // Guard against the model echoing existing phrases (or duplicating
    // within its own batch) despite the prompt.
    const seen = new Set(existing.map((p) => phraseKey(p.nativeScript)));
    const fresh: GeneratedPhrase[] = [];
    for (const g of generated) {
      const k = phraseKey(g.nativeScript);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      fresh.push(g);
    }
    if (fresh.length === 0) return 0;

    const startOrder =
      existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;

    // ── D1a Slice 2: insert-time lesson-group assignment (strategy A) ──
    // Fresh phrase-stage rows append to the LAST phrase-stage group while it
    // is below the size cap; overflow creates a new phrase-stage group at
    // (last phrase-stage position + 1), shifting any sentence-stage groups up
    // by one so the Slice 1 invariants hold: stage blocks stay pure and
    // phrase-stage groups keep the lower positions. Everything — the shift,
    // new groups, and the phrase inserts — happens in ONE transaction, so a
    // concurrent unlock-state read can never observe a mid-shift ordering
    // (MVCC: readers see the pre-transaction snapshot until commit). Progress
    // is keyed by group ID, never position, so shifts cannot orphan it.
    // The whole operation also still runs under this topic's advisory lock.
    //
    // Race hardening: the Free and Plus replenishers use DIFFERENT advisory
    // locks for the same topic, and the startup regroup backfill uses a third
    // — so two writers can, rarely, plan the same group positions. The unique
    // constraints then roll back one transaction; we retry once against the
    // fresh state, and as a last resort insert the phrases UNASSIGNED
    // (legal — nullable, surfaces in unassignedCount) rather than crash a
    // background job or duplicate a position.
    const insertAssigned = () => db.transaction(async (tx) => {
      const groupRows = await tx
        .select({
          id: lessonGroupsTable.id,
          position: lessonGroupsTable.position,
          size: sql<number>`count(${phrasesTable.id})::int`,
          maxPos: sql<number>`coalesce(max(${phrasesTable.lessonGroupPosition}), 0)::int`,
          stage: sql<string | null>`min(${phrasesTable.stage})`,
        })
        .from(lessonGroupsTable)
        .leftJoin(
          phrasesTable,
          eq(phrasesTable.lessonGroupId, lessonGroupsTable.id),
        )
        .where(
          and(
            eq(lessonGroupsTable.languageCode, languageCode),
            eq(lessonGroupsTable.categoryId, categoryId),
          ),
        )
        .groupBy(lessonGroupsTable.id, lessonGroupsTable.position)
        .orderBy(asc(lessonGroupsTable.position));

      const phraseGroups = groupRows.filter(
        (g) => g.size > 0 && g.stage === "phrase",
      );
      const lastPhrase = phraseGroups[phraseGroups.length - 1] ?? null;
      const lastPhrasePos = lastPhrase?.position ?? 0;

      // Plan each fresh row's slot. Placeholder ids (-1, -2, …) mark groups
      // that must be created; they map to positions lastPhrasePos+1, +2, ….
      type Slot = { groupId: number; groupPosition: number };
      const slots: Slot[] = [];
      let curId: number | null = lastPhrase?.id ?? null;
      let curFill = lastPhrase?.maxPos ?? 0;
      let newGroups = 0;
      for (let i = 0; i < fresh.length; i++) {
        if (curId == null || curFill >= GROUP_SIZE_CAP) {
          newGroups++;
          curId = -newGroups;
          curFill = 0;
        }
        curFill++;
        slots.push({ groupId: curId, groupPosition: curFill });
      }

      const realId = new Map<number, number>();
      if (newGroups > 0) {
        // Make room: shift every group past the phrase-stage block up by
        // newGroups. Two-phase sign flip because the (language, category,
        // position) unique constraint is checked per row.
        await tx
          .update(lessonGroupsTable)
          .set({ position: sql`-(${lessonGroupsTable.position} + ${newGroups})` })
          .where(
            and(
              eq(lessonGroupsTable.languageCode, languageCode),
              eq(lessonGroupsTable.categoryId, categoryId),
              sql`${lessonGroupsTable.position} > ${lastPhrasePos}`,
            ),
          );
        await tx
          .update(lessonGroupsTable)
          .set({ position: sql`-${lessonGroupsTable.position}` })
          .where(
            and(
              eq(lessonGroupsTable.languageCode, languageCode),
              eq(lessonGroupsTable.categoryId, categoryId),
              sql`${lessonGroupsTable.position} < 0`,
            ),
          );
        for (let k = 1; k <= newGroups; k++) {
          const [created] = await tx
            .insert(lessonGroupsTable)
            .values({
              languageCode,
              categoryId,
              position: lastPhrasePos + k,
            })
            .returning({ id: lessonGroupsTable.id });
          realId.set(-k, created!.id);
        }
      }

      const rows = await tx
        .insert(phrasesTable)
        .values(
          fresh.map((p, i) => ({
            lessonId: lesson.id,
            languageCode,
            categoryId,
            nativeScript: p.nativeScript,
            romanized: p.romanized,
            english: p.english,
            difficulty: p.difficulty,
            sortOrder: startOrder + i,
            stage: "phrase",
            lessonGroupId:
              slots[i]!.groupId < 0
                ? realId.get(slots[i]!.groupId)!
                : slots[i]!.groupId,
            lessonGroupPosition: slots[i]!.groupPosition,
          })),
        )
        .returning({ id: phrasesTable.id });
      return rows.length;
    });

    const insertUnassigned = async () => {
      const rows = await db
        .insert(phrasesTable)
        .values(
          fresh.map((p, i) => ({
            lessonId: lesson.id,
            languageCode,
            categoryId,
            nativeScript: p.nativeScript,
            romanized: p.romanized,
            english: p.english,
            difficulty: p.difficulty,
            sortOrder: startOrder + i,
            stage: "phrase",
          })),
        )
        .returning({ id: phrasesTable.id });
      return rows.length;
    };

    try {
      return await insertAssigned();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      try {
        return await insertAssigned();
      } catch (err2) {
        if (!isUniqueViolation(err2)) throw err2;
        return await insertUnassigned();
      }
    }
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    }
    client.release();
  }
}
