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
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import tokensRouter from "./tokens";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { grantTokens, repairStreak, listCoveredDayKeys } from "../lib/tokenService";
import { STREAK_REPAIR_COST } from "../lib/tokenEconomy";
import {
  STREAK_REPAIR_REASON,
  STREAK_REPAIR_WINDOW_DAYS,
  findRepairableBreak,
  streakRepairRefId,
} from "../lib/streakRepair";
import { computeProgressMetrics, localDayKey, previousDayKey } from "../lib/progressMetrics";

// Streak repair (owner ruling, Aug 7 2026). The ratified exception to the
// delight-only Chai spine: it buys back a streak lost to life happening, and
// must never buy an advantage. This suite pins the shape that keeps it honest:
//   - the repair writes NO streak number; it covers one day and the ladder
//     re-derives, so every other day in the restored run is still real practice,
//   - the day is chosen by the SERVER (empty request body, server-composed
//     ledger key), so nothing about what is bought comes from the client,
//   - a replay charges nothing, an empty tin is refused in the 409 Chai copy
//     register, and refusals are never 402 — a broken streak is not a plan
//     boundary and must never become an upsell,
//   - eligibility is re-derived on the write path, so a client that offers a
//     repair it should not have still cannot buy one,
//   - the money survives contention: the request that loses the race replays
//     for free rather than being refused for funds it need not spend twice.
// Live shared Postgres: test-only ids, full cleanup.
// See .agents/memory/api-server-tests.md and docs/CODEBASE-FACTS.md section 4.

const TEST_USER_ID = "test_streak_repair";
const POOR_USER_ID = "test_streak_repair_poor";
const AWAY_USER_ID = "test_streak_repair_away";
const OLD_USER_ID = "test_streak_repair_old";
const RACE_USER_ID = "test_streak_repair_race";
const ORDER_USER_ID = "test_streak_repair_order";
const ALL_USERS = [
  TEST_USER_ID,
  POOR_USER_ID,
  AWAY_USER_ID,
  OLD_USER_ID,
  RACE_USER_ID,
  ORDER_USER_ID,
];

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

function atNoon(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00.000Z`);
}

async function practise(userId: string, dayKeys: string[]): Promise<void> {
  await db.insert(attemptsTable).values(
    dayKeys.map((day) => ({
      userId,
      languageCode: "gu",
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
  await db
    .delete(attemptsTable)
    .where(inArray(attemptsTable.userId, ALL_USERS));
  await db
    .delete(tokenLedgerTable)
    .where(inArray(tokenLedgerTable.userId, ALL_USERS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  await db
    .insert(usersTable)
    .values(ALL_USERS.map((id) => ({ id, email: `${id}@test.invalid` })))
    .onConflictDoNothing();

  // A slip: practice today and the day before yesterday, with yesterday empty.
  await practise(TEST_USER_ID, [D2, TODAY]);
  await practise(POOR_USER_ID, [D2, TODAY]);
  await practise(RACE_USER_ID, [D2, TODAY]);
  await practise(ORDER_USER_ID, [D2, TODAY]);
  // A hole three days back, with the run above it intact: real break, but
  // older than the window.
  await practise(OLD_USER_ID, [D4, D2, D1, TODAY]);
  // AWAY_USER_ID practises nothing: an absence, not a slip.

  await grantTokens(TEST_USER_ID, "earn_streak_day", "__seed_repair", STREAK_REPAIR_COST + 5);
  await grantTokens(POOR_USER_ID, "earn_streak_day", "__seed_poor", STREAK_REPAIR_COST - 1);
  await grantTokens(OLD_USER_ID, "earn_streak_day", "__seed_old", STREAK_REPAIR_COST + 5);
  // Exactly one repair's worth: the racing pair below have to share it.
  await grantTokens(RACE_USER_ID, "earn_streak_day", "__seed_race", STREAK_REPAIR_COST);
  await grantTokens(ORDER_USER_ID, "earn_streak_day", "__seed_order", STREAK_REPAIR_COST);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string; userTimezone: string | null }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
    (req as unknown as { userTimezone: string | null }).userTimezone = null;
    next();
  });
  app.use(tokensRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ALL_USERS));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, ALL_USERS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
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
  // is still derived from attempts, and it now climbs through the covered day.
  const attempts = await db
    .select({ createdAt: attemptsTable.createdAt, passed: attemptsTable.passed })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, TEST_USER_ID));
  const covered = await listCoveredDayKeys(TEST_USER_ID);
  assert.ok(covered.has(D1), "the repaired day must read back as covered");
  const metrics = computeProgressMetrics(attempts as any, null, covered);
  assert.equal(metrics.currentStreakDays, 3);
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
  // The write path re-derives eligibility rather than trusting the caller —
  // there is no day in the request to forge in the first place.
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

  const winner = db.transaction(async (tx) => {
    await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, RACE_USER_ID))
      .for("update");
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
  // above cannot quietly stop discriminating. Same race, same data — the only
  // difference is that the existing-repair read happens before the money row
  // is taken, so the loser wakes with a stale "not yet repaired" and refuses a
  // day the learner has already paid for.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const winner = db.transaction(async (tx) => {
    await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, ORDER_USER_ID))
      .for("update");
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
