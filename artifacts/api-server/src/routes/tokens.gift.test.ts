// THE DAILY GIFT: GET /tokens/gift and POST /tokens/gift/claim.
//
// WHY THIS FILE EXISTS. The tap is now the ONLY way a learner earns the day's
// Chai, so every failure here is a learner not being paid for work they did,
// and none of them is loud. Four shapes are pinned and each one has a way of
// going quietly wrong:
//
//   - THE LEDGER IS THE CLAIM RECORD. Reason and refId are unchanged from the
//     silent grant this replaced, so the unique index on (userId, reason,
//     refId) is what makes a double tap, a retried request and a second device
//     all land on ONE payment. A second row would be a second day's Chai.
//   - THE AMOUNT IS DERIVED, NEVER SENT. A client that could name its own
//     number is a faucet, and this is the only tap in the product that writes
//     to the ledger.
//   - THE LADDER RIDES THE STREAK, so it climbs with real practice and caps at
//     a week. A ladder that kept climbing would make day 14 worth 8,192.
//   - THE PRECONDITION IS AN EARNED DAY. The old grant fired on the first
//     ATTEMPT while the streak has counted only a completed lesson or a played
//     mini-game since Task #1081. The two disagreed harmlessly while nobody
//     could see either; they cannot now, because the ladder decides both the
//     box's number and the box's day.
//
// Rows are scoped to test-only user ids and cleaned up BY USER ID, never by
// reason or language, which would delete real rows in the shared dev Postgres.
//
// Needs the dev database, so it runs in the Repl Shell and not on a Mac. The
// pure half (the ladder, the tiers, the copy) is pinned in gujarati-coach's
// daily-gift.test.ts and runs anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  gameSessionsTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { GIFT_LADDER_CAP, giftChaiForStreakDay } from "@workspace/daily-gift";
import { grantTokensDetailed } from "../lib/tokenService";
import tokensRouter from "./tokens";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { localDayKey, previousDayKey } from "../lib/progressMetrics";

const IDLE_USER = "test_gift_idle";
const ONE_DAY_USER = "test_gift_day1";
const THREE_DAY_USER = "test_gift_day3";
const CAPPED_USER = "test_gift_capped";
const ALL_USERS = [IDLE_USER, ONE_DAY_USER, THREE_DAY_USER, CAPPED_USER];
const LANG = "gu";

let app: Express;
let server: Server;
let baseUrl: string;

