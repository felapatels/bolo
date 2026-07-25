import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  pool,
  lessonsTable,
  phrasesTable,
  categoriesTable,
  languagesTable,
  lessonGenerationsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  shouldReplenish,
  shouldReplenishFree,
  replenishPhrases,
  REPLENISH_THRESHOLD,
  REPLENISH_BATCH_SIZE,
  FREE_PHRASE_CEILING,
  FREE_REPLENISH_COOLDOWN_MS,
} from "../lib/phraseReplenisher";
import { buildPhraseStats, type PhraseStats } from "../lib/progressMetrics";
import type {
  AdditionalPhrasesRequest,
  GeneratedPhrase,
} from "../lib/lessonGenerator";
import {
  countLessonGenerationsToday,
  dailyLessonCapDenial,
} from "../lib/lessonLimits";
import type { ResolvedPlan } from "../lib/entitlements";

// Covers the Plus auto-replenishment contract:
//   - the pure trigger: Plus-only, fires only once the learner has engaged
//     REPLENISH_THRESHOLD of the topic's phrases (Free/One Language never fire),
//   - the background generation: appends fresh phrases to the existing lesson,
//   - dedup: concurrent triggers for the same (language, topic) generate once,
//   - duplicates-only output adds nothing (the "mastered everything" path),
//   - Free users are unaffected: replenishment never consumes the Free daily cap.
//
// Rows are scoped to a test-only language code + category and cleaned up after,
// following the shared-database convention in the other api-server tests.
const LANG = "__test_lang_replenish";
const USER = "__test_user_replenish";
let categoryId: number;
let lessonId: number;

function makeStats(
  ids: number[],
  engagedCount: number,
  score = 90,
): Map<number, PhraseStats> {
  return buildPhraseStats(
    ids.slice(0, engagedCount).map((id) => ({ phraseId: id, score })),
  );
}

function makeGenerator(phrases: GeneratedPhrase[]): {
  generate: (req: AdditionalPhrasesRequest) => Promise<GeneratedPhrase[]>;
  calls: () => number;
} {
  let count = 0;
  return {
    generate: async () => {
      count += 1;
      // Simulate real latency so concurrent triggers overlap.
      await new Promise((r) => setTimeout(r, 25));
      return phrases;
    },
    calls: () => count,
  };
}

const SEED_PHRASES = [
  { nativeScript: "eka", romanized: "eka", english: "one" },
  { nativeScript: "be", romanized: "be", english: "two" },
  { nativeScript: "tran", romanized: "tran", english: "three" },
  { nativeScript: "chaar", romanized: "chaar", english: "four" },
];

async function resetLessonPhrases(): Promise<number[]> {
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  const rows = await db
    .insert(phrasesTable)
    .values(
      SEED_PHRASES.map((p, i) => ({
        lessonId,
        languageCode: LANG,
        categoryId,
        ...p,
        difficulty: 1,
        sortOrder: i,
        stage: "phrase",
      })),
    )
    .returning({ id: phrasesTable.id });
  return rows.map((r) => r.id);
}

before(async () => {
  await db
    .insert(usersTable)
    .values({ id: USER, displayName: "Replenish Test" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Test Language",
      nativeName: "T",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: "__test_slug_replenish",
      title: "Numbers",
      description: "Counting",
      iconName: "hash",
      accent: "#123456",
      sortOrder: 999,
    })
    .onConflictDoUpdate({
      target: categoriesTable.slug,
      set: { title: "Numbers" },
    })
    .returning();
  categoryId = category.id;
  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Numbers" })
    .onConflictDoNothing()
    .returning();
  lessonId = lesson.id;
});

beforeEach(async () => {
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, USER));
});

after(async () => {
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, USER));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, USER));
  await pool.end();
});

// ---------------------------------------------------------------------------
// Pure trigger decision
// ---------------------------------------------------------------------------

test("shouldReplenish fires for Plus once the engagement threshold is crossed", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const needed = Math.ceil(ids.length * REPLENISH_THRESHOLD);
  assert.equal(shouldReplenish("plus", ids, makeStats(ids, needed)), true);
  // Attempted-but-not-mastered engagement counts too.
  assert.equal(
    shouldReplenish("plus", ids, makeStats(ids, needed, 40)),
    true,
  );
});

test("shouldReplenish fires for Plus at exactly 60 % engagement (lowered threshold)", () => {
  // 5 of 8 phrases engaged = 62.5 % → should fire (new 0.6 threshold).
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(shouldReplenish("plus", ids, makeStats(ids, 5)), true);
});

