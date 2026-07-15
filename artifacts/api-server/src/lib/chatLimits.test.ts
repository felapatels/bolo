import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, pool, usersTable, languagesTable, chatTurnsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  FREE_WEEKLY_CHAT_SECONDS_CAP,
  FREE_LANGUAGE,
  weeklyChatSecondsLimit,
  type ResolvedPlan,
} from "./entitlements";
import {
  startOfUtcWeek,
  sumChatSecondsThisWeek,
  recordChatTurn,
  chatTimeCapDenial,
  chatSecondsRemaining,
} from "./chatLimits";
import { ensureUsersColumns } from "./testDbCompat";

// Covers the weekly chat-time cap contract:
//   - startOfUtcWeek bucketing (Sunday, Monday, mid-week, Saturday)
//   - DB-backed usage summing (empty, cumulative, week-boundary rollover)
//   - chatTimeCapDenial: Free denied at/over cap, allowed under cap; One
//     Language and Plus always allowed regardless
//   - chatSecondsRemaining: correct arithmetic for Free; null for paid tiers
//
// Rows are scoped to test-only ids and cleaned up after each run.

const USER = "test_chat_limits";
const LANG = "__test_lang_chat";

function plusPlan(): ResolvedPlan {
  return {
    plan: "plus",
    status: "active",
    trialEndsAt: null,
    currentPeriodEnd: null,
    chosenLanguage: null,
    pauseUntil: null,
  };
}

function oneLanguagePlan(): ResolvedPlan {
  return {
    plan: "one_language",
    status: "active",
    trialEndsAt: null,
    currentPeriodEnd: null,
    chosenLanguage: LANG,
    pauseUntil: null,
  };
}

function freePlan(): ResolvedPlan {
  return {
    plan: "free",
    status: "none",
    trialEndsAt: null,
    currentPeriodEnd: null,
    chosenLanguage: null,
    pauseUntil: null,
  };
}

before(async () => {
  await ensureUsersColumns();
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
    CREATE TABLE IF NOT EXISTS chat_turns (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      duration_seconds integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db
    .insert(usersTable)
    .values({ id: USER, displayName: "Chat Limits Test" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Chat Test Lang",
      nativeName: "C",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.userId, USER));
});

after(async () => {
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.userId, USER));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, USER));
  await pool.end();
});

// ---------------------------------------------------------------------------
// Pure: startOfUtcWeek bucketing
// ---------------------------------------------------------------------------

test("startOfUtcWeek: Monday stays on Monday", () => {
  const mon = new Date("2026-07-13T14:00:00.000Z"); // Monday
  const w = startOfUtcWeek(mon);
  assert.equal(w.toISOString(), "2026-07-13T00:00:00.000Z");
});

test("startOfUtcWeek: Sunday rolls back to the preceding Monday", () => {
  const sun = new Date("2026-07-19T10:00:00.000Z"); // Sunday
  const w = startOfUtcWeek(sun);
  assert.equal(w.toISOString(), "2026-07-13T00:00:00.000Z");
});

test("startOfUtcWeek: Saturday rolls back to the preceding Monday", () => {
  const sat = new Date("2026-07-18T23:00:00.000Z"); // Saturday
  const w = startOfUtcWeek(sat);
  assert.equal(w.toISOString(), "2026-07-13T00:00:00.000Z");
});

test("startOfUtcWeek: Wednesday is in the same week as its Monday", () => {
  const wed = new Date("2026-07-15T08:00:00.000Z"); // Wednesday
  const w = startOfUtcWeek(wed);
  assert.equal(w.toISOString(), "2026-07-13T00:00:00.000Z");
});

