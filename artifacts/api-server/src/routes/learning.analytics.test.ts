import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  xpLedgerTable,
  userItemMemoryTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import learningRouter from "./learning";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { loadEntitlements } from "../middlewares/loadEntitlements";

// GET /progress/analytics is the deeper, Bolo! Plus-only progress view: it
// assembles a per-category mastery breakdown, a 14-day daily-activity trend, and
// a "phrases due for review" count from a learner's stored attempts. That read
// assembly (rolling attempts up per topic, bucketing them by UTC day, and
// running the Leitner schedule to see what's due) is the most complex in the
// learning router, and unlike the badge wall and progress summary it had no
// route-level test — so a regression in any of those three would quietly show
// Plus learners wrong analytics with nothing to catch it. This drives the real
// handler through the Express router behind the same stub-auth + loadEntitlements
// setup the other route suites use, so a bad bucket, a broken day series, or a
// mis-counted review-due total fails here. It also covers the advancedAnalytics
// feature gate at the route level (a Free learner gets the 402).
//
// All rows are scoped to a throwaway user id + a test-only language code (kept
// distinct from the other route suites so they can share the live Postgres
// without colliding) and cleaned up after — see .agents/memory/api-server-tests.md.
const TEST_USER_ID = "test_analytics_route";
const LANG = "__test_lang_analytics";
const CATEGORY_A_SLUG = "__test_cat_analytics_a";
const CATEGORY_B_SLUG = "__test_cat_analytics_b";

let app: Express;
let server: Server;
let baseUrl: string;

let categoryAId: number;
let categoryBId: number;

// Fixed UTC-midnight anchors for the seeded attempts. Midnight keeps each attempt firmly
// inside its calendar day regardless of a tiny clock skew between seeding here
// and the handler's own `new Date()`, so the day-bucketing and due-date math are
// deterministic. All three days sit inside the handler's 14-day window.
let dayT: Date; // today
let dayT2: Date; // 2 days ago
let dayT5: Date; // 5 days ago
let keyT: string;
let keyT2: string;
let keyT5: string;

async function seedAttempt(
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

async function getJson(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function setTier(tier: "free" | "plus"): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier,
      subscriptionStatus: tier === "plus" ? "active" : null,
      chosenLanguage: null,
    })
    .where(eq(usersTable.id, TEST_USER_ID));
}

