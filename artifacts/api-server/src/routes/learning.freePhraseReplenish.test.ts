import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  attemptsTable,
  lessonGenerationsTable,
  lessonGroupsTable,
  userItemMemoryTable,
  phraseReportsTable,
  xpLedgerTable,
  userAbilityTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// ── Module mock ──────────────────────────────────────────────────────────────
// Mock generateAdditionalPhrases BEFORE any dynamic import that transitively
// loads phraseReplenisher → lessonGenerator. The test runner is started with
// --experimental-test-module-mocks so mock.module() intercepts ESM loads.
// generateLesson is included because learning.ts imports it from the same
// module; without it the router's static import would fail to resolve.

const mockGenerateAdditional = mock.fn(async () => [
  {
    nativeScript: "नया",
    romanized: "naya",
    english: "new phrase",
    difficulty: 1,
  },
]);

await mock.module("../lib/lessonGenerator", {
  namedExports: {
    generateAdditionalPhrases: mockGenerateAdditional,
    generateLesson: mock.fn(async () => ({
      titleNative: "Test",
      phrases: [
        { nativeScript: "t", romanized: "t", english: "t", difficulty: 1 },
      ],
    })),
    generateSentences: mock.fn(async () => []),
  },
});

// Dynamic imports AFTER mock registration so phraseReplenisher and learning.ts
// see the mocked generateAdditionalPhrases when they are first evaluated.
const { default: learningRouter } = await import("./learning");
const { FREE_PHRASE_CEILING } = await import("../lib/phraseReplenisher");

// ── Fixture identifiers ───────────────────────────────────────────────────────

const TEST_USER_ID = "test_free_replenish_route";
const LANG = "__test_lang_free_replenish_rt";
const CATEGORY_SLUG = "__test_cat_free_replenish_rt";

// Phrase count well below FREE_PHRASE_CEILING (20) so the "fires" test can
// reach 80 % engagement without being blocked by the ceiling guard.
const SEED_COUNT = 8;
// 7 of 8 = 87.5 % ≥ 80 % → shouldReplenishFree returns true.
const ENGAGE_COUNT = 7;

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;
let lessonId: number;

// ── Helpers ───────────────────────────────────────────────────────────────────

// FK-safe cleanup: phrases rows for LANG can be referenced by user_item_memory
// (the api-server startup backfill seeds FSRS memory rows from attempts at
// threshold = 1, so a previous interrupted run + a server boot is enough) and
// by phrase_reports. Deleting phrases without clearing dependents first fails
// with an FK violation. Deletes are guarded with to_regclass so the suite also
// survives a database where those tables have not been provisioned.

async function tableExists(name: string): Promise<boolean> {
  const r = await pool.query("SELECT to_regclass($1) AS reg", [
    `public.${name}`,
  ]);
  return r.rows[0]?.reg !== null;
}

async function deletePhraseDependents(): Promise<void> {
  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.languageCode, LANG));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  if (await tableExists("user_item_memory")) {
    await db
      .delete(userItemMemoryTable)
      .where(inArray(userItemMemoryTable.phraseId, ids));
  }
  if (await tableExists("phrase_reports")) {
    await db
      .delete(phraseReportsTable)
      .where(inArray(phraseReportsTable.phraseId, ids));
  }
}

async function resetPhrases(count: number): Promise<number[]> {
  await deletePhraseDependents();
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  const rows = await db
    .insert(phrasesTable)
    .values(
      Array.from({ length: count }, (_, i) => ({
        lessonId,
        languageCode: LANG,
        categoryId,
        nativeScript: `word-${i}`,
        romanized: `word-${i}`,
        english: `word ${i}`,
        difficulty: 1,
        sortOrder: i,
        stage: "phrase" as const,
      })),
    )
    .returning({ id: phrasesTable.id });
  return rows.map((r) => r.id);
}

