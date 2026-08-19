import { test, before, after } from "node:test";
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
  lessonGroupsTable,
  phrasesTable,
  xpLedgerTable,
  userItemMemoryTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { BADGE_CATALOG } from "../lib/badges";
import { ensureUsersColumns } from "../lib/testDbCompat";

// The read endpoints learners actually look at, the badge wall (GET /badges)
// and the progress summary (GET /progress/summary), assemble earned/locked
// badge status, earned dates, XP, streak, mastery counts, and averages from a
// learner's stored attempts and badge rows. A regression in how those numbers
// are stitched together would quietly show learners the wrong progress with
// nothing to catch it. This drives both handlers through the real Express router
// against the live schema (behind a stub auth middleware that sets req.userId,
// exactly like attempts.test.ts) so a bad column or broken wire-up fails here.
//
// All rows are scoped to a throwaway user id + a test-only language code (kept
// distinct from the other route suites so they can share the live Postgres
// without colliding) and cleaned up after, see .agents/memory/api-server-tests.md.
const TEST_USER_ID = "test_progress_route";
const LANG = "__test_lang_progress";
const CATEGORY_SLUG = "__test_cat_progress";

let app: Express;
let server: Server;
let baseUrl: string;

// Phrase ids created as fixtures. The scores seeded against them below drive
// every metric the two endpoints report.
let phrase: {
  a: number; // best 100 -> mastered
  b: number; // best 90  -> mastered
  c: number; // best 50  -> practiced, not mastered
  d: number; // best 70  -> practiced, not mastered
  unpracticed: number; // no attempts -> counts toward totalPhrases only
};

// A fixed earned-at we can assert the endpoint echoes back verbatim.
const EARNED_AT = new Date("2026-01-15T10:00:00.000Z");

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