before(async () => {
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
  // xp_ledger: the analytics route reads totalXp from here, not from attempts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_ledger (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      source text NOT NULL,
      ref_id text NOT NULL,
      xp integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_xp_ledger_user_source_ref UNIQUE (user_id, source, ref_id)
    );
  `);
  // user_item_memory: the analytics route counts reviewDueCount from here.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_item_memory (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      phrase_id integer NOT NULL REFERENCES phrases(id),
      stability real NOT NULL DEFAULT 0,
      difficulty real NOT NULL DEFAULT 5,
      state text NOT NULL DEFAULT 'new',
      reps integer NOT NULL DEFAULT 0,
      lapses integer NOT NULL DEFAULT 0,
      scheduled_days integer NOT NULL DEFAULT 0,
      due_at timestamptz NOT NULL DEFAULT now(),
      last_review_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_user_item_memory_user_phrase UNIQUE (user_id, phrase_id)
    );
  `);
  // Dev DB can lag migrations; make sure users has every current column
  // (shared shim — see ../lib/testDbCompat).
  await ensureUsersColumns();

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Analytics Test" })
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

  // Two categories so the per-topic breakdown has more than one bucket. The
  // handler orders categories by sort_order, but returns every category row in
  // the DB (not just this language's), so the assertions below look each test
  // category up by id rather than asserting the whole array.
  const [catA] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_A_SLUG,
      title: "Test Topic A",
      description: "Test topic A",
      iconName: "BookOpen",
      accent: "#000000",
      sortOrder: 0,
    })
    .returning();
  const [catB] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_B_SLUG,
      title: "Test Topic B",
      description: "Test topic B",
      iconName: "BookOpen",
      accent: "#000000",
      sortOrder: 1,
    })
    .returning();
  categoryAId = catA.id;
  categoryBId = catB.id;

  const [lessonA] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: catA.id, titleNative: "A" })
    .returning();
  const [lessonB] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: catB.id, titleNative: "B" })
    .returning();

  const mkPhrase = (
    lessonId: number,
    categoryId: number,
    english: string,
    sortOrder: number,
  ) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
  });

  // Topic A: a1, a2 practiced (+ a3 unpracticed). Topic B: b1, b2, b3 practiced.
  const created = await db
    .insert(phrasesTable)
    .values([
      mkPhrase(lessonA.id, catA.id, "a1", 0),
      mkPhrase(lessonA.id, catA.id, "a2", 1),
      mkPhrase(lessonA.id, catA.id, "a3", 2),
      mkPhrase(lessonB.id, catB.id, "b1", 0),
      mkPhrase(lessonB.id, catB.id, "b2", 1),
      mkPhrase(lessonB.id, catB.id, "b3", 2),
    ])
    .returning();
  const p = {
    a1: created[0].id,
    a2: created[1].id,
    a3: created[2].id,
    b1: created[3].id,
    b2: created[4].id,
    b3: created[5].id,
  };

  const now = new Date();
  // Anchor each seeded day at 00:00 UTC (not midday): today's miss (b2) has a
  // 0-day Leitner interval, so its due-time equals its attempt time. Seeding
  // at midday made the "due right now" assertion depend on whether the test
  // ran before or after 12:00 UTC. Midnight has always passed, so the due
  // check is deterministic while the day-bucket keys stay the same.
  const dayStart = (offset: number): Date =>
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - offset,
        0,
        0,
        0,
      ),
    );
  dayT = dayStart(0);
  dayT2 = dayStart(2);
  dayT5 = dayStart(5);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  keyT = dayKey(dayT);
  keyT2 = dayKey(dayT2);
  keyT5 = dayKey(dayT5);

  // Start clean, then seed a known attempt history across two topics and three
  // days. Best score >= 80 => mastered (and removed from review). Review is due
  // when a practiced-but-unmastered phrase's Leitner due-date has passed:
  //   a1: [100 @T-2]            best 100 -> mastered (skipped by review)
  //   a2: [50  @T-5]            best 50  -> unmastered; miss => level 0,
  //                             interval 0d => due at T-5 <= now => DUE
  //   a3: no attempts          -> counts toward Topic A phraseCount only
  //   b1: [70 @T-2, 90 @T]      best 90  -> mastered (skipped by review)
  //   b2: [40 @T]               best 40  -> unmastered; miss => level 0,
  //                             interval 0d => due at T <= now => DUE
  //   b3: [70 @T]               best 70  -> unmastered; pass (>=60) => level 1,
  //                             interval 1d => due at T+1d > now => NOT due
  // => reviewDueCount 2 (a2, b2); totalXp = 100+50+70+90+40+70 = 420.
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  await db.delete(userItemMemoryTable).where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  await seedAttempt(p.a1, 100, dayT2);
  await seedAttempt(p.a2, 50, dayT5);
  await seedAttempt(p.b1, 70, dayT2);
  await seedAttempt(p.b1, 90, dayT);
  await seedAttempt(p.b2, 40, dayT);
  await seedAttempt(p.b3, 70, dayT);

  // Seed XP ledger: the analytics route reads totalXp from xp_ledger.
  // Sum: 100+50+70+90+40+70 = 420, matching the seeded attempt scores.
  await db.insert(xpLedgerTable).values([
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "an-a1", xp: 100 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "an-a2", xp: 50 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "an-b1a", xp: 70 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "an-b1b", xp: 90 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "an-b2", xp: 40 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "an-b3", xp: 70 },
  ]).onConflictDoNothing();

  // Seed FSRS memory: the analytics route counts reviewDueCount from userItemMemoryTable.
  // a2 and b2 are unmastered and due now; a1/b1 are mastered (no memory row needed);
  // b3 passed at level 1 so it's scheduled for tomorrow (not due) — no memory row.
  await db.insert(userItemMemoryTable).values([
    { userId: TEST_USER_ID, phraseId: p.a2, reps: 1, stability: 1, dueAt: dayT5 },
    { userId: TEST_USER_ID, phraseId: p.b2, reps: 1, stability: 1, dueAt: dayT },
  ]).onConflictDoNothing();

  await setTier("plus");

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

