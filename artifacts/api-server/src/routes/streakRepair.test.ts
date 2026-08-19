import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  attemptsTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  lessonGroupsTable,
  phrasesTable,
  gameSessionsTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import tokensRouter from "./tokens";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { grantTokens, repairStreak, listCoveredDayKeys } from "../lib/tokenService";
import { STREAK_REPAIR_COST } from "../lib/tokenEconomy";
import {
  STREAK_REPAIR_REASON,
  STREAK_REPAIR_WINDOW_DAYS,
  findRepairableBreak,
  streakRepairRefId,
} from "../lib/streakRepair";
import { loadStreakLadder } from "../lib/streakDays";
import { localDayKey, previousDayKey } from "../lib/progressMetrics";

// Streak repair (owner ruling, Aug 7 2026). The ratified exception to the
// delight-only Chai spine: it buys back a streak lost to life happening, and
// must never buy an advantage. This suite pins the shape that keeps it honest:
//   - the repair writes NO streak number; it covers one day and the ladder
//     re-derives, so every other day in the restored run is still real practice,
//   - the day is chosen by the SERVER (empty request body, server-composed
//     ledger key), so nothing about what is bought comes from the client,
//   - a replay charges nothing, an empty tin is refused in the 409 Chai copy
//     register, and refusals are never 402, a broken streak is not a plan
//     boundary and must never become an upsell,
//   - eligibility is re-derived on the write path, so a client that offers a
//     repair it should not have still cannot buy one,
//   - the money survives contention: the request that loses the race replays
//     for free rather than being refused for funds it need not spend twice.
//
// Task #1081 added the thing this surface most needed: PROMISE EQUALS
// DELIVERY. The offer used to be priced on a different expression from the one
// the home banner climbed, bare attempts in ALL languages here, bare attempts
// in the ACTIVE language there, so the card could sell a 4-day streak to a
// learner whose banner then read 1. Both now read lib/streakDays.ts, and the
// multi-language test below is the shape that failed: completions spread
// across two languages, asserting the promised number, the repair result and
// the post-repair banner are one number.
//
// The definition those numbers share: a streak day is a day the learner
// COMPLETED A LESSON or PLAYED A MINI-GAME, in any language. Bare attempts do
// not count a day, which is why every fixture here has to finish something.
// Live shared Postgres: test-only ids, self-provisioned tables, full cleanup.
// See .agents/memory/api-server-tests.md and docs/CODEBASE-FACTS.md section 4.

const TEST_USER_ID = "test_streak_repair";
const POOR_USER_ID = "test_streak_repair_poor";
const AWAY_USER_ID = "test_streak_repair_away";
const OLD_USER_ID = "test_streak_repair_old";
const RACE_USER_ID = "test_streak_repair_race";
const ORDER_USER_ID = "test_streak_repair_order";
const MULTI_USER_ID = "test_streak_repair_multi";
const GAME_USER_ID = "test_streak_repair_game";
const BARE_USER_ID = "test_streak_repair_bare";
const FREE_USER_ID = "test_streak_repair_free";
const ALL_USERS = [
  TEST_USER_ID,
  POOR_USER_ID,
  AWAY_USER_ID,
  OLD_USER_ID,
  RACE_USER_ID,
  ORDER_USER_ID,
  MULTI_USER_ID,
  GAME_USER_ID,
  BARE_USER_ID,
  FREE_USER_ID,
];

// Two languages, because the defect only shows up across them.
const LANG_A = "__test_lang_streakrepair_a";
const LANG_B = "__test_lang_streakrepair_b";
const CATEGORY_SLUG = "__test_cat_streakrepair";

// Every user in this suite runs on UTC (users.timezone stays null), so day
// keys here are plain UTC dates and attempts are stamped at midday to sit well
// clear of either boundary.
const TODAY = localDayKey(new Date());
const D1 = previousDayKey(TODAY);
const D2 = previousDayKey(D1);
const D3 = previousDayKey(D2);
const D4 = previousDayKey(D3);

let app: Express;
let server: Server;
let baseUrl: string;

