import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  badgesTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  userAbilityTable,
  userItemMemoryTable,
  xpLedgerTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { signEvaluation } from "../lib/evaluationToken";
import { ensureUsersColumns } from "../lib/testDbCompat";

// This exercises the real POST /attempts route handler end to end — token
// verification, the attempt insert, per-language metric computation, and badge
// awarding are all wired together in one handler, and none of that is covered by
// the pure-unit tests around its helpers. Driving it through the actual Express
// router against the live schema means a regression there (a bad column, a
// schema mismatch, a broken wire-up) fails here instead of 500-ing real
// practice with nothing to catch it.
//
// The suite mounts the learning router behind a stub auth middleware that sets
// req.userId exactly like requireAuth does, so the handler runs unchanged. All
// rows are scoped to a throwaway user id + a test-only language code and cleaned
// up after, and SESSION_SECRET must be set for signEvaluation/verifyEvaluation.
const TEST_USER_ID = "test_attempts_route";
const LANG = "__test_lang_attempts";
const CATEGORY_SLUG = "__test_cat_attempts";

let app: Express;
let server: Server;
let baseUrl: string;

// Phrase ids created as fixtures for the review-endpoint tests. `weakLow` and
// `weakHigh` are practiced-but-not-mastered; `mastered` clears the threshold;
// `unpracticed` has no attempts.
let phrase: {
  weakLow: number;
  weakHigh: number;
  mastered: number;
  unpracticed: number;
};

// Records an attempt row directly (bypassing the token route) so review tests
// can set up arbitrary best-score histories per phrase.
async function seedAttempt(phraseId: number, score: number): Promise<void> {
  await db.insert(attemptsTable).values({
    userId: TEST_USER_ID,
    languageCode: LANG,
    phraseId,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score,
    passed: score >= 80,
    feedback: "x",
  });
}

// Like seedAttempt but pins the attempt's timestamp, so review tests can build
// spaced-repetition histories where a phrase's last practice is in the past.
async function seedAttemptAt(
  phraseId: number,
  score: number,
  createdAt: Date,
): Promise<void> {
  await db.insert(attemptsTable).values({
    userId: TEST_USER_ID,
    languageCode: LANG,
    phraseId,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score,
    passed: score >= 80,
    feedback: "x",
    createdAt,
  });
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function getReviewPhrases(lang: string): Promise<{
  status: number;
  json: any;
}> {
  const res = await fetch(
    `${baseUrl}/review/phrases?lang=${encodeURIComponent(lang)}`,
  );
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function clearRows(): Promise<void> {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  // Scoring-v2 side-effect rows, so per-test assertions on Elo/FSRS start clean.
  await db.delete(userAbilityTable).where(eq(userAbilityTable.userId, TEST_USER_ID));
  await db.delete(userItemMemoryTable).where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
}

async function storedAttempts() {
  return db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, TEST_USER_ID));
}

async function storedBadgeKeys(): Promise<string[]> {
  const rows = await db
    .select({ badgeKey: badgesTable.badgeKey })
    .from(badgesTable)
    .where(
      and(
        eq(badgesTable.userId, TEST_USER_ID),
        eq(badgesTable.languageCode, LANG),
      ),
    );
  return rows.map((r) => r.badgeKey).sort();
}

