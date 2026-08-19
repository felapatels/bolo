import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  pool,
  badgesTable,
  usersTable,
  languagesTable,
  activityEventsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { awardNewlyEarnedBadges } from "./badgeAward";
import type { ExtendedProgressMetrics } from "./badges";
import { ensureUsersColumns } from "./testDbCompat";

// These tests exercise the real award path, the code-defined badge catalog plus
// the badges table's unique (user_id, language_code, badge_key) constraint +
// onConflictDoNothing, that together enforce two invariants:
//   1. a badge is awarded at most once per (user, language); and
//   2. badges never leak across languages.
//
// They run against a live Postgres using the actual drizzle schema (badgesTable)
// and the singleton `db` the handler uses, so a future refactor of the award
// path that reintroduces double-awards or cross-language leakage will fail here.
//
// All rows are scoped to a throwaway user id and two test-only language codes so
// the suite is self-contained and cleans up after itself.
const TEST_USER_ID = "test_badge_award_invariants";
const LANG_A = "__test_lang_a";
const LANG_B = "__test_lang_b";

// A metrics object satisfying the "getting started" badges: first_phrase
// (>=1 attempt) and mastery_1 (>=1 mastered phrase). Game-specific counters
// default to 0 so no game achievement badges are unexpectedly unlocked.
const STARTER_METRICS: ExtendedProgressMetrics = {
  totalAttempts: 1,
  phrasesPracticed: 1,
  phrasesMastered: 1,
  bestScore: 90,
  xp: 90,
  currentStreakDays: 1,
  wordMatchGames: 0,
  speedRoundPerfectGames: 0,
  listenPickGames: 0,
  phraseBuilderGames: 0,
  scriptTraceChaptersCompleted: 0,
  dailyQuizStreak: 0,
};

// The badge keys STARTER_METRICS unlocks, in no particular order.
const STARTER_KEYS = ["first_phrase", "mastery_1"];

async function clearBadges(): Promise<void> {
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  // Awarding a badge now also writes a badge_earned activity event, and that
  // row carries an FK to the user. Left behind, it blocks the teardown that
  // deletes the throwaway learner.
  await db
    .delete(activityEventsTable)
    .where(eq(activityEventsTable.userId, TEST_USER_ID));
}

async function storedBadgeKeys(languageCode: string): Promise<string[]> {
  const rows = await db
    .select({ badgeKey: badgesTable.badgeKey })
    .from(badgesTable)
    .where(
      and(
        eq(badgesTable.userId, TEST_USER_ID),
        eq(badgesTable.languageCode, languageCode),
      ),
    );
  return rows.map((r) => r.badgeKey).sort();
}

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  // The badges feature's tables may not have been migrated into this database
  // yet. Provision exactly what the award path touches, mirroring the drizzle
  // schema (languagesTable, badgesTable), so the test is self-contained.
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

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Badge Test" })
    .onConflictDoNothing();

  await db
    .insert(languagesTable)
    .values([
      {
        code: LANG_A,
        name: "Test Language A",
        nativeName: "A",
        script: "Latin",
        fontFamily: "sans-serif",
      },
      {
        code: LANG_B,
        name: "Test Language B",
        nativeName: "B",
        script: "Latin",
        fontFamily: "sans-serif",
      },
    ])
    .onConflictDoNothing();
});

beforeEach(clearBadges);

after(async () => {
  await clearBadges();
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG_A));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG_B));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("re-meeting the same criteria never re-awards or re-celebrates", async () => {
  const first = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, STARTER_METRICS);
  assert.deepEqual(first.map((b) => b.key).sort(), STARTER_KEYS);
  // Each returned badge carries its catalog metadata and an award timestamp.
  for (const b of first) {
    assert.equal(typeof b.title, "string");
    assert.ok(b.title.length > 0);
    assert.ok(!Number.isNaN(Date.parse(b.earnedAt)));
  }

  // Re-meeting the exact same criteria awards and celebrates nothing new.
  const second = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, STARTER_METRICS);
  assert.deepEqual(second, []);

  // Even stronger metrics that still satisfy the same badges don't re-award.
  const third = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, {
    ...STARTER_METRICS,
    totalAttempts: 5,
    bestScore: 100,
    xp: 450,
  });
  assert.deepEqual(third.map((b) => b.key), ["perfect_100"]); // only the newly-crossed one

  // Stored exactly once per key, no duplicates.
  assert.deepEqual(await storedBadgeKeys(LANG_A), [
    "first_phrase",
    "mastery_1",
    "perfect_100",
  ]);
});

test("crossing a new threshold awards only the newly-earned badge", async () => {
  const initial = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, STARTER_METRICS);
  assert.deepEqual(initial.map((b) => b.key).sort(), STARTER_KEYS);

  // Practicing 10 phrases newly satisfies "phrases_10" and nothing already held.
  const next = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, {
    ...STARTER_METRICS,
    phrasesPracticed: 10,
  });
  assert.deepEqual(next.map((b) => b.key), ["phrases_10"]);
});

test("badges are earned and tracked independently per language", async () => {
  // Earn the starter badges for language A.
  const awardedA = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, STARTER_METRICS);
  assert.deepEqual(awardedA.map((b) => b.key).sort(), STARTER_KEYS);

  // Language A's badges must not leak into language B: awarding the *same*
  // criteria for B awards a fresh, independent set (not "already earned").
  const awardedB = await awardNewlyEarnedBadges(TEST_USER_ID, LANG_B, STARTER_METRICS);
  assert.deepEqual(awardedB.map((b) => b.key).sort(), STARTER_KEYS);

  // Each language holds its own copy of the badges.
  assert.deepEqual(await storedBadgeKeys(LANG_A), STARTER_KEYS);
  assert.deepEqual(await storedBadgeKeys(LANG_B), STARTER_KEYS);

  // Re-awarding A after B changed nothing does not re-award or leak.
  assert.deepEqual(await awardNewlyEarnedBadges(TEST_USER_ID, LANG_A, STARTER_METRICS), []);
});
