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
import { db, pool, phrasesTable, lessonGenerationsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import {
  generateAdditionalPhrases,
  type AdditionalPhrasesRequest,
  type GeneratedPhrase,
} from "./lessonGenerator";
import { recordLessonGeneration } from "./lessonLimits";
import { featuresForPlan, type Plan } from "./entitlements";
import type { PhraseStats } from "./progressMetrics";

// A topic is "approaching the end" once this share of its phrases has been
// engaged (attempted at least once or mastered). 0.8 means: with the default
// 8-phrase starter set, replenishment kicks in when the learner has touched 7.
export const REPLENISH_THRESHOLD = 0.8;

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

// Loose key for de-duplicating phrases by their native-script text (shared
// with the manual "Add more phrases" endpoint's guard).
export function phraseKey(nativeScript: string): string {
  return nativeScript.trim().toLowerCase().replace(/\s+/g, " ");
}

// Pure trigger decision: should a fetch of this topic's phrase list kick off
// background replenishment for this caller?
//   - Only Plus (the extended-library plan) ever replenishes — Free and One
//     Language keep their existing gating and daily-cap behavior untouched.
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

export interface ReplenishOptions {
  languageCode: string;
  categoryId: number;
  // Recorded against generation tracking (never blocks: callers are Plus).
  userId: string;
  count?: number;
  // Injectable so tests never call OpenAI.
  generate?: (req: AdditionalPhrasesRequest) => Promise<GeneratedPhrase[]>;
}

// In-process dedup: one replenishment per (language, category) at a time. A
// second trigger while one is running just gets the in-flight promise.
const inFlight = new Map<string, Promise<number>>();

// Generates and appends fresh phrases to an existing lesson, in the
// background. Returns how many phrases were added (0 when another
// replenishment already held the lock, the lesson doesn't exist, or the AI
// only produced duplicates — the latter is not an error: the existing
// "you've mastered everything" experience stays intact). Never touches the
// Free daily-cap check: callers gate on plan via shouldReplenish.
export function replenishPhrases(opts: ReplenishOptions): Promise<number> {
  const key = `${opts.languageCode}:${opts.categoryId}`;
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

  // Cross-process/device dedup: a session-level Postgres advisory lock keyed
  // on the (language, category) pair. If another server (or the manual add
  // endpoint racing us) holds it, we simply skip — the other run's phrases
  // will be there on the next fetch.
  const lockKey = `phrase-replenish:${languageCode}:${categoryId}`;
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
    const since = new Date(Date.now() - REPLENISH_COOLDOWN_MS);
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
    // tracking. Plus has no daily ceiling, so this is bookkeeping only and
    // can never block anyone.
    await recordLessonGeneration(userId, languageCode, categoryId);

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
    const inserted = await db
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
    return inserted.length;
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    }
    client.release();
  }
}