async function postAttempt(body: unknown): Promise<{
  status: number;
  json: any;
}> {
  const res = await fetch(`${baseUrl}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  assert.ok(
    process.env.SESSION_SECRET,
    "SESSION_SECRET must be set to sign/verify evaluation tokens",
  );

  // These tables may not have been migrated into this database yet. Provision
  // exactly what the handler touches, mirroring the drizzle schema, so the test
  // is self-contained (see .agents/memory/api-server-tests.md).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS languages (
      code text PRIMARY KEY,
      name text NOT NULL,
      native_name text NOT NULL,
      script text NOT NULL,
      font_family text NOT NULL,
      rtl boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      phrase_id integer,
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      transcript text NOT NULL,
      score integer NOT NULL,
      passed boolean NOT NULL,
      feedback text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      badge_key text NOT NULL,
      earned_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT badges_user_language_key_unique
        UNIQUE (user_id, language_code, badge_key)
    );
  `);
  // The review endpoint joins attempts back to phrase content, so provision the
  // category/lesson/phrase tables it reads from too.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text NOT NULL,
      icon_name text NOT NULL,
      accent text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id serial PRIMARY KEY,
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      title_native text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lessons_language_category_unique
        UNIQUE (language_code, category_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phrases (
      id serial PRIMARY KEY,
      lesson_id integer NOT NULL REFERENCES lessons(id),
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      hint text,
      difficulty integer NOT NULL DEFAULT 1,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Attempts Test" })
    .onConflictDoNothing();
  // This suite exercises review ordering + attempt recording, not entitlements.
  // Make the test user Bolo! Plus so the Free-tier gates don't interfere: review
  // is Plus-only and the test language isn't the free (Hindi) language.
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER_ID));
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

  // Category → lesson → phrases fixtures the review endpoint reads content from.
  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Test Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#000000",
    })
    .returning();
  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: category.id, titleNative: "T" })
    .returning();
  const mkPhrase = (english: string, sortOrder: number) => ({
    lessonId: lesson.id,
    languageCode: LANG,
    categoryId: category.id,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
  });
  const created = await db
    .insert(phrasesTable)
    .values([
      mkPhrase("weak-low", 0),
      mkPhrase("weak-high", 1),
      mkPhrase("mastered", 2),
      mkPhrase("unpracticed", 3),
    ])
    .returning();
  phrase = {
    weakLow: created[0].id,
    weakHigh: created[1].id,
    mastered: created[2].id,
    unpracticed: created[3].id,
  };

  // Mount the real learning router behind a stub that injects the authenticated
  // user id the same way requireAuth does, so the handler under test is genuine.
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(clearRows);

after(async () => {
  await clearRows();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  // FK order: scoring-v2 side-effect rows first (they reference the language
  // and phrases), then phrases → lessons → category, then the language + user.
  await db.delete(userAbilityTable).where(eq(userAbilityTable.userId, TEST_USER_ID));
  await db.delete(userItemMemoryTable).where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("records an attempt and persists progress + newly-earned badges", async () => {
  // A perfect first attempt on a phrase satisfies three catalog badges at once:
  // first_phrase (>=1 attempt), mastery_1 (a mastered phrase), and perfect_100
  // (a best score of 100) — a good check that metrics feed badge awarding.
  // audioJudged: since #998, verifyEvaluation clamps transcript-scored tokens
  // above HONESTY_SCORE_CAP (92) to 92 (band re-derived from the capped
  // score); an audio-judged token is the
  // only legitimate way a 100 reaches /attempts, and this doubles as the
  // exemption's end-to-end coverage through the route.
  const token = signEvaluation({
    userId: TEST_USER_ID,
    phraseId: 4242,
    languageCode: LANG,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "hello",
    transcript: "namaste",
    score: 100,
    passed: true,
    feedback: "Perfect!",
    audioJudged: true,
  });

  const { status, json } = await postAttempt({ evaluationToken: token });

  assert.equal(status, 201);
  // The response echoes the server-computed evaluation (not client input).
  assert.equal(json.phraseId, 4242);
  assert.equal(json.languageCode, LANG);
  assert.equal(json.score, 100);
  assert.equal(json.passed, true);
  assert.equal(json.feedback, "Perfect!");
  assert.equal(json.transcript, "namaste");
  assert.ok(!Number.isNaN(Date.parse(json.createdAt)));

  // Newly-earned badges are returned...
  const returnedKeys = json.newlyEarnedBadges.map((b: any) => b.key).sort();
  assert.deepEqual(returnedKeys, ["first_phrase", "mastery_1", "perfect_100"]);
  for (const b of json.newlyEarnedBadges) {
    assert.equal(typeof b.title, "string");
    assert.ok(b.title.length > 0);
    assert.ok(!Number.isNaN(Date.parse(b.earnedAt)));
  }

  // ...and the attempt row is actually persisted with the token's values.
  const attempts = await storedAttempts();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].id, json.id);
  assert.equal(attempts[0].phraseId, 4242);
  assert.equal(attempts[0].score, 100);
  assert.equal(attempts[0].languageCode, LANG);

  // ...and the badges are stored, not just returned.
  assert.deepEqual(await storedBadgeKeys(), [
    "first_phrase",
    "mastery_1",
    "perfect_100",
  ]);
});