async function getJson(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  // These tables may not have been migrated into this database yet. Provision
  // exactly what the handlers touch, mirroring the drizzle schema, so the test
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
  // Task #1081: the DAY STREAK is now earned by COMPLETING A LESSON (or
  // playing a mini-game), so the streak this suite asserts needs a real
  // lesson group for the attempts to finish off.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_groups (
      id serial PRIMARY KEY,
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      position integer NOT NULL,
      title text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS lesson_group_id integer REFERENCES lesson_groups(id)`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS lesson_group_position integer`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'phrase'`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false`,
  );
  // xp_ledger: the progress/summary and /badges routes read xp from here, not attempts.
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

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Progress Test" })
    .onConflictDoNothing();
  // The progress + badge reads gate non-Hindi languages behind Bolo! Plus, so
  // make the test user Plus to exercise the read assembly rather than the gate.
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
  // One station, holding phrases a and b. Clearing BOTH in a day is what earns
  // a streak day now; c, d and the unpracticed phrase sit outside any station
  // so no amount of practice on them can anchor one.
  const [group] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: category.id, position: 1 })
    .returning();
  const mkPhrase = (
    english: string,
    sortOrder: number,
    lessonGroupId: number | null = null,
  ) => ({
    lessonId: lesson.id,
    languageCode: LANG,
    categoryId: category.id,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
    lessonGroupId,
    lessonGroupPosition: lessonGroupId == null ? null : sortOrder + 1,
  });
  const created = await db
    .insert(phrasesTable)
    .values([
      mkPhrase("a", 0, group!.id),
      mkPhrase("b", 1, group!.id),
      mkPhrase("c", 2),
      mkPhrase("d", 3),
      mkPhrase("unpracticed", 4),
    ])
    .returning();
  phrase = {
    a: created[0].id,
    b: created[1].id,
    c: created[2].id,
    d: created[3].id,
    unpracticed: created[4].id,
  };

  // Start clean, then seed a known attempt history (all "today" so streak and
  // attemptsToday are deterministic):
  //   a: [100]      best 100 -> mastered
  //   b: [90, 40]   best 90  -> mastered
  //   c: [50]       best 50  -> practiced, not mastered
  //   d: [70, 30]   best 70  -> practiced, not mastered
  //   unpracticed:  no attempts
  // => totalAttempts 6, phrasesPracticed 4, phrasesMastered 2, bestScore 100,
  //    xp 380, averageScore round(380/6)=63, streak 1, attemptsToday 6.
  // The streak is 1 because a and b, the whole of station 1, both clear the
  // item rule today (100, and best-of-day 90); c and d belong to no station,
  // so their attempts contribute nothing to it.
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  await seedAttempt(phrase.a, 100);
  await seedAttempt(phrase.b, 90);
  await seedAttempt(phrase.b, 40);
  await seedAttempt(phrase.c, 50);
  await seedAttempt(phrase.d, 70);
  await seedAttempt(phrase.d, 30);

  // Seed XP ledger: the progress/summary route reads xp from xp_ledger, not attempts.
  // Sum: 100+90+40+50+70+30 = 380, matching the seeded attempt scores.
  await db.insert(xpLedgerTable).values([
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "pr-a", xp: 100 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "pr-b1", xp: 90 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "pr-b2", xp: 40 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "pr-c", xp: 50 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "pr-d1", xp: 70 },
    { userId: TEST_USER_ID, languageCode: LANG, source: "bootstrap", refId: "pr-d2", xp: 30 },
  ]).onConflictDoNothing();

  // Persist a known set of earned badges. The /badges earned flag reads from
  // these rows (not from live metrics), so this fixes exactly which come back
  // earned regardless of what the current metrics would newly satisfy.
  await db.insert(badgesTable).values(
    ["first_phrase", "mastery_1", "perfect_100"].map((badgeKey) => ({
      userId: TEST_USER_ID,
      languageCode: LANG,
      badgeKey,
      earnedAt: EARNED_AT,
    })),
  );

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
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  // xp_ledger references users and languages, delete before those tables.
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  // FK order: user_item_memory → phrases → lesson groups → lessons → category,
  // then language + user. The memory rows MUST go before phrases: they carry a
  // FK to phrase_id, and leaving them behind fails the phrase delete.
  await db
    .delete(userItemMemoryTable)
    .where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("GET /badges annotates the full catalog with earned status, dates, and live progress", async () => {
  const { status, json } = await getJson(
    `/badges?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);

  // Every catalog badge comes back exactly once, in catalog order.
  assert.equal(json.length, BADGE_CATALOG.length);
  assert.deepEqual(
    json.map((b: any) => b.key),
    BADGE_CATALOG.map((b) => b.key),
  );

  const byKey = new Map<string, any>(json.map((b: any) => [b.key, b]));

  // The three persisted badges read as earned, with the stored earnedAt echoed.
  for (const key of ["first_phrase", "mastery_1", "perfect_100"]) {
    const b = byKey.get(key);
    assert.equal(b.earned, true, `${key} should be earned`);
    assert.equal(b.earnedAt, EARNED_AT.toISOString(), `${key} earnedAt`);
  }

  // Everything else is locked with no earned date, even badges the current
  // metrics would satisfy (e.g. the user has attempts but hasn't been awarded
  // phrases_10). Earned status is driven by the stored rows, not live metrics.
  for (const def of BADGE_CATALOG) {
    if (["first_phrase", "mastery_1", "perfect_100"].includes(def.key)) continue;
    const b = byKey.get(def.key);
    assert.equal(b.earned, false, `${def.key} should be locked`);
    assert.equal(b.earnedAt, null, `${def.key} earnedAt should be null`);
  }

  // Live progress is min(metric, target)/target, from the seeded attempts:
  // metrics = totalAttempts 6, phrasesPracticed 4, phrasesMastered 2,
  // bestScore 100, xp 380, currentStreakDays 1.
  const expectProgress = (
    key: string,
    current: number,
    target: number,
  ): void => {
    const b = byKey.get(key);
    assert.equal(b.progressCurrent, current, `${key} progressCurrent`);
    assert.equal(b.progressTarget, target, `${key} progressTarget`);
  };
  expectProgress("first_phrase", 1, 1); // totalAttempts 6 capped at 1
  expectProgress("phrases_10", 4, 10); // phrasesPracticed 4
  expectProgress("phrases_50", 4, 50);
  expectProgress("mastery_1", 1, 1); // phrasesMastered 2 capped at 1
  expectProgress("mastery_10", 2, 10);
  expectProgress("mastery_25", 2, 25);
  expectProgress("streak_3", 1, 3); // currentStreakDays 1
  expectProgress("xp_500", 380, 500); // xp 380
  expectProgress("xp_5000", 380, 5000);
  expectProgress("perfect_100", 100, 100); // bestScore 100

  // The static catalog fields (title/description/iconName) are carried through.
  for (const def of BADGE_CATALOG) {
    const b = byKey.get(def.key);
    assert.equal(b.title, def.title);
    assert.equal(b.description, def.description);
    assert.equal(b.iconName, def.iconName);
  }
});

test("GET /badges requires a language", async () => {
  const { status } = await getJson("/badges");
  assert.equal(status, 400);
});

test("GET /progress/summary reports the computed per-language numbers", async () => {
  const { status, json } = await getJson(
    `/progress/summary?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);

  assert.equal(json.totalAttempts, 6);
  assert.equal(json.phrasesPracticed, 4);
  assert.equal(json.phrasesMastered, 2);
  assert.equal(json.totalPhrases, 5); // 4 practiced + 1 unpracticed fixture
  assert.equal(json.bestScore, 100);
  assert.equal(json.averageScore, 63); // round((100+90+40+50+70+30)/6)
  assert.equal(json.xp, 380);
  // All attempts were seeded "today" (UTC). attemptsToday counts every one of
  // them; the streak counts the DAY, earned by finishing station 1 (Task #1081).
  assert.equal(json.currentStreakDays, 1);
  assert.equal(json.attemptsToday, 6);
});

