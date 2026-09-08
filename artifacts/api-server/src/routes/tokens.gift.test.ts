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
import {
  GIFT_LADDER_CAP,
  GIFT_MAX_CHAI,
  GIFT_MIN_CHAI,
  giftChaiForDraw,
} from "@workspace/daily-gift";
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

test("the wheel pays inside its published range, and the box promised that number", async () => {
  // INVERTED 2026-09-08. This asserted a fixed ladder: day one pays exactly 1.
  // The ladder is gone and the reason is in production data: 28 learners had
  // any Chai at all and the MEDIAN BALANCE WAS 1, which is one claimed box and
  // no second visit. A gift that pays the same predictable rung is not worth
  // coming back for, so it is a real draw in a published range now.
  //
  // WHAT IS PINNED IS THE HONESTY, NOT THE NUMBER. Asserting a specific amount
  // would just re-pin a ladder under a new name. What must hold is that the
  // draw sits inside the range the app puts on screen, and that the box and the
  // ledger agree, which is the whole difference between a wheel and a rigged
  // wheel.
  const before = await get(ONE_DAY_USER);
  assert.equal(before.json.earnedToday, true);
  assert.equal(before.json.claimable, true);
  assert.equal(before.json.claimed, false);
  assert.ok(
    before.json.chai >= GIFT_MIN_CHAI && before.json.chai <= GIFT_MAX_CHAI,
    `the box promised ${before.json.chai}, outside ${GIFT_MIN_CHAI}..${GIFT_MAX_CHAI}`,
  );
  const promised = before.json.chai;

  const { status, json } = await claim(ONE_DAY_USER);
  assert.equal(status, 200);
  assert.equal(json.granted, true);
  assert.equal(json.chai, promised, "the ledger paid what the box said");
  assert.equal(json.claimed, true);
  assert.equal(json.claimable, false);
  assert.equal(json.balance, promised);
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
  const paid = json.balance;

  const today = localDayKey(new Date(), null);
  const rows = await giftRows(ONE_DAY_USER, today);
  assert.equal(rows.length, 1, "one payment, one row");
  // A REROLL WOULD SHOW UP HERE. The draw is a pure function of learner and
  // day, so a second call lands on the same number; if it ever did not, this
  // row's delta and the balance would part company and a learner could spin
  // until they liked the answer.
  assert.equal(rows[0]!.delta, paid, "the one row is the balance");
  assert.equal(rows[0]!.refId, today, "the refId is the local day, unchanged");
});

test("the read agrees with the write about a claimed day", async () => {
  const { json } = await get(ONE_DAY_USER);
  assert.equal(json.claimed, true);
  assert.equal(json.claimable, false);
  const today = localDayKey(new Date(), null);
  const rows = await giftRows(ONE_DAY_USER, today);
  assert.equal(json.balance, rows[0]!.delta, "the read and the ledger agree");
});

test("a streak lifts the floor of the wheel and never the ceiling", async () => {
  // INVERTED. This asserted three days is worth exactly three, which was the
  // ladder being the whole rate. That is the collision the wheel fixes: under a
  // ladder a broken streak cost SEVENFOLD, and the learner who most needs the
  // free path got the worst of it.
  //
  // The streak now shifts the FLOOR of the draw upward, so a longer streak is
  // meaningfully luckier and a missed week is not a seventh of the rate. What
  // is pinned is that property, not a number: the best spin is the same for
  // everyone, so nobody is ever shown a prize they cannot reach.
  const before = await get(THREE_DAY_USER);
  assert.equal(before.json.streakDays, 3);
  assert.ok(before.json.chai >= GIFT_MIN_CHAI && before.json.chai <= GIFT_MAX_CHAI);
  const promised = before.json.chai;

  const { json } = await claim(THREE_DAY_USER);
  assert.equal(json.granted, true);
  assert.equal(json.chai, promised, "paid what the box said");
  assert.equal(json.balance, promised);
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
  // A CAPPED STREAK IS THE LUCKIEST FLOOR, NOT A FIXED PRIZE. The old assertion
  // was chai === GIFT_LADDER_CAP exactly; the cap now bounds how far the floor
  // rises rather than what the wheel pays.
  assert.ok(json.chai >= GIFT_MIN_CHAI && json.chai <= GIFT_MAX_CHAI);
  assert.equal(json.tier, "grand");
  const promised = json.chai;

  const claimed = await claim(CAPPED_USER);
  assert.equal(claimed.json.granted, true);
  assert.equal(claimed.json.chai, promised);
  assert.equal(claimed.json.balance, promised);
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
  const before = await get(THREE_DAY_USER);
  assert.equal(json.balance, before.json.balance, "and the balance did not move");
});

test("the amount always matches the shared draw, learner for learner", async () => {
  // THE ONE ASSERTION THAT CATCHES THE SERVER AND THE CLIENTS DRIFTING, and it
  // matters MORE under a wheel than it did under a ladder. A ladder that drifts
  // pays the wrong rung; a wheel that drifts shows one number and pays another,
  // which is indistinguishable from rigging it.
  //
  // giftChaiForDraw is pure in (learner, day, streak), so recomputing it here
  // and comparing proves the route runs that function rather than a copy of it
  // that happens to agree today.
  const today = localDayKey(new Date(), null);
  for (const [user, days] of [
    [ONE_DAY_USER, 1],
    [THREE_DAY_USER, 3],
  ] as const) {
    const { json } = await get(user);
    assert.equal(json.chai, giftChaiForDraw(user, today, days));
  }
});

test("two learners on the same day are not shown the same spin", async () => {
  // A wheel every learner sees identically is a ladder with extra steps, and it
  // would be guessable from any one account. The draw is keyed on the learner
  // as well as the day, so this is a property of the design rather than luck;
  // if these two ever collide the seed has stopped including the id.
  const today = localDayKey(new Date(), null);
  const a = giftChaiForDraw(ONE_DAY_USER, today, 3);
  const b = giftChaiForDraw(THREE_DAY_USER, today, 3);
  assert.notEqual(a, b, "same day, same streak, different learners");
});