test("badge awarding skips nocatch attempts, then fires on the first real attempt", async () => {
  // Build 30 item 1: a nocatch first attempt must not celebrate. Badge
  // criteria key on totalAttempts (no band filter), so before the gate this
  // fired the "First Words" celebration for audio the system never captured.
  const nocatchToken = signEvaluation({
    userId: TEST_USER_ID,
    phraseId: 4242,
    languageCode: LANG,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "hello",
    transcript: "",
    score: 0,
    passed: false,
    feedback: "Our listener glitched on that one.",
    band: "nocatch",
    xpAwarded: 0,
  });
  const first = await postAttempt({ evaluationToken: nocatchToken });
  assert.equal(first.status, 201);
  assert.deepEqual(first.json.newlyEarnedBadges, []);
  assert.deepEqual(await storedBadgeKeys(), []);
  // The attempt insert itself is kept (analytics still records the miss).
  assert.equal((await storedAttempts()).length, 1);

  // The first attempt the system actually heard awards First Words, even
  // though the earlier nocatch row also counts toward totalAttempts.
  const retryToken = signEvaluation({
    userId: TEST_USER_ID,
    phraseId: 4242,
    languageCode: LANG,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "hello",
    transcript: "namste",
    score: 42,
    passed: false,
    feedback: "Keep going!",
  });
  const second = await postAttempt({ evaluationToken: retryToken });
  assert.equal(second.status, 201);
  const returnedKeys = second.json.newlyEarnedBadges.map((b: any) => b.key);
  assert.deepEqual(returnedKeys, ["first_phrase"]);
  assert.equal(second.json.newlyEarnedBadges[0].title, "First Words");
  assert.deepEqual(await storedBadgeKeys(), ["first_phrase"]);
});

test("a nocatch attempt persists for analytics but applies NO learning penalties", async () => {
  // Band 'nocatch' = the system failed to capture usable audio (silence,
  // recognizer script mismatch, or an unsupported-recognition language). The
  // learner must not be penalized: no Elo movement, no FSRS memory write, no
  // phrase exposure bump — but the row itself is stored for analytics.
  const [phraseBefore] = await db
    .select({ exposureCount: phrasesTable.exposureCount })
    .from(phrasesTable)
    .where(eq(phrasesTable.id, 4242));

  const token = signEvaluation({
    userId: TEST_USER_ID,
    phraseId: 4242,
    languageCode: LANG,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "hello",
    transcript: "কি আমাকে", // wrong-script transcript: recognizer failure
    score: 0,
    passed: false,
    feedback: "Our listener glitched on that one.",
    band: "nocatch",
    xpAwarded: 0,
  });

  const { status, json } = await postAttempt({ evaluationToken: token });
  assert.equal(status, 201);
  assert.equal(json.score, 0);

  const attempts = await storedAttempts();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].band, "nocatch");
  // Elo untouched: thetaDelta recorded as 0 and no ability row created.
  assert.equal(attempts[0].thetaDelta, 0);
  const abilityRows = await db
    .select()
    .from(userAbilityTable)
    .where(eq(userAbilityTable.userId, TEST_USER_ID));
  assert.equal(abilityRows.length, 0);
  // FSRS untouched: no rating on the row, no memory row created.
  assert.equal(attempts[0].fsrsRating, null);
  const memoryRows = await db
    .select()
    .from(userItemMemoryTable)
    .where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  assert.equal(memoryRows.length, 0);
  // Exposure count unchanged: nothing was actually heard.
  const [phraseAfter] = await db
    .select({ exposureCount: phrasesTable.exposureCount })
    .from(phrasesTable)
    .where(eq(phrasesTable.id, 4242));
  assert.equal(phraseAfter.exposureCount, phraseBefore.exposureCount);
});