async function seedAttempts(
  phraseIds: number[],
  engagedCount: number,
): Promise<void> {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  if (engagedCount === 0) return;
  await db.insert(attemptsTable).values(
    phraseIds.slice(0, engagedCount).map((phraseId) => ({
      userId: TEST_USER_ID,
      languageCode: LANG,
      phraseId,
      nativeScript: "x",
      romanized: "x",
      english: "x",
      transcript: "x",
      score: 90,
      passed: true,
      feedback: "good",
    })),
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(async () => {
  await ensureUsersColumns();

  // Provision tables that may not exist yet on a lagging dev DB.
  // CREATE TABLE IF NOT EXISTS is a no-op when the table is already there.
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

  // Test user: one_language tier with our test language as chosenLanguage.
  // - one_language lacks extendedLibrary → shouldReplenishFree applies.
  // - chosenLanguage = LANG bypasses the language gate for our test language
  //   without needing to use the real Hindi data.
  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, displayName: "Free Replenish Route Test" })
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({
      tier: "one_language",
      subscriptionStatus: "active",
      chosenLanguage: LANG,
    })
    .where(eq(usersTable.id, TEST_USER_ID));

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Test Language Free Replenish",
      nativeName: "T",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [cat] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Numbers",
      description: "Counting",
      iconName: "hash",
      accent: "#abcdef",
      sortOrder: 9998,
    })
    .onConflictDoUpdate({
      target: categoriesTable.slug,
      set: { title: "Numbers" },
    })
    .returning();
  categoryId = cat.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Numbers" })
    .onConflictDoNothing()
    .returning();
  // If the lesson already existed from a previous interrupted run, fetch it.
  if (lesson) {
    lessonId = lesson.id;
  } else {
    const existing = await db.query.lessonsTable.findFirst({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(t.languageCode, LANG), eqFn(t.categoryId, categoryId)),
    });
    lessonId = existing!.id;
  }

  app = express();
  app.use(express.json());
  // Stub auth: inject the test user id exactly like requireAuth does.
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

beforeEach(async () => {
  // Clear generation records so the 24-hour Free cooldown never silently
  // blocks the replenisher during a test.
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  // Reset the mock call counter so each test starts from zero.
  mockGenerateAdditional.mock.resetCalls();
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  // Clear FK dependents (user_item_memory, phrase_reports) before phrases.
  await deletePhraseDependents();
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  // Slice 2: the replenisher now creates lesson_groups at insert time.
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  // Clear user-scoped rows that hold FKs to users before deleting the user.
  // Scoring Core backfill can create these for TEST_USER_ID between runs.
  if (await tableExists("user_item_memory")) {
    await db
      .delete(userItemMemoryTable)
      .where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  }
  if (await tableExists("xp_ledger")) {
    await db
      .delete(xpLedgerTable)
      .where(eq(xpLedgerTable.userId, TEST_USER_ID));
  }
  if (await tableExists("user_ability")) {
    await db
      .delete(userAbilityTable)
      .where(eq(userAbilityTable.userId, TEST_USER_ID));
  }
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// Confirms the full wiring: phrase-list route → shouldReplenishFree guard →
// replenishPhrases → generateAdditionalPhrases. A regression anywhere in that
// chain (wrong plan check, wrong guard, missing import) would be invisible to
// the unit tests that only cover shouldReplenishFree and replenishPhrases in
// isolation.
test("Free path fires the generator exactly once when engagement >= 80 % and below the ceiling", async () => {
  // 8 phrases below FREE_PHRASE_CEILING; 7/8 = 87.5 % engaged → fires.
  const ids = await resetPhrases(SEED_COUNT);
  await seedAttempts(ids, ENGAGE_COUNT);

  const res = await fetch(
    `${baseUrl}/categories/${categoryId}/phrases/${LANG}`,
  );
  assert.equal(res.status, 200, "route must return 200");
  const body = await res.json();
  assert.ok(Array.isArray(body), "body must be a phrase array");
  assert.equal(body.length, SEED_COUNT, "should return the seeded phrases");

  // replenishPhrases is fire-and-forget; give the background job time to
  // complete before asserting the call count.
  await new Promise((r) => setTimeout(r, 400));

  assert.equal(
    mockGenerateAdditional.mock.calls.length,
    1,
    "generateAdditionalPhrases must be called exactly once via the Free replenishment path",
  );
});

// Confirms the ceiling guard prevents the generator from firing when the topic
// already holds FREE_PHRASE_CEILING phrases, even with 90 %+ engagement.
// This proves shouldReplenishFree's ceiling check is correctly wired in the
// route, not merely tested in unit tests.
test("Free path does NOT fire the generator when phrase count is at FREE_PHRASE_CEILING", async () => {
  // Exactly at the ceiling; 90 % engaged to rule out an engagement false negative.
  const ids = await resetPhrases(FREE_PHRASE_CEILING);
  const engagedCount = Math.ceil(FREE_PHRASE_CEILING * 0.9);
  await seedAttempts(ids, engagedCount);

  const res = await fetch(
    `${baseUrl}/categories/${categoryId}/phrases/${LANG}`,
  );
  assert.equal(res.status, 200, "route must return 200");

  // Allow enough time for any incorrectly triggered background job to run.
  await new Promise((r) => setTimeout(r, 400));

  assert.equal(
    mockGenerateAdditional.mock.calls.length,
    0,
    "generateAdditionalPhrases must NOT be called when phrase count is at FREE_PHRASE_CEILING",
  );
});
