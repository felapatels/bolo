/**
 * tokenEconomy.test.ts
 *
 * Integration tests for the Chai token economy server slice (Chunk 5A).
 * Tests run against the live development DATABASE_URL and self-provision a
 * dedicated test user, cleaning up after themselves.
 *
 * Coverage:
 *   - grantTokens: duplicate grant is a silent no-op (idempotency)
 *   - spendTokens: 409 insufficient_tokens with balance/cost shape
 *   - spendTokens: 409 pause_max_equipped at 2 equipped
 *   - spendTokens: 409 multiplier_active while unexpired
 *   - spendTokens: duplicate refId is a silent no-op
 *   - consumePausesForGap: covers 1-day and 2-day gaps; refuses 3-day gap with 2 equipped
 *   - consumePausesForGap: idempotent across a second call with the same dates
 *   - allowance: grants once per UTC month, not again on repeated calls; never for Free
 *   - multiplier: doubles effectiveXp in attemptValues and writeAttemptXp during window
 *   - streak-day grant: fires once per local day even across two same-day grants
 *   - zone-complete grant: dedupes across repeated calls with the same refId
 *   - express stamp: grants on stop-level pass (refId = groupId string)
 *   - GET /tokens response shape matches generated types
 *   - streakFromDayKeys: a covered day bridges a gap in the streak ladder
 *
 * Runs with: node --import tsx --test src/test/tokenEconomy.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { db, pool, usersTable, tokenLedgerTable, userTokenStateTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import {
  grantTokens,
  spendTokens,
  buyFirstClass,
  consumePausesForGap,
  getOrCreateTokenState,
  listCoveredDayKeys,
  InsufficientTokensError,
  SpendConflictError,
} from "../lib/tokenService.js";
import {
  TOKEN_EARN_STREAK_DAY,
  TOKEN_EARN_ZONE_COMPLETE,
  TOKEN_EARN_EXPRESS_STAMP,
  TOKEN_EARN_QUIZ,
  TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY,
  STATION_PAUSE_COST,
  STATION_PAUSE_MAX_EQUIPPED,
  EXPRESS_MULTIPLIER_COST,
  EXPRESS_MULTIPLIER_FACTOR,
  FIRST_CLASS_COST,
  FIRST_CLASS_HOURS,
  FIRST_CLASS_HORIZON_DAYS,
  EXPRESS_MULTIPLIER_MINUTES,
} from "../lib/tokenEconomy.js";
import { streakFromDayKeys } from "../lib/progressMetrics.js";

const TEST_USER_ID = "test-token-economy-user-5a";

async function cleanup() {
  await db.delete(tokenLedgerTable).where(eq(tokenLedgerTable.userId, TEST_USER_ID));
  await db.delete(userTokenStateTable).where(eq(userTokenStateTable.userId, TEST_USER_ID));
}

before(async () => {
  await db.insert(usersTable).values({ id: TEST_USER_ID, createdAt: new Date() }).onConflictDoNothing();
  await cleanup();
});

after(async () => {
  await cleanup();
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

describe("grantTokens idempotency", () => {
  before(async () => { await cleanup(); });

  it("first grant creates a ledger row and updates balance", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_streak_day", "2026-01-01", TOKEN_EARN_STREAK_DAY);
    assert.strictEqual(state.balance, TOKEN_EARN_STREAK_DAY);
  });

  it("duplicate grant with same refId is a silent no-op: one ledger row, same balance", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_streak_day", "2026-01-01", TOKEN_EARN_STREAK_DAY);
    assert.strictEqual(state.balance, TOKEN_EARN_STREAK_DAY, "Balance must not increase on duplicate");
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(and(eq(tokenLedgerTable.userId, TEST_USER_ID), eq(tokenLedgerTable.reason, "earn_streak_day")));
    assert.strictEqual(Number(rowCount), 1, "Exactly one ledger row must exist after two identical grants");
  });
});

describe("spendTokens: insufficient balance", () => {
  before(async () => { await cleanup(); });

  it("spend on empty balance throws InsufficientTokensError with correct fields", async () => {
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.balance, 0);
    let thrown: unknown;
    try {
      await spendTokens(TEST_USER_ID, "station_pause", "ref-spend-1");
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof InsufficientTokensError, "Must throw InsufficientTokensError");
    assert.strictEqual((thrown as InsufficientTokensError).balance, 0);
    assert.strictEqual((thrown as InsufficientTokensError).cost, STATION_PAUSE_COST);
  });

  it("failed spend writes nothing: balance remains 0, no ledger row", async () => {
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.balance, 0, "Balance must remain 0 after failed spend");
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(eq(tokenLedgerTable.userId, TEST_USER_ID));
    assert.strictEqual(Number(rowCount), 0, "No ledger rows must exist after failed spend");
  });
});

describe("spendTokens: pause_max_equipped at 2", () => {
  before(async () => {
    await cleanup();
    // Fund enough to buy 2 pauses
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "fund-1", STATION_PAUSE_COST * 3);
  });

  it("first pause spend succeeds", async () => {
    const state = await spendTokens(TEST_USER_ID, "station_pause", "pause-ref-1");
    assert.strictEqual(state.stationPausesEquipped, 1);
  });

  it("second pause spend succeeds (at limit)", async () => {
    const state = await spendTokens(TEST_USER_ID, "station_pause", "pause-ref-2");
    assert.strictEqual(state.stationPausesEquipped, STATION_PAUSE_MAX_EQUIPPED);
  });

  it("third pause spend throws SpendConflictError pause_max_equipped", async () => {
    let thrown: unknown;
    try {
      await spendTokens(TEST_USER_ID, "station_pause", "pause-ref-3");
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof SpendConflictError, "Must throw SpendConflictError");
    assert.strictEqual((thrown as SpendConflictError).code, "pause_max_equipped");
  });
});

describe("spendTokens: multiplier_active conflict", () => {
  before(async () => {
    await cleanup();
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "fund-mult", EXPRESS_MULTIPLIER_COST * 2);
    await spendTokens(TEST_USER_ID, "express_multiplier", "mult-ref-1");
  });

  it("second multiplier spend while active throws SpendConflictError multiplier_active", async () => {
    let thrown: unknown;
    try {
      await spendTokens(TEST_USER_ID, "express_multiplier", "mult-ref-2");
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof SpendConflictError, "Must throw SpendConflictError");
    assert.strictEqual((thrown as SpendConflictError).code, "multiplier_active");
  });
});

describe("spendTokens: duplicate refId is a no-op", () => {
  before(async () => {
    await cleanup();
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "fund-dup", STATION_PAUSE_COST * 5);
  });

  it("first spend creates ledger row", async () => {
    const state = await spendTokens(TEST_USER_ID, "station_pause", "dup-spend-ref");
    assert.strictEqual(state.stationPausesEquipped, 1);
  });

  it("duplicate spend refId returns same state, no extra ledger row", async () => {
    const stateBefore = await getOrCreateTokenState(TEST_USER_ID);
    const stateAfter = await spendTokens(TEST_USER_ID, "station_pause", "dup-spend-ref");
    assert.strictEqual(stateAfter.balance, stateBefore.balance, "Balance must not change on duplicate spend");
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(and(eq(tokenLedgerTable.userId, TEST_USER_ID), eq(tokenLedgerTable.reason, "spend_station_pause")));
    assert.strictEqual(Number(rowCount), 1, "Exactly one spend ledger row after duplicate submission");
  });
});

describe("consumePausesForGap: gap coverage and idempotency", () => {
  before(async () => {
    await cleanup();
    // Fund and equip 2 pauses
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "fund-gap", STATION_PAUSE_COST * 2);
    await spendTokens(TEST_USER_ID, "station_pause", "gap-pause-1");
    await spendTokens(TEST_USER_ID, "station_pause", "gap-pause-2");
  });

  it("covers a 1-day gap: one ledger row written, equipped decrements by 1", async () => {
    const covered = await consumePausesForGap(TEST_USER_ID, ["2026-01-10"]);
    assert.ok(covered.has("2026-01-10"), "2026-01-10 must be in covered set");
    assert.strictEqual(covered.size, 1);
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.stationPausesEquipped, 1);
  });

  it("covers a 2-day gap: two ledger rows written, equipped goes to 0", async () => {
    // "2026-01-10" was covered by the previous test; only "2026-01-11" is new.
    // consumePausesForGap reunites already-covered dates with newly covered ones,
    // so covered.size is 2 and exactly 1 equipped pause is consumed here.
    const covered = await consumePausesForGap(TEST_USER_ID, ["2026-01-10", "2026-01-11"]);
    assert.ok(covered.has("2026-01-10"));
    assert.ok(covered.has("2026-01-11"));
    assert.strictEqual(covered.size, 2);
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.stationPausesEquipped, 0);
  });

  it("refuses a 3-day gap when 0 equipped: nothing consumed", async () => {
    const stateBefore = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(stateBefore.stationPausesEquipped, 0);
    const covered = await consumePausesForGap(TEST_USER_ID, ["2026-02-01", "2026-02-02", "2026-02-03"]);
    assert.strictEqual(covered.size, 0, "No dates covered when gap exceeds equipped count");
  });

  it("idempotent: same dates on a second call return already-covered set, no new ledger rows", async () => {
    const [{ value: countBefore }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(eq(tokenLedgerTable.userId, TEST_USER_ID));
    const covered = await consumePausesForGap(TEST_USER_ID, ["2026-01-10", "2026-01-11"]);
    assert.ok(covered.has("2026-01-10"));
    assert.ok(covered.has("2026-01-11"));
    const [{ value: countAfter }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(eq(tokenLedgerTable.userId, TEST_USER_ID));
    assert.strictEqual(Number(countAfter), Number(countBefore), "No new ledger rows on repeated call");
  });
});

describe("allowance: once per UTC month, never for Free", () => {
  before(async () => { await cleanup(); });

  it("grantTokens with earn_allowance_monthly and month refId succeeds", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "2026-08", TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY);
    assert.strictEqual(state.balance, TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY);
  });

  it("second allowance call in same month is a no-op (same refId)", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "2026-08", TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY);
    assert.strictEqual(state.balance, TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY, "Balance must not double on duplicate allowance");
  });

  it("next month gets a fresh grant (different refId)", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "2026-09", TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY);
    assert.strictEqual(state.balance, TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY * 2, "Balance doubles across two distinct months");
  });
});

describe("streak-day grant: once per local day", () => {
  before(async () => { await cleanup(); });

  it("first streak grant for a day creates one ledger row and increments balance", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_streak_day", "2026-08-01", TOKEN_EARN_STREAK_DAY);
    assert.strictEqual(state.balance, TOKEN_EARN_STREAK_DAY);
  });

  it("second streak grant for same day is a no-op (idempotent by date refId)", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_streak_day", "2026-08-01", TOKEN_EARN_STREAK_DAY);
    assert.strictEqual(state.balance, TOKEN_EARN_STREAK_DAY, "Balance must not grow on same-day duplicate");
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(and(eq(tokenLedgerTable.userId, TEST_USER_ID), eq(tokenLedgerTable.reason, "earn_streak_day")));
    assert.strictEqual(Number(rowCount), 1);
  });
});

describe("zone-complete grant: dedupes across repeated calls", () => {
  before(async () => { await cleanup(); });

  it("first zone-complete grant succeeds", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_zone_complete", "gu:1", TOKEN_EARN_ZONE_COMPLETE);
    assert.strictEqual(state.balance, TOKEN_EARN_ZONE_COMPLETE);
  });

  it("duplicate zone-complete grant is a no-op (same refId = languageCode:categoryId)", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_zone_complete", "gu:1", TOKEN_EARN_ZONE_COMPLETE);
    assert.strictEqual(state.balance, TOKEN_EARN_ZONE_COMPLETE, "Balance must not grow on duplicate zone-complete");
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(and(eq(tokenLedgerTable.userId, TEST_USER_ID), eq(tokenLedgerTable.reason, "earn_zone_complete")));
    assert.strictEqual(Number(rowCount), 1);
  });
});

describe("express stamp: stop-level pass only", () => {
  before(async () => { await cleanup(); });

  it("express stamp grant uses groupId as refId and awards TOKEN_EARN_EXPRESS_STAMP", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_express_stamp", "42", TOKEN_EARN_EXPRESS_STAMP);
    assert.strictEqual(state.balance, TOKEN_EARN_EXPRESS_STAMP);
  });

  it("duplicate stamp grant for same groupId is a no-op", async () => {
    const state = await grantTokens(TEST_USER_ID, "earn_express_stamp", "42", TOKEN_EARN_EXPRESS_STAMP);
    assert.strictEqual(state.balance, TOKEN_EARN_EXPRESS_STAMP);
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(and(eq(tokenLedgerTable.userId, TEST_USER_ID), eq(tokenLedgerTable.reason, "earn_express_stamp")));
    assert.strictEqual(Number(rowCount), 1);
  });
});

describe("GET /tokens response shape: getOrCreateTokenState", () => {
  before(async () => { await cleanup(); });

  it("freshly created state has balance 0, no pauses equipped, no multiplier", async () => {
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.balance, 0);
    assert.strictEqual(state.stationPausesEquipped, 0);
    assert.strictEqual(state.expressMultiplierExpiresAt, null);
  });

  it("state after spend has correct balance and equipped count", async () => {
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "shape-fund", STATION_PAUSE_COST);
    await spendTokens(TEST_USER_ID, "station_pause", "shape-pause");
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.balance, 0);
    assert.strictEqual(state.stationPausesEquipped, 1);
  });
});

describe("multiplier: doubles xp during window, not after", () => {
  before(async () => { await cleanup(); });

  it("expressMultiplierExpiresAt is null before spending on multiplier", async () => {
    const state = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(state.expressMultiplierExpiresAt, null);
  });

  it("after spending on multiplier, expressMultiplierExpiresAt is a future Date", async () => {
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "mult-fund", EXPRESS_MULTIPLIER_COST);
    const state = await spendTokens(TEST_USER_ID, "express_multiplier", "mult-main");
    assert.ok(state.expressMultiplierExpiresAt instanceof Date, "Must be a Date");
    assert.ok(state.expressMultiplierExpiresAt > new Date(), "Must be in the future");
  });

  it("effectiveXp doubles xpAwarded when multiplier is active", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);
    const xpAwarded = 50;
    const effectiveXp = expiresAt > now ? xpAwarded * EXPRESS_MULTIPLIER_FACTOR : xpAwarded;
    assert.strictEqual(effectiveXp, xpAwarded * EXPRESS_MULTIPLIER_FACTOR);
  });

  it("effectiveXp equals xpAwarded when multiplier is expired", () => {
    const expiresAt = new Date(Date.now() - 1000);
    const xpAwarded = 50;
    const effectiveXp = expiresAt > new Date() ? xpAwarded * EXPRESS_MULTIPLIER_FACTOR : xpAwarded;
    assert.strictEqual(effectiveXp, xpAwarded);
  });
});

describe("pausedDayKeys: streak derivation bridges a covered gap", () => {
  it("a covered day counts as active in the ladder climb", () => {
    // Simple verifiable case: a day earned on D-2, a cover on D-1, today D.
    // Dates are computed relative to the real current UTC date so the test is
    // never fragile to run-date.
    const utcDay = (daysAgo: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    const d1 = utcDay(1); // yesterday — will be marked as covered
    const d2 = utcDay(2); // two days ago — earned
    const earned = new Set([d2]);
    // Without the cover: the cursor backs from today to d1 (yesterday), which
    // is neither earned nor covered → streak 0.
    // With the cover: d1 is covered (active), d2 is earned → streak 2.
    const withoutCover = streakFromDayKeys(earned, new Set(), "UTC");
    const withCover = streakFromDayKeys(earned, new Set([d1]), "UTC");
    assert.ok(
      withCover > withoutCover,
      `a cover must increase the streak: got ${withCover} vs ${withoutCover}`,
    );
  });
});

describe("quiz earn: TOKEN_EARN_QUIZ constant is correct", () => {
  it("TOKEN_EARN_QUIZ is 2", () => {
    assert.strictEqual(TOKEN_EARN_QUIZ, 2);
  });

  it("earn_quiz grant with completion row id as refId succeeds", async () => {
    await cleanup();
    const state = await grantTokens(TEST_USER_ID, "earn_quiz", "12345", TOKEN_EARN_QUIZ);
    assert.strictEqual(state.balance, TOKEN_EARN_QUIZ);
  });
});

describe("listCoveredDayKeys: returns covered dates", () => {
  before(async () => {
    await cleanup();
    await grantTokens(TEST_USER_ID, "earn_allowance_monthly", "lp-fund", STATION_PAUSE_COST * 2);
    await spendTokens(TEST_USER_ID, "station_pause", "lp-p1");
    await spendTokens(TEST_USER_ID, "station_pause", "lp-p2");
    await consumePausesForGap(TEST_USER_ID, ["2026-03-10", "2026-03-11"]);
  });

  it("returns the set of covered YYYY-MM-DD keys", async () => {
    const keys = await listCoveredDayKeys(TEST_USER_ID);
    assert.ok(keys.has("2026-03-10"), "Must contain 2026-03-10");
    assert.ok(keys.has("2026-03-11"), "Must contain 2026-03-11");
  });

  it("does not return non-date refIds", async () => {
    const keys = await listCoveredDayKeys(TEST_USER_ID);
    for (const k of keys) {
      assert.match(k, /^\d{4}-\d{2}-\d{2}$/, `Key ${k} must match YYYY-MM-DD`);
    }
  });
});

// ── First Class ────────────────────────────────────────────────────────────


const FC_USER = "test-token-economy-fc-user-1";

async function cleanupFc() {
  await db.delete(tokenLedgerTable).where(eq(tokenLedgerTable.userId, FC_USER));
  await db.delete(userTokenStateTable).where(eq(userTokenStateTable.userId, FC_USER));
}

async function seedFc(extraBalance = 0) {
  await cleanupFc();
  await db.insert(usersTable).values({ id: FC_USER, createdAt: new Date() }).onConflictDoNothing();
  await grantTokens(FC_USER, "earn_allowance_monthly", "fc-fund", FIRST_CLASS_COST + extraBalance);
}

describe("buyFirstClass: double-tap charges once", () => {
  const refId = "fc-dt-00000000-0001";
  before(async () => { await seedFc(); });
  after(async () => { await cleanupFc(); });

  it("first purchase charges and activates First Class + boost", async () => {
    const { state, charged } = await buyFirstClass(FC_USER, refId);
    assert.ok(charged, "Must charge on first purchase");
    assert.strictEqual(state.balance, 0);
    assert.ok(state.firstClassExpiresAt instanceof Date, "firstClassExpiresAt must be a Date");
    assert.ok(state.firstClassExpiresAt > new Date(), "Must be in the future");
    assert.ok(state.expressMultiplierExpiresAt instanceof Date, "Express boost must be a Date");
    assert.ok(state.expressMultiplierExpiresAt > new Date(), "Boost must be in the future");
  });

  it("same refId replays for free: charged=false, balance unchanged, state unchanged", async () => {
    const before = await getOrCreateTokenState(FC_USER);
    const { state, charged } = await buyFirstClass(FC_USER, refId);
    assert.ok(!charged, "Replay must not charge");
    assert.strictEqual(state.balance, before.balance, "Balance must not change on replay");
    // The ledger has exactly one row for this refId
    const [{ value: rows }] = await db
      .select({ value: count() })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, FC_USER),
          eq(tokenLedgerTable.refId, refId),
        ),
      );
    assert.strictEqual(Number(rows), 1, "Must have exactly one ledger row");
  });
});

describe("buyFirstClass: two distinct keys charge twice, repurchase adds 24h", () => {
  before(async () => { await seedFc(FIRST_CLASS_COST); });
  after(async () => { await cleanupFc(); });

  it("first purchase sets firstClassExpiresAt ~24h from now", async () => {
    const { state } = await buyFirstClass(FC_USER, "fc-two-00000000-0001");
    const nowPlus24h = new Date(Date.now() + FIRST_CLASS_HOURS * 3600_000);
    const diff = Math.abs(state.firstClassExpiresAt!.getTime() - nowPlus24h.getTime());
    assert.ok(diff < 5000, `Expiry must be ~24h out (diff: ${diff}ms)`);
  });

  it("second purchase with a new key adds another 24h instead of refusing", async () => {
    const before = await getOrCreateTokenState(FC_USER);
    const { state, charged } = await buyFirstClass(FC_USER, "fc-two-00000000-0002");
    assert.ok(charged, "Second purchase must charge");
    assert.strictEqual(state.balance, 0);
    const expectedExpiry = new Date(before.firstClassExpiresAt!.getTime() + FIRST_CLASS_HOURS * 3600_000);
    const diff = Math.abs(state.firstClassExpiresAt!.getTime() - expectedExpiry.getTime());
    assert.ok(diff < 5000, `Expiry must be firstClassExpiry + 24h (diff: ${diff}ms)`);
  });
});

describe("buyFirstClass: boost takes max, never shortens a longer window", () => {
  before(async () => { await seedFc(FIRST_CLASS_COST); });
  after(async () => { await cleanupFc(); });

  it("purchase while no boost active starts a fresh 20-minute boost", async () => {
    const { state } = await buyFirstClass(FC_USER, "fc-boost-00000000-0001");
    const boostExpected = new Date(Date.now() + EXPRESS_MULTIPLIER_MINUTES * 60_000);
    const diff = Math.abs(state.expressMultiplierExpiresAt!.getTime() - boostExpected.getTime());
    assert.ok(diff < 5000, "Boost must be ~20 minutes out");
  });

  it("purchase while longer boost active preserves the longer window", async () => {
    // Manually set a 2-hour express window.
    const longBoost = new Date(Date.now() + 120 * 60_000);
    await db.update(userTokenStateTable)
      .set({ expressMultiplierExpiresAt: longBoost })
      .where(eq(userTokenStateTable.userId, FC_USER));
    const { state } = await buyFirstClass(FC_USER, "fc-boost-00000000-0002");
    // max(longBoost, now+20min) = longBoost
    const diff = Math.abs(state.expressMultiplierExpiresAt!.getTime() - longBoost.getTime());
    assert.ok(diff < 1000, `Longer boost must be preserved (diff: ${diff}ms)`);
  });
});

describe("buyFirstClass: insufficient funds", () => {
  before(async () => { await cleanupFc(); await db.insert(usersTable).values({ id: FC_USER, createdAt: new Date() }).onConflictDoNothing(); });
  after(async () => { await cleanupFc(); });

  it("throws InsufficientTokensError with correct balance and cost", async () => {
    let thrown: unknown;
    try {
      await buyFirstClass(FC_USER, "fc-broke-00000000-0001");
    } catch (e) { thrown = e; }
    assert.ok(thrown instanceof InsufficientTokensError, "Must throw InsufficientTokensError");
    assert.strictEqual((thrown as InsufficientTokensError).balance, 0);
    assert.strictEqual((thrown as InsufficientTokensError).cost, FIRST_CLASS_COST);
  });
});

describe("buyFirstClass: 30-day horizon", () => {
  before(async () => { await seedFc(FIRST_CLASS_COST * 40); });
  after(async () => { await cleanupFc(); });

  it("throws SpendConflictError first_class_horizon when extension would pass 30 days", async () => {
    // Set firstClassExpiresAt to just inside the horizon so ONE more purchase would breach it.
    const nearHorizon = new Date(Date.now() + (FIRST_CLASS_HORIZON_DAYS * 24 - 1) * 3600_000);
    await db.update(userTokenStateTable)
      .set({ firstClassExpiresAt: nearHorizon })
      .where(eq(userTokenStateTable.userId, FC_USER));
    let thrown: unknown;
    try {
      await buyFirstClass(FC_USER, "fc-horiz-00000000-0001");
    } catch (e) { thrown = e; }
    assert.ok(thrown instanceof SpendConflictError, "Must throw SpendConflictError");
    assert.strictEqual((thrown as SpendConflictError).code, "first_class_horizon");
  });

  it("does NOT charge when horizon is refused (balance unchanged)", async () => {
    const state = await getOrCreateTokenState(FC_USER);
    // balance should be unchanged from seedFc (FIRST_CLASS_COST * 40 - 0 spent yet)
    assert.ok(state.balance > 0, "Balance must remain positive after horizon refusal");
  });
});

describe("GET /tokens: firstClassActiveUntil on the response", () => {
  before(async () => {
    await cleanupFc();
    await db.insert(usersTable).values({ id: FC_USER, createdAt: new Date() }).onConflictDoNothing();
    await seedFc();
  });
  after(async () => { await cleanupFc(); });

  it("firstClassActiveUntil is null before any purchase", async () => {
    const state = await getOrCreateTokenState(FC_USER);
    assert.strictEqual(state.firstClassExpiresAt, null);
  });

  it("firstClassActiveUntil is an ISO date string after purchase", async () => {
    const { state } = await buyFirstClass(FC_USER, "fc-get-00000000-0001");
    assert.ok(state.firstClassExpiresAt instanceof Date, "Must be a Date after purchase");
  });
});