test("shouldReplenish stays quiet for Plus below 60 % engagement", () => {
  // 4 of 8 = 50 % → should not fire.
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(shouldReplenish("plus", ids, makeStats(ids, 4)), false);
  assert.equal(shouldReplenish("plus", [], new Map()), false);
});

test("shouldReplenish never fires for Free or One Language", () => {
  const ids = [1, 2, 3, 4];
  const stats = makeStats(ids, 4);
  assert.equal(shouldReplenish("free", ids, stats), false);
  assert.equal(shouldReplenish("one_language", ids, stats), false);
});

// ---------------------------------------------------------------------------
// Free-tier trigger: shouldReplenishFree
// ---------------------------------------------------------------------------

test("shouldReplenishFree fires for Free user below ceiling at 80 % engagement", () => {
  // 8 phrases, 7 engaged (87.5 %) — below FREE_PHRASE_CEILING, should fire.
  const ids = Array.from({ length: 8 }, (_, i) => i + 1);
  assert.equal(shouldReplenishFree("free", ids, makeStats(ids, 7)), true);
  // One Language also benefits.
  assert.equal(
    shouldReplenishFree("one_language", ids, makeStats(ids, 7)),
    true,
  );
});

test("shouldReplenishFree stays quiet for Free user below 80 % engagement", () => {
  // 6 of 8 = 75 % → below the Free trigger threshold.
  const ids = Array.from({ length: 8 }, (_, i) => i + 1);
  assert.equal(shouldReplenishFree("free", ids, makeStats(ids, 6)), false);
  assert.equal(shouldReplenishFree("free", [], new Map()), false);
});

test("shouldReplenishFree stays quiet when phrase count is at or above the ceiling", () => {
  // At exactly FREE_PHRASE_CEILING — the ceiling guard must prevent a trigger.
  const ids = Array.from({ length: FREE_PHRASE_CEILING }, (_, i) => i + 1);
  const stats = makeStats(ids, ids.length); // 100 % engaged
  assert.equal(shouldReplenishFree("free", ids, stats), false);

  // One above the ceiling — also must not fire.
  const above = Array.from({ length: FREE_PHRASE_CEILING + 1 }, (_, i) => i + 1);
  assert.equal(
    shouldReplenishFree("free", above, makeStats(above, above.length)),
    false,
  );
});

test("shouldReplenishFree never fires for Plus (Plus has its own path)", () => {
  const ids = Array.from({ length: 8 }, (_, i) => i + 1);
  assert.equal(shouldReplenishFree("plus", ids, makeStats(ids, 8)), false);
});

test("replenishPhrases with Free options respects the phrase ceiling", async () => {
  // Seed exactly FREE_PHRASE_CEILING phrases so the ceiling guard fires.
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  const ceilingPhrases = Array.from({ length: FREE_PHRASE_CEILING }, (_, i) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: `word-${i}`,
    romanized: `word-${i}`,
    english: `word ${i}`,
    difficulty: 1,
    sortOrder: i,
    stage: "phrase" as const,
  }));
  await db.insert(phrasesTable).values(ceilingPhrases);

  const gen = makeGenerator([
    { nativeScript: "extra", romanized: "extra", english: "extra", difficulty: 1 },
  ]);
  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: USER,
    generate: gen.generate,
    cooldownMs: FREE_REPLENISH_COOLDOWN_MS,
    phraseCeiling: FREE_PHRASE_CEILING,
    lockKeyPrefix: "phrase-replenish-free",
  });
  assert.equal(added, 0, "ceiling guard must block generation");
  assert.equal(gen.calls(), 0, "AI must not be called when at ceiling");
});

// ---------------------------------------------------------------------------
// Background generation against the live schema (generator injected)
// ---------------------------------------------------------------------------

test("replenishPhrases appends fresh phrases to the existing lesson", async () => {
  await resetLessonPhrases();
  const gen = makeGenerator([
    { nativeScript: "paanch", romanized: "paanch", english: "five", difficulty: 2 },
    { nativeScript: "chha", romanized: "chha", english: "six", difficulty: 2 },
  ]);

  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: USER,
    generate: gen.generate,
  });
  assert.equal(added, 2);
  assert.equal(gen.calls(), 1);

  const all = await db.query.phrasesTable.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.languageCode, LANG),
    orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
  });
  assert.equal(all.length, SEED_PHRASES.length + 2);
  // Appended after the existing set, on the same lesson, in the phrase stage.
  const appended = all.slice(SEED_PHRASES.length);
  assert.deepEqual(
    appended.map((p) => p.english),
    ["five", "six"],
  );
  for (const p of appended) {
    assert.equal(p.lessonId, lessonId);
    assert.equal(p.stage, "phrase");
  }
  assert.equal(appended[0].sortOrder, SEED_PHRASES.length);
});