after(async () => {
  // Guard every step so a failure during setup (e.g. before `server` was
  // assigned) can't throw a secondary error that masks the real cause. Cleanup
  // is best-effort; the pool is always closed at the end.
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ).catch(() => {});
  }
  try {
    await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
    // xp_ledger and user_item_memory reference users + phrases — delete before those tables.
    await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
    await db.delete(userItemMemoryTable).where(eq(userItemMemoryTable.userId, TEST_USER_ID));
    // FK order: phrases → lessons → categories, then the language + user.
    await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
    await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
    await db
      .delete(categoriesTable)
      .where(eq(categoriesTable.slug, CATEGORY_A_SLUG));
    await db
      .delete(categoriesTable)
      .where(eq(categoriesTable.slug, CATEGORY_B_SLUG));
    await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
    await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  } finally {
    await pool.end();
  }
});

test("GET /progress/analytics builds the per-topic mastery breakdown", async () => {
  await setTier("plus");
  const { status, json } = await getJson(
    `/progress/analytics?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.equal(json.languageCode, LANG);
  assert.equal(json.totalXp, 420);

  const byId = new Map<number, any>(
    json.categories.map((c: any) => [c.categoryId, c]),
  );

  // Topic A: 3 phrases (a1, a2, a3), 2 practiced (a1, a2), 1 mastered (a1),
  // average over its attempts (100, 50) = round(150/2) = 75.
  const a = byId.get(categoryAId);
  assert.ok(a, "Topic A should be in the breakdown");
  assert.equal(a.title, "Test Topic A");
  assert.equal(a.phraseCount, 3);
  assert.equal(a.practicedCount, 2);
  assert.equal(a.masteredCount, 1);
  assert.equal(a.averageScore, 75);

  // Topic B: 3 phrases (b1, b2, b3), all 3 practiced, 1 mastered (b1),
  // average over its attempts (70, 90, 40, 70) = round(270/4) = 68.
  const b = byId.get(categoryBId);
  assert.ok(b, "Topic B should be in the breakdown");
  assert.equal(b.title, "Test Topic B");
  assert.equal(b.phraseCount, 3);
  assert.equal(b.practicedCount, 3);
  assert.equal(b.masteredCount, 1);
  assert.equal(b.averageScore, 68);
});

test("GET /progress/analytics builds the 14-day daily activity trend", async () => {
  await setTier("plus");
  const { status, json } = await getJson(
    `/progress/analytics?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);

  // Always a full 14-day window, oldest first, ending today.
  assert.equal(json.daily.length, 14);
  assert.equal(json.daily[13].date, keyT);
  for (let i = 1; i < json.daily.length; i++) {
    assert.ok(
      json.daily[i - 1].date < json.daily[i].date,
      "daily series must be sorted oldest-first",
    );
  }

  const byDate = new Map<string, any>(
    json.daily.map((d: any) => [d.date, d]),
  );

  // T-5: only a2 (50) -> 1 attempt, avg 50.
  assert.equal(byDate.get(keyT5).attempts, 1);
  assert.equal(byDate.get(keyT5).averageScore, 50);

  // T-2: a1 (100) + b1 (70) -> 2 attempts, avg round(170/2) = 85.
  assert.equal(byDate.get(keyT2).attempts, 2);
  assert.equal(byDate.get(keyT2).averageScore, 85);

  // T: b1 (90) + b2 (40) + b3 (70) -> 3 attempts, avg round(200/3) = 67.
  assert.equal(byDate.get(keyT).attempts, 3);
  assert.equal(byDate.get(keyT).averageScore, 67);

  // A day with no attempts reports zeros, not a gap.
  const totalSeeded = json.daily.reduce(
    (sum: number, d: any) => sum + d.attempts,
    0,
  );
  assert.equal(totalSeeded, 6);
});

test("GET /progress/analytics counts only practiced-but-unmastered phrases that are due", async () => {
  await setTier("plus");
  const { status, json } = await getJson(
    `/progress/analytics?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  // a2 (miss, due now) and b2 (miss, due now) count; a1/b1 are mastered (never
  // due); b3 passed and is scheduled a day out, so it is not yet due.
  assert.equal(json.reviewDueCount, 2);
});

test("GET /progress/analytics requires a language", async () => {
  await setTier("plus");
  const { status } = await getJson("/progress/analytics");
  assert.equal(status, 400);
});

test("GET /progress/analytics gates Free learners with a 402 upgrade_required", async () => {
  await setTier("free");
  const { status, json } = await getJson(
    `/progress/analytics?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.upgradeRequired, true);
  assert.equal(json.reason, "feature_locked");
  assert.equal(json.feature, "advancedAnalytics");
  assert.equal(json.requiredPlan, "plus");
});