test("GET /progress/summary counts the phrases due for review", async () => {
  // The reminder copy is built from this number, so it has to mean exactly what
  // GET /review/phrases would hand back: practiced at least once, not yet
  // mastered, and due now. Each row below fails one of those three, except the
  // first, so a filter that goes missing changes the count.
  const seeded = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.languageCode, LANG));
  assert.ok(seeded.length >= 4, "fixture needs at least 4 phrases");

  const past = new Date(Date.now() - 60 * 60 * 1000);
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(userItemMemoryTable).values([
    // Counts: practiced, not mastered, overdue.
    { userId: TEST_USER_ID, phraseId: seeded[0].id, reps: 3, stability: 2, dueAt: past },
    // Excluded: not due yet.
    { userId: TEST_USER_ID, phraseId: seeded[1].id, reps: 3, stability: 2, dueAt: future },
    // Excluded: stability >= 21 means mastered, not in need of review.
    { userId: TEST_USER_ID, phraseId: seeded[2].id, reps: 9, stability: 30, dueAt: past },
    // Excluded: never actually practiced, so it is new rather than due.
    { userId: TEST_USER_ID, phraseId: seeded[3].id, reps: 0, stability: 0, dueAt: past },
  ]);

  try {
    const { status, json } = await getJson(
      `/progress/summary?lang=${encodeURIComponent(LANG)}`,
    );
    assert.equal(status, 200);
    assert.equal(json.dueCount, 1);
  } finally {
    await db
      .delete(userItemMemoryTable)
      .where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  }
});

test("GET /progress/summary reports no reviews due when nothing is scheduled", async () => {
  const { status, json } = await getJson(
    `/progress/summary?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  // 0, never undefined: the client treats an absent count as "unknown" and
  // falls back to streak-only copy, which would be wrong here.
  assert.equal(json.dueCount, 0);
});

test("GET /progress/summary requires a language", async () => {
  const { status } = await getJson("/progress/summary");
  assert.equal(status, 400);
});
