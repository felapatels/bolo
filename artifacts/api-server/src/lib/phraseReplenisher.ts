// Background phrase replenishment for Plus learners: when a learner is
// approaching the end of a topic's phrase set, the server proactively
// generates a few more phrases so fresh content is already waiting the next
// time the list is fetched, no manual "Add more phrases" tap needed.
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
  normalizePhraseText,
  isDuplicatePhraseTextError,
} from "@workspace/db";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import {
  generateAdditionalPhrases,
  type AdditionalPhrasesRequest,
  type GeneratedPhrase,
} from "./lessonGenerator";
import { recordLessonGeneration } from "./lessonLimits";
import { featuresForPlan, type Plan } from "./entitlements";
import { countVisiblePhrases, phraseCeilingForPlan } from "./phraseCeilings";
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
// Max phrases a Free topic may grow to. Read from the shared ceiling resolver
// so the background path and the manual append path can never disagree.
export const FREE_PHRASE_CEILING = phraseCeilingForPlan("free");

// D1a Slice 2: size cap for appending replenished phrases to the last
// phrase-stage lesson group. 14 = the largest group Slice 1's partitioner
// itself produces (target 10 + merged tail of up to 4). At or above the cap a
// new phrase-stage group is created instead.
export const GROUP_SIZE_CAP = 14;

// The default advisory-lock prefix: the Plus background path and the manual
// "Add more phrases" endpoint share it, so a tap and a background top-up for
// the same topic can never generate against the same phrase snapshot at once.
export const DEFAULT_REPLENISH_LOCK_PREFIX = "phrase-replenish";

// The advisory-lock key for one (prefix, language, topic). Exported so the
// manual append path locks on exactly the same string rather than reinventing
// the key format.
export function topicLockKey(
  languageCode: string,
  categoryId: number,
  prefix: string = DEFAULT_REPLENISH_LOCK_PREFIX,
): string {
  return `${prefix}:${languageCode}:${categoryId}`;
}

// Postgres unique_violation, possibly wrapped by drizzle (err.cause).
function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string } | null)?.code ??
    ((err as { cause?: { code?: string } } | null)?.cause?.code ?? null);
  return code === "23505";
}

// Loose key for de-duplicating phrases by their native-script text (shared
// with the manual "Add more phrases" endpoint's guard). Delegates to the one
// definition the database's own unique index mirrors, so the application guard
// and `phrases_topic_stage_text_unique` can never disagree about what counts
// as the same phrase.
export function phraseKey(nativeScript: string): string {
  return normalizePhraseText(nativeScript);
}

// Pure trigger decision: should a fetch of this topic's phrase list kick off
// background replenishment for this caller?
//   - Only Plus (the extended-library plan) ever replenishes via this path,     Free and One Language use shouldReplenishFree instead.
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
  // The caller's plan. Required whenever `phraseCeiling` is set: the ceiling
  // counts rows VISIBLE TO THAT PLAN, and counting raw rows instead is exactly
  // the units mismatch that made Free top-ups dead on arrival.
  plan?: Plan;
  // Generation kind written to lesson_generations. Use 'replenishment' for
  // background top-ups so they are never counted toward the Free daily cap.
  // Defaults to 'replenishment' (every replenishPhrases call is a top-up).
  generationKind?: "initial" | "replenishment";
}

// In-process dedup: one replenishment per (lock-key prefix + language + category)
// at a time. Callers share the default prefix, so the Free path, the Plus path
// and the manual append path all dedup against each other.
const inFlight = new Map<string, Promise<number>>();