let categoryId: number;
/** LANG_A station: two free items, the whole lesson a learner must clear. */
let groupA: { id: number; phraseIds: number[] };
/** LANG_B station: two free items, so a completion can land in language B. */
let groupB: { id: number; phraseIds: number[] };
/** LANG_A station with one free item and one Plus-only item. */
let mixedGroup: { id: number; freeId: number; premiumId: number };

function atNoon(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00.000Z`);
}

/**
 * Clears every item of a lesson group on one day, a lesson COMPLETED, which
 * is what a streak day now means. Score 90 clears the item rule on the first
 * take (good or better), matching what the learner saw on the advance gate.
 */
async function completeLesson(
  userId: string,
  languageCode: string,
  phraseIds: number[],
  dayKeys: string[],
): Promise<void> {
  const rows = dayKeys.flatMap((day) =>
    phraseIds.map((phraseId) => ({
      userId,
      phraseId,
      languageCode,
      nativeScript: "કેમ છો",
      romanized: "kem chho",
      english: "how are you",
      transcript: "કેમ છો",
      score: 90,
      passed: true,
      feedback: "",
      createdAt: atNoon(day),
    })),
  );
  if (rows.length > 0) await db.insert(attemptsTable).values(rows);
}

/**
 * Attempts that finish nothing: one item of a two-item station, scored below
 * the good band and well short of the three-take pass. Under the ruling this
 * anchors no day, which is precisely what the bare-attempts test proves.
 */
async function bareAttempts(
  userId: string,
  languageCode: string,
  phraseId: number,
  dayKeys: string[],
): Promise<void> {
  await db.insert(attemptsTable).values(
    dayKeys.map((day) => ({
      userId,
      phraseId,
      languageCode,
      nativeScript: "કેમ છો",
      romanized: "kem chho",
      english: "how are you",
      transcript: "કેમ",
      score: 40,
      passed: false,
      feedback: "",
      createdAt: atNoon(day),
    })),
  );
}

/** A mini-game played: the real signal, not the phantom attempt beside it. */
async function playGame(
  userId: string,
  languageCode: string,
  dayKeys: string[],
): Promise<void> {
  await db.insert(gameSessionsTable).values(
    dayKeys.map((day) => ({
      userId,
      languageCode,
      game: "word-match",
      correctCount: 5,
      totalCount: 5,
      xpAwarded: 15,
      createdAt: atNoon(day),
    })),
  );
}

async function get(path: string, userId: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, { headers: { "x-test-user": userId } });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function post(path: string, userId: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** The DAY STREAK number exactly as the home banner receives it. */
async function bannerStreak(userId: string, lang: string): Promise<number> {
  const { status, json } = await get(`/progress/summary?lang=${lang}`, userId);
  assert.equal(status, 200, `progress summary failed: ${JSON.stringify(json)}`);
  return json.currentStreakDays as number;
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: userTokenStateTable.balance })
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId));
  return row?.balance ?? 0;
}

async function repairRows(userId: string): Promise<{ refId: string; delta: number }[]> {
  return db
    .select({ refId: tokenLedgerTable.refId, delta: tokenLedgerTable.delta })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, STREAK_REPAIR_REASON),
      ),
    );
}

before(async () => {
  await ensureUsersColumns();
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

  await cleanup();

  await db.insert(usersTable).values(
    ALL_USERS.map((id) => ({ id, email: `${id}@test.invalid` })),
  );
  // Everyone but FREE_USER_ID holds Plus, so the multi-language learner can
  // read /progress/summary for a test language and the accessible item set is
  // the whole station. FREE_USER_ID stays Free on purpose.
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(inArray(usersTable.id, ALL_USERS.filter((id) => id !== FREE_USER_ID)));

  await db
    .insert(languagesTable)
    .values(
      [LANG_A, LANG_B].map((code) => ({
        code,
        name: `Streakish ${code.slice(-1)}`,
        nativeName: "S",
        script: "Latin",
        fontFamily: "sans-serif",
      })),
    )
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Streak Repair Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#555555",
      sortOrder: 9501,
    })
    .returning();
  categoryId = category!.id;

  const [lessonA] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG_A, categoryId, titleNative: "A" })
    .returning();
  const [lessonB] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG_B, categoryId, titleNative: "B" })
    .returning();

  const groups = await db
    .insert(lessonGroupsTable)
    .values([
      { languageCode: LANG_A, categoryId, position: 1 },
      { languageCode: LANG_B, categoryId, position: 1 },
      { languageCode: LANG_A, categoryId, position: 2 },
    ])
    .returning();

  const mkPhrase = (
    english: string,
    lessonId: number,
    languageCode: string,
    groupId: number,
    groupPos: number,
    premium = false,
  ) => ({
    lessonId,
    languageCode,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder: groupPos,
    stage: "phrase" as const,
    premium,
    lessonGroupId: groupId,
    lessonGroupPosition: groupPos,
  });

  const inserted = await db
    .insert(phrasesTable)
    .values([
      mkPhrase("a1", lessonA!.id, LANG_A, groups[0]!.id, 1),
      mkPhrase("a2", lessonA!.id, LANG_A, groups[0]!.id, 2),
      mkPhrase("b1", lessonB!.id, LANG_B, groups[1]!.id, 1),
      mkPhrase("b2", lessonB!.id, LANG_B, groups[1]!.id, 2),
      mkPhrase("m1", lessonA!.id, LANG_A, groups[2]!.id, 1),
      mkPhrase("m2", lessonA!.id, LANG_A, groups[2]!.id, 2, true),
    ])
    .returning({ id: phrasesTable.id, english: phrasesTable.english });
  const idOf = (english: string) =>
    inserted.find((p) => p.english === english)!.id;

  groupA = { id: groups[0]!.id, phraseIds: [idOf("a1"), idOf("a2")] };
  groupB = { id: groups[1]!.id, phraseIds: [idOf("b1"), idOf("b2")] };
  mixedGroup = {
    id: groups[2]!.id,
    freeId: idOf("m1"),
    premiumId: idOf("m2"),
  };

  // A slip: a lesson finished today and the day before yesterday, with
  // yesterday empty.
  for (const id of [TEST_USER_ID, POOR_USER_ID, RACE_USER_ID, ORDER_USER_ID]) {
    await completeLesson(id, LANG_A, groupA.phraseIds, [D2, TODAY]);
  }
  // A hole three days back, with the run above it intact: real break, but
  // older than the window.
  await completeLesson(OLD_USER_ID, LANG_A, groupA.phraseIds, [D4, D2, D1, TODAY]);
  // AWAY_USER_ID practises nothing: an absence, not a slip.

  // THE PART A SHAPE: the same slip, but the two real days are in DIFFERENT
  // languages. Under the old split expressions the offer counted both and the
  // banner counted one.
  await completeLesson(MULTI_USER_ID, LANG_A, groupA.phraseIds, [D2]);
  await completeLesson(MULTI_USER_ID, LANG_B, groupB.phraseIds, [TODAY]);

  // Mini-games only, no lesson ever finished. The clause has to stand on the
  // game_sessions rows alone, because the phantom attempts beside them no
  // longer anchor anything.
  await playGame(GAME_USER_ID, LANG_A, [D2, TODAY]);

  // Bare attempts on the missed day: one item of a two-item station, scored
  // below the good band and short of the three-take pass. If those counted,
  // there would be no hole to sell.
  await completeLesson(BARE_USER_ID, LANG_A, groupA.phraseIds, [D2, TODAY]);
  await bareAttempts(BARE_USER_ID, LANG_A, groupA.phraseIds[0]!, [D1, D1]);

  // A Free learner clearing the station's free item. The Plus-only item is not
  // part of the set they were ever offered, so requiring it would make the day
  // unearnable for them.
  await completeLesson(FREE_USER_ID, LANG_A, [mixedGroup.freeId], [D2, TODAY]);

  await grantTokens(TEST_USER_ID, "earn_streak_day", "__seed_repair", STREAK_REPAIR_COST + 5);
  await grantTokens(POOR_USER_ID, "earn_streak_day", "__seed_poor", STREAK_REPAIR_COST - 1);
  await grantTokens(OLD_USER_ID, "earn_streak_day", "__seed_old", STREAK_REPAIR_COST + 5);
  await grantTokens(MULTI_USER_ID, "earn_streak_day", "__seed_multi", STREAK_REPAIR_COST + 5);
  // Exactly one repair's worth: the racing pair below have to share it.
  await grantTokens(RACE_USER_ID, "earn_streak_day", "__seed_race", STREAK_REPAIR_COST);
  await grantTokens(ORDER_USER_ID, "earn_streak_day", "__seed_order", STREAK_REPAIR_COST);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(tokensRouter);
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

async function cleanup(): Promise<void> {
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ALL_USERS));
  await db
    .delete(gameSessionsTable)
    .where(inArray(gameSessionsTable.userId, ALL_USERS));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, ALL_USERS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  await pool.query(
    `DELETE FROM phrases WHERE language_code = ANY($1::text[])`,
    [[LANG_A, LANG_B]],
  );
  await pool.query(
    `DELETE FROM lesson_groups WHERE language_code = ANY($1::text[])`,
    [[LANG_A, LANG_B]],
  );
  await pool.query(
    `DELETE FROM lessons WHERE language_code = ANY($1::text[])`,
    [[LANG_A, LANG_B]],
  );
  await pool.query(`DELETE FROM categories WHERE slug = $1`, [CATEGORY_SLUG]);
  await pool.query(`DELETE FROM languages WHERE code = ANY($1::text[])`, [
    [LANG_A, LANG_B],
  ]);
}

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await cleanup();
  await pool.end();
});

// ── What may be sold at all ─────────────────────────────────────────────────

test("eligibility: a slip inside the window is the only thing on offer", () => {
  const found = findRepairableBreak(new Set([D2, TODAY]), new Set(), "UTC", atNoon(TODAY));
  assert.equal(found.ok, true);
  assert.equal(found.ok && found.dayKey, D1);
  // Cover yesterday and the ladder climbs the day before yesterday too.
  assert.equal(found.ok && found.restoresStreakDays, 3);
});

test("eligibility: an absence with no run above it is not a slip", () => {
  const found = findRepairableBreak(new Set([TODAY]), new Set(), "UTC", atNoon(TODAY));
  assert.equal(found.ok, false);
  assert.equal(found.ok === false && found.refusal, "break_too_long");
});

test("eligibility: a break older than the window is refused", () => {
  const found = findRepairableBreak(
    new Set([D4, D2, D1, TODAY]),
    new Set(),
    "UTC",
    atNoon(TODAY),
  );
  assert.equal(found.ok, false);
  assert.equal(found.ok === false && found.refusal, "window_expired");
});

test("eligibility: an unbroken run has nothing to sell", () => {
  const days = new Set<string>();
  let cursor = TODAY;
  for (let i = 0; i < 70; i += 1) {
    days.add(cursor);
    cursor = previousDayKey(cursor);
  }
  const found = findRepairableBreak(days, new Set(), "UTC", atNoon(TODAY));
  assert.equal(found.ok, false);
  assert.equal(found.ok === false && found.refusal, "no_break");
});

test("eligibility: at most one break is ever repairable, so repairs cannot be chained", () => {
  // Every-other-day practice is the worst case for a sink that could be walked
  // backwards. At a two-day window the second hole is always out of reach.
  const found = findRepairableBreak(
    new Set([TODAY, D2, D4]),
    new Set(),
    "UTC",
    atNoon(TODAY),
  );
  assert.equal(found.ok, true);
  assert.equal(found.ok && found.dayKey, D1);
  // Having bought D1, the next hole (D3) sits outside the window: refused.
  const next = findRepairableBreak(
    new Set([TODAY, D2, D4]),
    new Set([D1]),
    "UTC",
    atNoon(TODAY),
  );
  assert.equal(next.ok, false);
  assert.equal(next.ok === false && next.refusal, "window_expired");
  assert.equal(STREAK_REPAIR_WINDOW_DAYS, 2);
});

// ── What earns a day at all (the ruling, Task #1081) ────────────────────────

test("a day of bare attempts that finished no lesson is still a hole worth mending", async () => {
  // BARE_USER_ID recorded takes yesterday. They just did not finish anything:
  // one item of a two-item station, below the good band, short of three takes.
  // The old expression counted any attempt, so this learner would have been
  // told there was nothing to mend while their banner showed a broken streak.
  const attemptsYesterday = await db
    .select({ id: attemptsTable.id })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, BARE_USER_ID));
  assert.ok(attemptsYesterday.length > 0, "the fixture must have real attempt rows");

  const { earnedDayKeys, currentStreakDays } = await loadStreakLadder(BARE_USER_ID, null);
  assert.equal(earnedDayKeys.has(D1), false, "bare attempts earn no day");
  assert.equal(earnedDayKeys.has(D2), true);
  assert.equal(earnedDayKeys.has(TODAY), true);
  assert.equal(currentStreakDays, 1, "the banner sees today alone");

  const { json } = await get("/tokens/streak-repair", BARE_USER_ID);
  assert.equal(json.eligible, true);
  assert.equal(json.missedDay, D1);
  assert.equal(json.restoresStreakDays, 3);
});

test("a mini-game played anchors the day, read from game_sessions not the phantom attempt", async () => {
  // GAME_USER_ID has finished no lesson at all, only game sessions. The
  // phantom streak-only attempts that normally sit beside them are deliberately
  // absent from this fixture, because they are attempts and attempts no longer
  // count: the clause has to stand on the real rows.
  const phantoms = await db
    .select({ id: attemptsTable.id })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, GAME_USER_ID));
  assert.equal(phantoms.length, 0, "no attempt rows: the games must carry this alone");

  const { earnedDayKeys, currentStreakDays } = await loadStreakLadder(GAME_USER_ID, null);
  assert.equal(earnedDayKeys.has(D2), true);
  assert.equal(earnedDayKeys.has(TODAY), true);
  assert.equal(currentStreakDays, 1);

  const { json } = await get("/tokens/streak-repair", GAME_USER_ID);
  assert.equal(json.eligible, true);
  assert.equal(json.missedDay, D1);
  assert.equal(json.restoresStreakDays, 3);
});

test("a Free learner completes a station by clearing the items they were offered", async () => {
  // The station's second item is Plus-only. Requiring it would make the day
  // structurally unearnable for a Free learner, the streak would silently
  // become a paid feature.
  const { earnedDayKeys, currentStreakDays } = await loadStreakLadder(FREE_USER_ID, null);
  assert.equal(earnedDayKeys.has(D2), true);
  assert.equal(earnedDayKeys.has(TODAY), true);
  assert.equal(currentStreakDays, 1);
});

// ── The offer, as the wallet reads it ───────────────────────────────────────

test("the offer names the day, the restored streak, and the price", async () => {
  const { status, json } = await get("/tokens/streak-repair", TEST_USER_ID);
  assert.equal(status, 200);
  assert.equal(json.eligible, true);
  assert.equal(json.missedDay, D1);
  assert.equal(json.restoresStreakDays, 3);
  assert.equal(json.cost, STREAK_REPAIR_COST);
  assert.equal(json.balance, STREAK_REPAIR_COST + 5);
});

test("a learner who was simply away is offered nothing", async () => {
  const { status, json } = await get("/tokens/streak-repair", AWAY_USER_ID);
  assert.equal(status, 200);
  assert.equal(json.eligible, false);
  assert.equal(json.missedDay, null);
});

// ── Promise equals delivery, across languages (Task #1081) ──────────────────

test("multi-language learner: the promise, the repair and the banner are one number", async () => {
  // MULTI_USER_ID finished a lesson in language A the day before yesterday and
  // one in language B today. This is the exact shape that failed in Part A:
  // the offer scanned all languages, the banner scanned the active one, and
  // the card sold a number the banner could not show.
  const offer = await get("/tokens/streak-repair", MULTI_USER_ID);
  assert.equal(offer.status, 200);
  assert.equal(offer.json.eligible, true);
  assert.equal(offer.json.missedDay, D1);
  const promised = offer.json.restoresStreakDays as number;
  assert.equal(promised, 3, "cover yesterday and both real days join up");

  // Before the repair the banner reads today alone, in EITHER language, the
  // streak is user-level now, so the active language cannot change it.
  assert.equal(await bannerStreak(MULTI_USER_ID, LANG_A), 1);
  assert.equal(await bannerStreak(MULTI_USER_ID, LANG_B), 1);

  const repaired = await post("/tokens/repair-streak", MULTI_USER_ID);
  assert.equal(repaired.status, 200);
  assert.equal(repaired.json.charged, true);
  assert.equal(repaired.json.repairedDay, D1);
  assert.equal(
    repaired.json.restoredStreakDays,
    promised,
    "delivery must equal the promise",
  );

  // And the banner agrees, in both languages, with the number that was sold.
  assert.equal(await bannerStreak(MULTI_USER_ID, LANG_A), promised);
  assert.equal(await bannerStreak(MULTI_USER_ID, LANG_B), promised);
});

// ── The money path ──────────────────────────────────────────────────────────

test("repairing covers the day, charges once, and the streak re-derives", async () => {
  const { status, json } = await post("/tokens/repair-streak", TEST_USER_ID);
  assert.equal(status, 200);
  assert.equal(json.charged, true);
  assert.equal(json.repairedDay, D1);
  assert.equal(json.restoredStreakDays, 3);
  assert.equal(json.cost, STREAK_REPAIR_COST);
  assert.equal(json.balance, 5);
  assert.equal(await balanceOf(TEST_USER_ID), 5);

  const rows = await repairRows(TEST_USER_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.refId, streakRepairRefId(D1));
  assert.equal(rows[0]!.delta, -STREAK_REPAIR_COST);

  // The point of the whole feature: no number was written anywhere. The streak
  // is still derived, and it now climbs through the covered day, read back
  // through THE source, the same one the offer was priced on.
  const covered = await listCoveredDayKeys(TEST_USER_ID);
  assert.ok(covered.has(D1), "the repaired day must read back as covered");
  const { currentStreakDays } = await loadStreakLadder(TEST_USER_ID, null);
  assert.equal(currentStreakDays, 3);
});

test("a fresh client with no local state sees the repaired streak", async () => {
  // Nothing about the repair lives on the device: the cover is a ledger row,
  // so a reinstall reads the same restored streak from the server.
  const covered = await listCoveredDayKeys(TEST_USER_ID);
  assert.ok(covered.has(D1));
  const { json } = await get("/tokens/streak-repair", TEST_USER_ID);
  // And the mended day is not for sale a second time.
  assert.equal(json.eligible, false);
});

test("replaying the repair charges nothing", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const { state, charged } = await repairStreak(TEST_USER_ID, D1);
  assert.equal(charged, false);
  assert.equal(state.balance, before);
  assert.equal((await repairRows(TEST_USER_ID)).length, 1);
});

test("an empty tin is refused as 409, never as a paywall", async () => {
  const { status, json } = await post("/tokens/repair-streak", POOR_USER_ID);
  assert.equal(status, 409);
  assert.equal(json.error, "insufficient_tokens");
  assert.equal(json.cost, STREAK_REPAIR_COST);
  assert.equal(json.balance, STREAK_REPAIR_COST - 1);
  assert.equal((await repairRows(POOR_USER_ID)).length, 0);
});

test("a client that asks anyway cannot buy a repair it was not offered", async () => {
  // The write path re-derives eligibility rather than trusting the caller, there is no day in the request to forge in the first place.
  const away = await post("/tokens/repair-streak", AWAY_USER_ID);
  assert.equal(away.status, 409);
  assert.equal(away.json.error, "break_too_long");
  assert.equal((await repairRows(AWAY_USER_ID)).length, 0);

  const old = await post("/tokens/repair-streak", OLD_USER_ID);
  assert.equal(old.status, 409);
  assert.equal(old.json.error, "repair_window_expired");
  assert.equal((await repairRows(OLD_USER_ID)).length, 0);
  assert.equal(await balanceOf(OLD_USER_ID), STREAK_REPAIR_COST + 5);
});

// ── The money path under contention ─────────────────────────────────────────

test("the repair that loses the race replays instead of being refused", async () => {
  // The learner has EXACTLY one repair's worth of Chai and two requests for
  // the same day are in flight. The loser is made to queue on the money row
  // while the winner commits, so whatever it learns about the existing repair,
  // it learns AFTER the debit.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The winner must be holding the money row BEFORE the contender starts, or
  // the two simply run in whatever order the pool hands out connections and
  // the test stops describing a race at all. Awaited below.
  let lockTaken!: () => void;
  const winnerHoldsTheRow = new Promise<void>((resolve) => {
    lockTaken = resolve;
  });

  const winner = db.transaction(async (tx) => {
    await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, RACE_USER_ID))
      .for("update");
    lockTaken();
    await held; // hold the row while the loser queues behind it
    await tx.insert(tokenLedgerTable).values({
      userId: RACE_USER_ID,
      delta: -STREAK_REPAIR_COST,
      balanceAfter: 0,
      reason: STREAK_REPAIR_REASON,
      refId: streakRepairRefId(D1),
    });
    await tx
      .update(userTokenStateTable)
      .set({ balance: 0, updatedAt: new Date() })
      .where(eq(userTokenStateTable.userId, RACE_USER_ID));
  });

  await winnerHoldsTheRow;
  const loser = repairStreak(RACE_USER_ID, D1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  await winner;

  const result = await loser;
  assert.equal(result.charged, false);
  assert.equal(result.state.balance, 0);
  // One repair, one debit, whatever the traffic looked like.
  assert.equal((await repairRows(RACE_USER_ID)).length, 1);
  assert.equal(await balanceOf(RACE_USER_ID), 0);
});

test("witness: reading the existing repair BEFORE the lock is what breaks", async () => {
  // The regression this ordering guards against, carried inline so the test
  // above cannot quietly stop discriminating. Same race, same data, the only
  // difference is that the existing-repair read happens before the money row
  // is taken, so the loser wakes with a stale "not yet repaired" and refuses a
  // day the learner has already paid for.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The winner must be holding the money row BEFORE the contender starts, or
  // the two simply run in whatever order the pool hands out connections and
  // the test stops describing a race at all. Awaited below.
  let lockTaken!: () => void;
  const winnerHoldsTheRow = new Promise<void>((resolve) => {
    lockTaken = resolve;
  });

  const winner = db.transaction(async (tx) => {
    await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, ORDER_USER_ID))
      .for("update");
    lockTaken();
    await held;
    await tx.insert(tokenLedgerTable).values({
      userId: ORDER_USER_ID,
      delta: -STREAK_REPAIR_COST,
      balanceAfter: 0,
      reason: STREAK_REPAIR_REASON,
      refId: streakRepairRefId(D1),
    });
    await tx
      .update(userTokenStateTable)
      .set({ balance: 0, updatedAt: new Date() })
      .where(eq(userTokenStateTable.userId, ORDER_USER_ID));
  });

  await winnerHoldsTheRow;

  const retiredOrdering = db.transaction(async (tx) => {
    // 1. ownership read FIRST (the retired ordering)
    const [already] = await tx
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, ORDER_USER_ID),
          eq(tokenLedgerTable.reason, STREAK_REPAIR_REASON),
          eq(tokenLedgerTable.refId, streakRepairRefId(D1)),
        ),
      )
      .limit(1);
    if (already) return "replayed" as const;
    // 2. and only then the money row, by which time the winner has debited it
    const [locked] = await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, ORDER_USER_ID))
      .for("update");
    return (locked?.balance ?? 0) < STREAK_REPAIR_COST
      ? ("refused" as const)
      : ("charged" as const);
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  await winner;

  assert.equal(
    await retiredOrdering,
    "refused",
    "the retired ordering must still demonstrate the defect this suite guards",
  );
});