test("concurrent triggers for the same topic generate exactly once", async () => {
  await resetLessonPhrases();
  const gen = makeGenerator([
    { nativeScript: "saat", romanized: "saat", english: "seven", difficulty: 2 },
  ]);
  const opts = {
    languageCode: LANG,
    categoryId,
    userId: USER,
    generate: gen.generate,
  };
  const results = await Promise.all([
    replenishPhrases(opts),
    replenishPhrases(opts),
    replenishPhrases(opts),
  ]);
  assert.equal(gen.calls(), 1);
  // One trigger did the work; the rest coalesced onto the same run.
  assert.deepEqual(results, [1, 1, 1]);
  const all = await db.query.phrasesTable.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.languageCode, LANG),
  });
  assert.equal(all.length, SEED_PHRASES.length + 1);
});

test("a duplicates-only generation adds nothing (mastered-everything path)", async () => {
  await resetLessonPhrases();
  // The model echoes existing phrases (with whitespace/case noise) and
  // duplicates within its own batch.
  const gen = makeGenerator([
    { nativeScript: "  Eka ", romanized: "eka", english: "one", difficulty: 1 },
    { nativeScript: "BE", romanized: "be", english: "two", difficulty: 1 },
  ]);
  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: USER,
    generate: gen.generate,
  });
  assert.equal(added, 0);
  const all = await db.query.phrasesTable.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.languageCode, LANG),
  });
  assert.equal(all.length, SEED_PHRASES.length);
});

test("a zero-add run starts the cooldown: repeated fetch triggers don't re-generate", async () => {
  await resetLessonPhrases();
  // First run: the model only echoes existing phrases — nothing inserted, but
  // the attempt is recorded.
  const dupGen = makeGenerator([
    { nativeScript: "eka", romanized: "eka", english: "one", difficulty: 1 },
  ]);
  assert.equal(
    await replenishPhrases({
      languageCode: LANG,
      categoryId,
      userId: USER,
      generate: dupGen.generate,
    }),
    0,
  );
  assert.equal(dupGen.calls(), 1);

  // Every subsequent trigger inside the cooldown window (the clients poll the
  // list every 30s) must skip the AI entirely — sequentially, not just while
  // overlapping.
  const laterGen = makeGenerator([
    { nativeScript: "nav", romanized: "nav", english: "nine", difficulty: 2 },
  ]);
  for (let i = 0; i < 3; i++) {
    assert.equal(
      await replenishPhrases({
        languageCode: LANG,
        categoryId,
        userId: USER,
        generate: laterGen.generate,
      }),
      0,
    );
  }
  assert.equal(laterGen.calls(), 0);
  assert.equal(await countLessonGenerationsToday(USER), 1);
});

test("a successful add also cools down immediate re-triggers", async () => {
  await resetLessonPhrases();
  const gen = makeGenerator([
    { nativeScript: "das", romanized: "das", english: "ten", difficulty: 2 },
  ]);
  const opts = {
    languageCode: LANG,
    categoryId,
    userId: USER,
    generate: gen.generate,
  };
  assert.equal(await replenishPhrases(opts), 1);
  assert.equal(await replenishPhrases(opts), 0);
  assert.equal(gen.calls(), 1);
});

test("replenishment skips quietly when the lesson doesn't exist", async () => {
  const gen = makeGenerator([
    { nativeScript: "x", romanized: "x", english: "x", difficulty: 1 },
  ]);
  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId: -1,
    userId: USER,
    generate: gen.generate,
  });
  assert.equal(added, 0);
  assert.equal(gen.calls(), 0);
});

// ---------------------------------------------------------------------------
// Free users unaffected: the cap math never blocks a Plus replenishment, and
// the recorded generation is bookkeeping only.
// ---------------------------------------------------------------------------

test("replenishment records generation tracking but never hits a cap for Plus", async () => {
  await resetLessonPhrases();
  const gen = makeGenerator([
    { nativeScript: "aath", romanized: "aath", english: "eight", difficulty: 2 },
  ]);
  await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: USER,
    generate: gen.generate,
  });
  // The real AI cost is tracked...
  assert.equal(await countLessonGenerationsToday(USER), 1);
  // ...but a Plus caller is never denied by the daily cap, however many
  // background replenishments have run.
  const plus: ResolvedPlan = {
    plan: "plus",
    status: "active",
    trialEndsAt: null,
    currentPeriodEnd: null,
    chosenLanguage: null,
    pauseUntil: null,
  };
  assert.equal(await dailyLessonCapDenial(plus, USER), null);
});