test("startOfUtcWeek: the Monday after a Sunday is a different week", () => {
  const sun = new Date("2026-07-19T23:59:59.000Z");
  const nextMon = new Date("2026-07-20T00:00:00.001Z");
  const w1 = startOfUtcWeek(sun);
  const w2 = startOfUtcWeek(nextMon);
  assert.notEqual(w1.toISOString(), w2.toISOString());
  assert.equal(w2.toISOString(), "2026-07-20T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Pure: plan limits
// ---------------------------------------------------------------------------

test("weeklyChatSecondsLimit: Free is capped, paid tiers are unlimited", () => {
  assert.equal(weeklyChatSecondsLimit("free"), FREE_WEEKLY_CHAT_SECONDS_CAP);
  assert.equal(weeklyChatSecondsLimit("one_language"), null);
  assert.equal(weeklyChatSecondsLimit("plus"), null);
});

// ---------------------------------------------------------------------------
// DB: sumChatSecondsThisWeek
// ---------------------------------------------------------------------------

test("sumChatSecondsThisWeek returns 0 when no turns exist", async () => {
  const sum = await sumChatSecondsThisWeek(USER);
  assert.equal(sum, 0);
});

test("sumChatSecondsThisWeek sums only this week's turns", async () => {
  const now = new Date();
  // Two turns this week
  await db.insert(chatTurnsTable).values({ userId: USER, languageCode: LANG, durationSeconds: 30, createdAt: now });
  await db.insert(chatTurnsTable).values({ userId: USER, languageCode: LANG, durationSeconds: 45, createdAt: now });
  // One turn from the previous week (7 days before this Monday)
  const mondayThisWeek = startOfUtcWeek(now);
  const lastWeek = new Date(mondayThisWeek.getTime() - 1); // Sunday just before this week started
  await db.insert(chatTurnsTable).values({ userId: USER, languageCode: LANG, durationSeconds: 999, createdAt: lastWeek });

  const sum = await sumChatSecondsThisWeek(USER, now);
  assert.equal(sum, 75); // 30 + 45; 999 is last week
});

test("sumChatSecondsThisWeek ignores other users' turns", async () => {
  const otherUser = "test_chat_limits_other";
  await db.insert(usersTable).values({ id: otherUser }).onConflictDoNothing();
  await db.insert(chatTurnsTable).values({ userId: otherUser, languageCode: LANG, durationSeconds: 999 });
  const sum = await sumChatSecondsThisWeek(USER);
  assert.equal(sum, 0);
  // Cleanup
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.userId, otherUser));
  await db.delete(usersTable).where(eq(usersTable.id, otherUser));
});

// ---------------------------------------------------------------------------
// DB: recordChatTurn
// ---------------------------------------------------------------------------

test("recordChatTurn inserts a row that shows up in the weekly sum", async () => {
  await recordChatTurn(USER, LANG, 40);
  const sum = await sumChatSecondsThisWeek(USER);
  assert.equal(sum, 40);
});

test("recordChatTurn rounds fractional durations to whole seconds", async () => {
  await recordChatTurn(USER, LANG, 7.8);
  const rows = await db.select().from(chatTurnsTable).where(eq(chatTurnsTable.userId, USER));
  assert.equal(rows[0].durationSeconds, 8);
});

test("recordChatTurn clamps negative durations to zero", async () => {
  await recordChatTurn(USER, LANG, -5);
  const rows = await db.select().from(chatTurnsTable).where(eq(chatTurnsTable.userId, USER));
  assert.equal(rows[0].durationSeconds, 0);
});

// ---------------------------------------------------------------------------
// DB: chatTimeCapDenial
// ---------------------------------------------------------------------------

test("chatTimeCapDenial returns null for Free under the cap", async () => {
  await recordChatTurn(USER, LANG, FREE_WEEKLY_CHAT_SECONDS_CAP - 1);
  const denial = await chatTimeCapDenial(freePlan(), USER);
  assert.equal(denial, null);
});

test("chatTimeCapDenial denies when Free is at the cap (= exactly the limit)", async () => {
  await recordChatTurn(USER, LANG, FREE_WEEKLY_CHAT_SECONDS_CAP);
  const denial = await chatTimeCapDenial(freePlan(), USER);
  assert.ok(denial, "expected a denial payload");
  assert.equal(denial.error, "upgrade_required");
  assert.equal(denial.reason, "chat_time_limit");
  assert.equal(denial.requiredPlan, "one_language");
});

test("chatTimeCapDenial denies when Free is over the cap", async () => {
  await recordChatTurn(USER, LANG, FREE_WEEKLY_CHAT_SECONDS_CAP + 60);
  const denial = await chatTimeCapDenial(freePlan(), USER);
  assert.ok(denial, "expected a denial payload");
});

test("chatTimeCapDenial never denies One Language regardless of usage", async () => {
  await recordChatTurn(USER, LANG, FREE_WEEKLY_CHAT_SECONDS_CAP * 10);
  const denial = await chatTimeCapDenial(oneLanguagePlan(), USER);
  assert.equal(denial, null);
});

test("chatTimeCapDenial never denies Plus regardless of usage", async () => {
  await recordChatTurn(USER, LANG, FREE_WEEKLY_CHAT_SECONDS_CAP * 10);
  const denial = await chatTimeCapDenial(plusPlan(), USER);
  assert.equal(denial, null);
});

// ---------------------------------------------------------------------------
// DB: week rollover — usage from last week does NOT count this week
// ---------------------------------------------------------------------------

test("usage resets when the week rolls over", async () => {
  const now = new Date("2026-07-15T12:00:00.000Z"); // Wednesday this week
  const mondayThisWeek = startOfUtcWeek(now);
  // Log enough usage in the previous week to exceed the cap there.
  const lastWeekEnd = new Date(mondayThisWeek.getTime() - 1000); // late Sunday
  await db.insert(chatTurnsTable).values({
    userId: USER,
    languageCode: LANG,
    durationSeconds: FREE_WEEKLY_CHAT_SECONDS_CAP + 60,
    createdAt: lastWeekEnd,
  });
  // This week: zero usage so far.
  const denial = await chatTimeCapDenial(freePlan(), USER, now);
  assert.equal(denial, null, "last week's usage must not bleed into this week");
  const remaining = await chatSecondsRemaining(freePlan(), USER, now);
  assert.equal(remaining, FREE_WEEKLY_CHAT_SECONDS_CAP);
});

// ---------------------------------------------------------------------------
// DB: chatSecondsRemaining
// ---------------------------------------------------------------------------

test("chatSecondsRemaining returns null for Plus (unlimited)", async () => {
  const rem = await chatSecondsRemaining(plusPlan(), USER);
  assert.equal(rem, null);
});

test("chatSecondsRemaining returns null for One Language (unlimited)", async () => {
  const rem = await chatSecondsRemaining(oneLanguagePlan(), USER);
  assert.equal(rem, null);
});

test("chatSecondsRemaining returns correct seconds for Free with no usage", async () => {
  const rem = await chatSecondsRemaining(freePlan(), USER);
  assert.equal(rem, FREE_WEEKLY_CHAT_SECONDS_CAP);
});

test("chatSecondsRemaining decrements correctly after usage", async () => {
  await recordChatTurn(USER, LANG, 50);
  const rem = await chatSecondsRemaining(freePlan(), USER);
  assert.equal(rem, FREE_WEEKLY_CHAT_SECONDS_CAP - 50);
});

test("chatSecondsRemaining is clamped to zero when over the cap", async () => {
  await recordChatTurn(USER, LANG, FREE_WEEKLY_CHAT_SECONDS_CAP + 30);
  const rem = await chatSecondsRemaining(freePlan(), USER);
  assert.equal(rem, 0);
});
