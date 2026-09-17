// The streak sweep's one database read, and what happens when it hiccups.
//
// Production has seen candidates() fail with "Authentication timed out" and,
// separately, a TLS handshake dropping mid-connect (Sentry NODE-EXPRESS-5 and
// NODE-EXPRESS-M, and the same fault repeating in every sibling fork). Both
// are the shape of a serverless Postgres compute waking from idle on the
// first query after a quiet stretch. Before this file, that single query
// failing took the WHOLE hourly sweep down with it, so every learner in that
// run's send window went unreminded for the day, not just the one row that
// happened to trigger the reconnect.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, pool, usersTable, languagesTable, attemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { withRetryOnce, sendStreakReminders } from "./streakPush";

test("withRetryOnce absorbs a single failure and returns the retry's result", async () => {
  let calls = 0;
  const result = await withRetryOnce(async () => {
    calls++;
    if (calls === 1) throw new Error("Authentication timed out");
    return "recovered";
  }, 0);
  assert.equal(calls, 2, "the operation must be tried a second time");
  assert.equal(result, "recovered");
});

test("withRetryOnce still throws when both attempts fail", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetryOnce(async () => {
        calls++;
        throw new Error("still down");
      }, 0),
    /still down/,
  );
  // Exactly two tries, never a silent loop: a genuine outage must surface.
  assert.equal(calls, 2);
});

const RUN = `test-streak-push-${Date.now()}`;
const TEST_USER_ID = `${RUN}-user`;
const TEST_LANG_CODE = `${RUN}-lang`;

after(async () => {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG_CODE));
  await pool.end();
});

test("sendStreakReminders still finds a learner's recent attempt through the wrapped query", async () => {
  await db
    .insert(languagesTable)
    .values({
      code: TEST_LANG_CODE,
      name: "Test",
      nativeName: "Test",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
  await db.insert(usersTable).values({ id: TEST_USER_ID }).onConflictDoNothing();

  const now = new Date();
  await db.insert(attemptsTable).values({
    userId: TEST_USER_ID,
    languageCode: TEST_LANG_CODE,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 90,
    passed: true,
    feedback: "ok",
    createdAt: new Date(now.getTime() - 60 * 60 * 1000),
  });

  // No push token is registered, so this run sends nothing; the point is that
  // candidates() reaches the seeded row at all through withRetryOnce's wrapper,
  // proving the retry plumbing did not change what a healthy query returns.
  const summary = await sendStreakReminders(now);
  assert.ok(summary.considered >= 1, "the seeded attempt should be considered");
});