test("a second attempt persists but re-awards no already-earned badge", async () => {
  const makeToken = (phraseId: number) =>
    signEvaluation({
      userId: TEST_USER_ID,
      phraseId,
      languageCode: LANG,
      nativeScript: "dhanyavaad",
      romanized: "dhanyavaad",
      english: "thank you",
      transcript: "dhanyavaad",
      score: 100,
      passed: true,
      feedback: "Great",
      // audioJudged: a raw 100 would clamp to 92 at verify time (#998);
      // perfect_100 requires a stored 100, so it needs the audio-judged
      // exemption.
      audioJudged: true,
    });

  // FIXTURE IDS, NEVER LITERALS (2026-09-01): this test used to sign tokens
  // for phrases 1 and 2, which are dev SEED rows, not ours. The dev database
  // drifted (phrases 1 and 2 no longer exist there), the FSRS upsert's
  // phrase_id foreign key rejected the insert, and the route 500'd — a
  // deterministic failure that said nothing about the code. Every other test
  // in this file already uses the suite's own seeded phrases; attempts are
  // wiped by beforeEach, so any two fixture ids are badge-fresh.
  const first = await postAttempt({
    evaluationToken: makeToken(phrase.weakLow),
  });
  assert.equal(first.status, 201);
  assert.deepEqual(
    first.json.newlyEarnedBadges.map((b: any) => b.key).sort(),
    ["first_phrase", "mastery_1", "perfect_100"],
  );

  // A different phrase, same perfect score: the attempt is recorded, but the
  // starter badges are already held so nothing new is celebrated.
  const second = await postAttempt({
    evaluationToken: makeToken(phrase.weakHigh),
  });
  assert.equal(second.status, 201);
  assert.deepEqual(second.json.newlyEarnedBadges, []);

  assert.equal((await storedAttempts()).length, 2);
  // Still stored exactly once each — no duplicates.
  assert.deepEqual(await storedBadgeKeys(), [
    "first_phrase",
    "mastery_1",
    "perfect_100",
  ]);
});

test("rejects a malformed payload without recording anything", async () => {
  const { status } = await postAttempt({ notAToken: true });
  assert.equal(status, 400);
  assert.equal((await storedAttempts()).length, 0);
});

test("rejects a tampered / unsigned token without recording anything", async () => {
  const { status } = await postAttempt({
    evaluationToken: "not.a.valid.token",
  });
  assert.equal(status, 400);
  assert.equal((await storedAttempts()).length, 0);
});

test("rejects a token minted for another user", async () => {
  // A valid signature but a userId that doesn't match the caller must be
  // rejected, so a token can't be replayed against a different account.
  const token = signEvaluation({
    userId: "someone_else",
    phraseId: 7,
    languageCode: LANG,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 100,
    passed: true,
    feedback: "x",
  });
  const { status } = await postAttempt({ evaluationToken: token });
  assert.equal(status, 400);
  assert.equal((await storedAttempts()).length, 0);
});

test("review returns practiced-but-unmastered phrases, weakest first", async () => {
  // weak-high has a higher best score than weak-low; mastered clears the
  // threshold and unpracticed has no attempts — only the two weak ones should
  // come back, ordered weakest (lowest best score) first.
  await seedAttempt(phrase.weakHigh, 40);
  await seedAttempt(phrase.weakHigh, 70); // best 70, still < 80
  await seedAttempt(phrase.weakLow, 55);
  await seedAttempt(phrase.weakLow, 30); // best 55
  await seedAttempt(phrase.mastered, 90); // best 90 → mastered, excluded

  // The review route queries userItemMemoryTable (FSRS), not attemptsTable, for
  // ordering. Seed memory rows so the route returns these phrases. weakLow gets
  // an earlier dueAt (more overdue) so it appears first in dueAt-asc ordering.
  // mastered has no memory row → excluded by the reps>0 / stability<21 filter.
  await db.insert(userItemMemoryTable).values([
    { userId: TEST_USER_ID, phraseId: phrase.weakLow, reps: 1, stability: 1, dueAt: daysAgo(2) },
    { userId: TEST_USER_ID, phraseId: phrase.weakHigh, reps: 1, stability: 1, dueAt: daysAgo(1) },
  ]);

  const { status, json } = await getReviewPhrases(LANG);
  assert.equal(status, 200);
  assert.deepEqual(
    json.map((p: any) => p.id),
    [phrase.weakLow, phrase.weakHigh],
  );
  // Content needed to practice each phrase comes back, with best-score stats.
  assert.equal(json[0].english, "weak-low");
  assert.equal(json[0].bestScore, 55);
  assert.equal(json[0].mastered, false);
  assert.equal(json[1].bestScore, 70);
});