// Generates and appends fresh phrases to an existing lesson, in the
// background. Returns how many phrases were added (0 when another
// replenishment already held the lock, the lesson doesn't exist, the AI
// only produced duplicates, or the topic is already at its ceiling).
// Fire-and-forget: never blocks the HTTP response.
export function replenishPhrases(opts: ReplenishOptions): Promise<number> {
  const prefix = opts.lockKeyPrefix ?? DEFAULT_REPLENISH_LOCK_PREFIX;
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
  const lockPrefix = opts.lockKeyPrefix ?? DEFAULT_REPLENISH_LOCK_PREFIX;

  // Cross-process/device dedup: a session-level Postgres advisory lock keyed
  // on the (prefix, language, category) triple. Every writer to a topic takes
  // this same lock, so only one of them can generate against a snapshot at a
  // time. The prefix stays overridable for tests, but production callers must
  // not vary it: two prefixes on one topic is two writers on one snapshot.
  const lockKey = topicLockKey(languageCode, categoryId, lockPrefix);
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
    // Replenishment only tops up an existing lesson, it never creates one.
    if (!language || !category || !lesson) return 0;

    // Cooldown: if a background replenishment (even one that only produced
    // duplicates and inserted nothing) or the initial lesson build happened
    // recently for this (language, topic), skip. This makes the trigger
    // idempotent under the clients' routine poll/focus refetches instead of
    // re-paying the AI every cycle. Free uses a 24-hour cooldown; Plus uses 10
    // minutes.
    //
    // Manual appends are deliberately EXCLUDED. Lessons are cached globally per
    // (language, topic), so counting one learner's tap here suppressed
    // background top-ups for every other learner on that topic, for a full day
    // on the Free cadence. Manual appends are bounded by their own per-user
    // burst bound instead.
    const since = new Date(Date.now() - cooldownMs);
    const recent = await db
      .select({ id: lessonGenerationsTable.id })
      .from(lessonGenerationsTable)
      .where(
        and(
          eq(lessonGenerationsTable.languageCode, languageCode),
          eq(lessonGenerationsTable.categoryId, categoryId),
          ne(lessonGenerationsTable.kind, "manual"),
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

    // Ceiling check (Free only): if the topic already holds as many phrases as
    // the tier allows, skip without calling the AI.
    //
    // Counted on the VISIBLE-row basis, the same basis the trigger and the
    // manual append path use. Counting every row (including the premium ones a
    // Free learner cannot see) is what made this bail on every live Hindi
    // topic: 40 rows against 8 visible.
    //
    // Zero headroom skips. Partial headroom CLAMPS: a topic two rows short of
    // its ceiling gets two phrases, not a full batch that overshoots it. A
    // ceiling the top-up path can bust is not a ceiling, and the clients now
    // show the number.
    let headroom: number | null = null;
    if (opts.phraseCeiling != null) {
      const countedForCeiling =
        opts.plan != null
          ? countVisiblePhrases(existing, opts.plan)
          : existing.length;
      headroom = Math.max(0, opts.phraseCeiling - countedForCeiling);
      if (headroom === 0) return 0;
    }
    const requested = headroom != null ? Math.min(count, headroom) : count;

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
      count: requested,
    });

    // A real AI generation happened, record it in the existing generation
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
      // The model can hand back more than it was asked for. The ceiling binds
      // what is INSERTED, not what was requested.
      if (headroom != null && fresh.length >= headroom) break;
    }
    if (fresh.length === 0) return 0;

    const startOrder =
      existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;

    // ── D1a Slice 2: insert-time lesson-group assignment (strategy A) ──
    // Fresh phrase-stage rows append to the LAST phrase-stage group while it
    // is below the size cap; overflow creates a new phrase-stage group at
    // (last phrase-stage position + 1), shifting any sentence-stage groups up
    // by one so the Slice 1 invariants hold: stage blocks stay pure and
    // phrase-stage groups keep the lower positions. Everything, the shift,
    // new groups, and the phrase inserts, happens in ONE transaction, so a
    // concurrent unlock-state read can never observe a mid-shift ordering
    // (MVCC: readers see the pre-transaction snapshot until commit). Progress
    // is keyed by group ID, never position, so shifts cannot orphan it.
    // The whole operation also still runs under this topic's advisory lock.
    //
    // Race hardening: the phrase writers now share one topic lock, but the
    // startup regroup backfill still uses its own, so two writers can, rarely,
    // plan the same group positions. The unique
    // constraints then roll back one transaction; we retry once against the
    // fresh state, and as a last resort insert the phrases UNASSIGNED
    // (legal, nullable, surfaces in unassignedCount) rather than crash a
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

    // A duplicate-TEXT violation is not a failure: the topic already holds
    // this phrase, so there is genuinely nothing new to add. It is distinct
    // from the position/group violations the retry ladder below exists for
    // (those mean "the layout moved under us, recompute"), which is why the
    // two are told apart by constraint name rather than by bare 23505.
    // Retrying or falling back to an unassigned insert would only hit the
    // text index again, so both stop here and report zero added.
    const nothingNew = (): number => {
      console.log(
        `Replenishment for ${languageCode}/${categoryId} produced only phrases the topic already holds; nothing added.`,
      );
      return 0;
    };

    try {
      return await insertAssigned();
    } catch (err) {
      if (isDuplicatePhraseTextError(err)) return nothingNew();
      if (!isUniqueViolation(err)) throw err;
      try {
        return await insertAssigned();
      } catch (err2) {
        if (isDuplicatePhraseTextError(err2)) return nothingNew();
        if (!isUniqueViolation(err2)) throw err2;
        try {
          return await insertUnassigned();
        } catch (err3) {
          if (isDuplicatePhraseTextError(err3)) return nothingNew();
          throw err3;
        }
      }
    }
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    }
    client.release();
  }
}