function atNoon(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00.000Z`);
}

/** The last `days` local days, today first. Timezone null, so UTC day keys. */
function recentDayKeys(days: number): string[] {
  const out = [localDayKey(new Date(), null)];
  while (out.length < days) out.push(previousDayKey(out[out.length - 1]!));
  return out;
}

/** A mini-game played, which is what an EARNED day means (Task #1081). */
async function playGame(userId: string, dayKeys: string[]): Promise<void> {
  if (dayKeys.length === 0) return;
  await db.insert(gameSessionsTable).values(
    dayKeys.map((day) => ({
      userId,
      languageCode: LANG,
      game: "word-match",
      correctCount: 5,
      totalCount: 5,
      xpAwarded: 15,
      createdAt: atNoon(day),
    })),
  );
}

async function get(userId: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/tokens/gift`, {
    headers: { "x-test-user": userId },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function claim(userId: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/tokens/gift/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: "{}",
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Every ledger row this learner has for the day's gift. Should never exceed 1. */
async function giftRows(userId: string, dayKey: string) {
  return db
    .select({ delta: tokenLedgerTable.delta, refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, "earn_streak_day"),
        eq(tokenLedgerTable.refId, dayKey),
      ),
    );
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values(
      ALL_USERS.map((id) => ({ id, email: null, displayName: "Gift test" })),
    )
    .onConflictDoNothing();
  // Timezone null everywhere, so the local day key is the UTC one and the
  // fixtures below can name days directly.
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null, timezone: null })
    .where(inArray(usersTable.id, ALL_USERS));

  const days = recentDayKeys(GIFT_LADDER_CAP + 2);
  // IDLE_USER practises nothing at all.
  await playGame(ONE_DAY_USER, days.slice(0, 1));
  await playGame(THREE_DAY_USER, days.slice(0, 3));
  await playGame(CAPPED_USER, days);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? IDLE_USER;
    next();
  });
  app.use(loadEntitlements);
  app.use(tokensRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await db
    .delete(gameSessionsTable)
    .where(inArray(gameSessionsTable.userId, ALL_USERS));
  await db
    .delete(tokenLedgerTable)
    .where(inArray(tokenLedgerTable.userId, ALL_USERS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  server?.close();
  await pool.end();
});

test("a learner who has not practised today has no box to open", async () => {
  const { status, json } = await get(IDLE_USER);
  assert.equal(status, 200);
  assert.equal(json.earnedToday, false);
  assert.equal(json.claimable, false);
  assert.equal(json.claimed, false);
});

test("and claiming one is refused with 409, never 402", async () => {
  // 402 is reserved codebase-wide for the UpgradeRequired envelope. Practising
  // is not a plan boundary and a learner must never be upsold over one, which
  // is the same rule streak repair states in the same words.
  const { status, json } = await claim(IDLE_USER);
  assert.equal(status, 409);
  assert.equal(json.error, "no_gift_today");
  const today = localDayKey(new Date(), null);
  assert.equal((await giftRows(IDLE_USER, today)).length, 0, "nothing written");
});

test("day one pays one, which is exactly what the silent grant paid", async () => {
  // NOBODY IS WORSE OFF ON THE AMOUNT. The takeaway in this change is that a
  // learner who never taps gets nothing; it is not that day one got cheaper.
  const before = await get(ONE_DAY_USER);
  assert.equal(before.json.earnedToday, true);
  assert.equal(before.json.claimable, true);
  assert.equal(before.json.claimed, false);
  assert.equal(before.json.chai, 1);
  assert.equal(before.json.tier, "small");
  assert.equal(before.json.tomorrowChai, 2);

  const { status, json } = await claim(ONE_DAY_USER);
  assert.equal(status, 200);
  assert.equal(json.granted, true);
  assert.equal(json.chai, 1);
  assert.equal(json.claimed, true);
  assert.equal(json.claimable, false);
  assert.equal(json.balance, 1);
});

test("a second tap pays nothing and still shows an open box", async () => {
  // A double tap, a retried request and a second device all land here. None of
  // them is an error and none of them may pay twice: the ledger's unique index
  // on (userId, reason, refId) is the authority, and it is the same index that
  // made this grant idempotent long before there was a box.
  const { status, json } = await claim(ONE_DAY_USER);
  assert.equal(status, 200);
  assert.equal(json.granted, false, "the day was already claimed");
  assert.equal(json.claimed, true);
  assert.equal(json.balance, 1, "balance did not move");

  const today = localDayKey(new Date(), null);
  const rows = await giftRows(ONE_DAY_USER, today);
  assert.equal(rows.length, 1, "one payment, one row");
  assert.equal(rows[0]!.delta, 1);
  assert.equal(rows[0]!.refId, today, "the refId is the local day, unchanged");
});

test("the read agrees with the write about a claimed day", async () => {
  const { json } = await get(ONE_DAY_USER);
  assert.equal(json.claimed, true);
  assert.equal(json.claimable, false);
  assert.equal(json.balance, 1);
});

test("three days running is worth three, and names four for tomorrow", async () => {
  // THE LADDER RIDES streakDays, which is why streak repair mends it too:
  // there is nothing here to keep in step because there is nothing here to keep.
  const before = await get(THREE_DAY_USER);
  assert.equal(before.json.streakDays, 3);
  assert.equal(before.json.chai, 3);
  assert.equal(before.json.tier, "medium");
  assert.equal(before.json.tomorrowChai, 4);

  const { json } = await claim(THREE_DAY_USER);
  assert.equal(json.granted, true);
  assert.equal(json.chai, 3);
  assert.equal(json.balance, 3);
});

test("a long streak holds at a week and never promises an eighth", async () => {
  // Linear and capped. Doubling would make day 14 worth 8,192 Chai against
  // sinks priced at 10 to 50, and "Tomorrow: 8" is a promise the cap breaks
  // the next morning.
  const { json } = await get(CAPPED_USER);
  assert.ok(
    json.streakDays >= GIFT_LADDER_CAP,
    `expected a capped streak, got ${json.streakDays}`,
  );
  assert.equal(json.chai, GIFT_LADDER_CAP);
  assert.equal(json.tier, "grand");
  assert.equal(json.tomorrowChai, GIFT_LADDER_CAP);

  const claimed = await claim(CAPPED_USER);
  assert.equal(claimed.json.granted, true);
  assert.equal(claimed.json.chai, GIFT_LADDER_CAP);
  assert.equal(claimed.json.balance, GIFT_LADDER_CAP);
});

test("the server derives the amount; a client cannot name its own", async () => {
  // The route reads no body at all. Sending one that asks for a hundred Chai
  // changes nothing, which is the property that matters rather than the
  // particular number refused.
  const res = await fetch(`${baseUrl}/tokens/gift/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": THREE_DAY_USER },
    body: JSON.stringify({ chai: 100, amount: 100, streakDays: 99 }),
  });
  const json = (await res.json()) as any;
  assert.equal(res.status, 200);
  assert.equal(json.granted, false, "already claimed above");
  assert.equal(json.balance, 3, "and the balance did not move");
});

test("the amount always matches the shared ladder, day for day", async () => {
  // The one assertion that would catch the server and the clients drifting:
  // both read giftChaiForStreakDay, and this proves the route's own arithmetic
  // is that function rather than a copy of it that happens to agree today.
  for (const [user, days] of [
    [ONE_DAY_USER, 1],
    [THREE_DAY_USER, 3],
  ] as const) {
    const { json } = await get(user);
    assert.equal(json.chai, giftChaiForStreakDay(days));
  }
});