test("review surfaces a due phrase ahead of a weaker one that was just practiced", async () => {
  // Spaced repetition should override plain weakest-first: weak-high has the
  // higher best score but its last practice is old and overdue, while weak-low
  // is weaker yet was just practiced well (not due again yet). The overdue
  // phrase must come first even though it is the less-weak of the two.
  await seedAttemptAt(phrase.weakHigh, 78, daysAgo(10)); // best 78, long overdue
  await seedAttemptAt(phrase.weakLow, 55, daysAgo(5));
  await seedAttempt(phrase.weakLow, 70); // best 70, passed just now -> not due

  // Seed FSRS memory: weakHigh is very overdue, weakLow is barely due now.
  // The route orders by dueAt asc → weakHigh (10 days overdue) leads.
  await db.insert(userItemMemoryTable).values([
    { userId: TEST_USER_ID, phraseId: phrase.weakHigh, reps: 1, stability: 1, dueAt: daysAgo(10) },
    { userId: TEST_USER_ID, phraseId: phrase.weakLow, reps: 1, stability: 1, dueAt: new Date() },
  ]);

  const { status, json } = await getReviewPhrases(LANG);
  assert.equal(status, 200);
  assert.deepEqual(
    json.map((p: any) => p.id),
    [phrase.weakHigh, phrase.weakLow],
    "the overdue phrase leads even though it is less weak",
  );
});

test("review breaks ties between equally-due phrases weakest-first", async () => {
  // Both phrases are brand-new (never passed, so due immediately) and share an
  // identical last-practice time, so their due dates tie exactly. The lower best
  // score then wins the tie.
  const sameTime = daysAgo(1);
  await seedAttemptAt(phrase.weakHigh, 50, sameTime); // best 50
  await seedAttemptAt(phrase.weakLow, 30, sameTime); // best 30

  // Seed FSRS memory. Give weakLow a 1-second earlier dueAt so the dueAt-asc
  // ordering is deterministic — weakLow leads, matching the "weakest first" expectation.
  await db.insert(userItemMemoryTable).values([
    { userId: TEST_USER_ID, phraseId: phrase.weakLow, reps: 1, stability: 1, dueAt: new Date(sameTime.getTime() - 1000) },
    { userId: TEST_USER_ID, phraseId: phrase.weakHigh, reps: 1, stability: 1, dueAt: sameTime },
  ]);

  const { status, json } = await getReviewPhrases(LANG);
  assert.equal(status, 200);
  assert.deepEqual(
    json.map((p: any) => p.id),
    [phrase.weakLow, phrase.weakHigh],
    "same due date -> weakest first",
  );
});

test("review excludes a phrase once its best score reaches mastery", async () => {
  // A weak attempt then a mastering attempt on the same phrase: it should drop
  // out of review entirely rather than linger on its earlier low score.
  await seedAttempt(phrase.weakLow, 50);
  await seedAttempt(phrase.weakLow, 85);

  const { status, json } = await getReviewPhrases(LANG);
  assert.equal(status, 200);
  assert.deepEqual(json, []);
});

test("review is empty when the learner has practiced nothing", async () => {
  const { status, json } = await getReviewPhrases(LANG);
  assert.equal(status, 200);
  assert.deepEqual(json, []);
});

test("review requires a language", async () => {
  const res = await fetch(`${baseUrl}/review/phrases`);
  assert.equal(res.status, 400);
});
