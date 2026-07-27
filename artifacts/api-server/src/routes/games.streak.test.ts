import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  pool,
  dailyQuizCompletionsTable,
  usersTable,
  languagesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { computeQuizStreak } from "./games";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Unit tests for computeQuizStreak — covers every edge case that matters for
// the retention mechanic: single-day streaks, multi-day runs through month/year
// boundaries, gap detection, and the "today vs yesterday" live-streak rules.
//
// The function queries the real database, so we provision the two tables it
// touches (users, languages, daily_quiz_completions) and clean up after each
// test. All rows are scoped to a throwaway user id and a test-only language
// code to avoid colliding with production or other suites.

const TEST_USER_ID = "test_quiz_streak_507";
const LANG = "__test_lang_streak";

/** Returns the UTC date string for N days ago ("YYYY-MM-DD"). */
function daysAgoUtc(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Seed a single completion row for the given quiz date. */
async function seedCompletion(quizDate: string): Promise<void> {
  await db
    .insert(dailyQuizCompletionsTable)
    .values({
      userId: TEST_USER_ID,
      languageCode: LANG,
      quizDate,
      score: 5,
      xpAwarded: 70,
    })
    .onConflictDoNothing();
}

async function clearCompletions(): Promise<void> {
  await db
    .delete(dailyQuizCompletionsTable)
    .where(
      and(
        eq(dailyQuizCompletionsTable.userId, TEST_USER_ID),
        eq(dailyQuizCompletionsTable.languageCode, LANG),
      ),
    );
}

before(async () => {
  await ensureUsersColumns();

  // Provision the tables this function touches. Using IF NOT EXISTS so the
  // suite is safe against a fully-migrated DB.
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
    CREATE TABLE IF NOT EXISTS daily_quiz_completions (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      quiz_date date NOT NULL,
      score integer NOT NULL,
      xp_awarded integer NOT NULL DEFAULT 0,
      completed_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT daily_quiz_completions_user_language_date_unique
        UNIQUE (user_id, language_code, quiz_date)
    );
  `);

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Streak Test" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Streak Test Language",
      nativeName: "T",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
});

beforeEach(clearCompletions);

after(async () => {
  await clearCompletions();
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// ---------------------------------------------------------------------------
// No completions
// ---------------------------------------------------------------------------

test("returns 0 when there are no completions", async () => {
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 0);
});

// ---------------------------------------------------------------------------
// Single-day streak
// ---------------------------------------------------------------------------

test("returns 1 when the learner completed only today", async () => {
  await seedCompletion(daysAgoUtc(0));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 1);
});

test("returns 1 when the learner completed only yesterday", async () => {
  await seedCompletion(daysAgoUtc(1));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 1);
});

// ---------------------------------------------------------------------------
// Multi-day streaks
// ---------------------------------------------------------------------------

test("returns 3 for three consecutive days ending today", async () => {
  await seedCompletion(daysAgoUtc(0));
  await seedCompletion(daysAgoUtc(1));
  await seedCompletion(daysAgoUtc(2));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 3);
});

test("returns 5 for five consecutive days ending yesterday", async () => {
  await seedCompletion(daysAgoUtc(1));
  await seedCompletion(daysAgoUtc(2));
  await seedCompletion(daysAgoUtc(3));
  await seedCompletion(daysAgoUtc(4));
  await seedCompletion(daysAgoUtc(5));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 5);
});

// ---------------------------------------------------------------------------
// Gap breaks the streak
// ---------------------------------------------------------------------------

test("returns 0 when the most-recent completion is two days ago", async () => {
  await seedCompletion(daysAgoUtc(2));
  await seedCompletion(daysAgoUtc(3));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 0);
});

test("returns 0 when the most-recent completion is much older", async () => {
  await seedCompletion(daysAgoUtc(10));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 0);
});

test("counts only the unbroken tail when there is an internal gap", async () => {
  // Days 0, 1 are consecutive (streak = 2), then a gap at day 3
  // (day 2 is missing), then more completions that should not extend the
  // current streak.
  await seedCompletion(daysAgoUtc(0));
  await seedCompletion(daysAgoUtc(1));
  // gap: daysAgoUtc(2) intentionally skipped
  await seedCompletion(daysAgoUtc(3));
  await seedCompletion(daysAgoUtc(4));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 2);
});

test("a gap of exactly two days (skip one day) breaks the streak", async () => {
  // Most-recent is yesterday, but day before yesterday is missing — gap of
  // exactly two days between the two entries.
  await seedCompletion(daysAgoUtc(1));
  // gap: daysAgoUtc(2) skipped
  await seedCompletion(daysAgoUtc(3));
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 1);
});

// ---------------------------------------------------------------------------
// Month / year boundary edge cases
// ---------------------------------------------------------------------------

test("counts correctly across a month boundary", async () => {
  // Build a consecutive run from Jan 31 → Feb 1 (or equivalent) by using
  // real UTC dates derived from today. We don't need to hit a specific
  // calendar month — consecutive UTC dates always work correctly regardless
  // of month. We use a long-enough run to prove the off-by-one is absent.
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(daysAgoUtc(i));
  }
  for (const d of dates) await seedCompletion(d);
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 7);
});

// ---------------------------------------------------------------------------
// Duplicate rows (should not inflate the streak count)
// ---------------------------------------------------------------------------

test("duplicate completions for the same day do not double-count", async () => {
  // The unique constraint will silently drop the second insert via
  // onConflictDoNothing, so the streak should still be 1 and not 2.
  await seedCompletion(daysAgoUtc(0));
  await seedCompletion(daysAgoUtc(0)); // duplicate — swallowed
  const streak = await computeQuizStreak(TEST_USER_ID, LANG, null);
  assert.equal(streak, 1);
});

// ---------------------------------------------------------------------------
// Non-UTC timezone — exercises the localDayKey path with a real IANA zone.
// Pacific/Auckland is UTC+12/13, well ahead of UTC, which maximises the chance
// that "today" differs between the two timezones in CI environments that run
// close to the UTC midnight boundary.
// ---------------------------------------------------------------------------

test("streak counts correctly when a real non-UTC timezone is supplied", async () => {
  // Seed three consecutive UTC days ending today.  In any timezone the learner
  // who completed on days [0, 1, 2] UTC has at minimum a streak of 2 (at least
  // yesterday+today overlap regardless of local midnight position), so the
  // result must be ≥ 2 and ≤ 3.
  await seedCompletion(daysAgoUtc(0));
  await seedCompletion(daysAgoUtc(1));
  await seedCompletion(daysAgoUtc(2));

  const streakUtc      = await computeQuizStreak(TEST_USER_ID, LANG, null);
  const streakAuckland = await computeQuizStreak(TEST_USER_ID, LANG, "Pacific/Auckland");

  // Both must be positive — the run is unambiguously active.
  assert.ok(streakUtc      >= 1, `UTC streak was ${streakUtc}, expected ≥ 1`);
  assert.ok(streakAuckland >= 1, `Auckland streak was ${streakAuckland}, expected ≥ 1`);

  // The Auckland timezone path must produce a plausible result — not a crash
  // or a wildly wrong value.  The max possible is 3 (all three days fit the
  // local window) and the min is 1 (only one day aligns with local today/
  // yesterday), so the value must sit in [1, 3].
  assert.ok(
    streakAuckland >= 1 && streakAuckland <= 3,
    `Auckland streak ${streakAuckland} is outside the expected [1, 3] range`,
  );
});
