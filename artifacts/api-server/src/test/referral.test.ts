/**
 * referral.test.ts
 *
 * Referral R1: the ONE new test file the spec permits for this genuinely new
 * server surface. Covers code minting (uniqueness, stability, unambiguous
 * alphabet), redeem attribution (happy path, double-redeem, self-referral,
 * unknown code, exact owner copy), and the activation hook (both sides
 * granted exactly once with amounts read from the economy constants, repeat
 * activation grants nothing, grants visible in the ledger).
 *
 * Route-layer logic (zod parse, status mapping) is exercised at the lib/DB
 * layer -- this codebase's api tests have no HTTP harness (see
 * signalWaves.test.ts and gameSessions.test.ts, same pattern).
 *
 * Tests run against the live development DATABASE_URL and self-provision
 * dedicated test users.
 *
 * Runs with: node --import tsx --test src/test/referral.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import {
  db,
  pool,
  usersTable,
  referralRedemptionsTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_COPY,
  getOrCreateReferralCode,
  normalizeReferralCode,
  redeemReferralCode,
  activateReferralIfPending,
} from "../lib/referral.js";
import { getOrCreateTokenState } from "../lib/tokenService.js";
import {
  REFERRAL_REWARD_REFERRER_CHAI,
  REFERRAL_REWARD_REFEREE_CHAI,
} from "../lib/tokenEconomy.js";

const REFERRER_ID = "test-referral-r1-referrer";
const REFEREE_ID = "test-referral-r1-referee";
const OTHER_ID = "test-referral-r1-other";
const ALL_IDS = [REFERRER_ID, REFEREE_ID, OTHER_ID];

async function cleanup() {
  await db
    .delete(referralRedemptionsTable)
    .where(inArray(referralRedemptionsTable.refereeUserId, ALL_IDS));
  await db
    .delete(referralRedemptionsTable)
    .where(inArray(referralRedemptionsTable.referrerUserId, ALL_IDS));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, ALL_IDS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_IDS));
  await db
    .update(usersTable)
    .set({ referralCode: null })
    .where(inArray(usersTable.id, ALL_IDS));
}

before(async () => {
  for (const id of ALL_IDS) {
    await db.insert(usersTable).values({ id, createdAt: new Date() }).onConflictDoNothing();
  }
  await cleanup();
});

after(async () => {
  await cleanup();
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_IDS));
  await pool.end();
});

// ---- Code minting ----------------------------------------------------------

describe("referral code minting", () => {
  it("mints a code from the unambiguous alphabet and keeps it stable", async () => {
    const first = await getOrCreateReferralCode(REFERRER_ID);
    assert.strictEqual(first.length, REFERRAL_CODE_LENGTH, "spec length");
    const alphabetOnly = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]+$`);
    assert.match(first, alphabetOnly, "every char from the code alphabet");
    assert.doesNotMatch(first, /[01OI]/, "no ambiguous 0/O/1/I characters");
    const second = await getOrCreateReferralCode(REFERRER_ID);
    assert.strictEqual(second, first, "repeat fetch returns the same code");
  });

  it("different users mint different codes (unique index is DB truth)", async () => {
    const referrerCode = await getOrCreateReferralCode(REFERRER_ID);
    const otherCode = await getOrCreateReferralCode(OTHER_ID);
    assert.notStrictEqual(otherCode, referrerCode, "codes are distinct");
  });
});

// ---- Redeem: attribution only ----------------------------------------------

describe("redeem attribution", () => {
  it("owner copy matches the spec exactly", () => {
    assert.strictEqual(REFERRAL_COPY.alreadyRedeemed, "You have already used a referral code.");
    assert.strictEqual(REFERRAL_COPY.selfReferral, "You cannot use your own code.");
    assert.strictEqual(REFERRAL_COPY.unknownCode, "That code did not match. Check it and try again.");
  });

  it("happy path: records attribution, normalizes case, grants NOTHING", async () => {
    const code = await getOrCreateReferralCode(REFERRER_ID);
    const result = await redeemReferralCode(REFEREE_ID, code.toLowerCase());
    assert.strictEqual(result.kind, "ok", "lowercase input redeems via normalization");

    const rows = await db
      .select()
      .from(referralRedemptionsTable)
      .where(eq(referralRedemptionsTable.refereeUserId, REFEREE_ID));
    assert.strictEqual(rows.length, 1, "exactly one redemption row");
    assert.strictEqual(rows[0]!.referrerUserId, REFERRER_ID, "attributed to the code owner");
    assert.strictEqual(rows[0]!.code, normalizeReferralCode(code), "stored normalized");
    assert.strictEqual(rows[0]!.activatedAt, null, "not activated at redeem time");
    assert.strictEqual(rows[0]!.grantedAt, null, "not granted at redeem time");

    const ledger = await db
      .select()
      .from(tokenLedgerTable)
      .where(inArray(tokenLedgerTable.userId, [REFERRER_ID, REFEREE_ID]));
    assert.strictEqual(ledger.length, 0, "redeem grants no Chai to either side");
  });

  it("double redeem is rejected even with a different valid code", async () => {
    const referrerCode = await getOrCreateReferralCode(REFERRER_ID);
    const sameAgain = await redeemReferralCode(REFEREE_ID, referrerCode);
    assert.strictEqual(sameAgain.kind, "already_redeemed", "same code again");
    const otherCode = await getOrCreateReferralCode(OTHER_ID);
    const different = await redeemReferralCode(REFEREE_ID, otherCode);
    assert.strictEqual(different.kind, "already_redeemed", "different code, still once-ever");
  });

  it("self-referral is rejected", async () => {
    const code = await getOrCreateReferralCode(REFERRER_ID);
    const result = await redeemReferralCode(REFERRER_ID, code);
    assert.strictEqual(result.kind, "self_referral");
  });

  it("unknown code is rejected", async () => {
    const orphanCode = "QQQQQQ";
    const owners = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, orphanCode));
    assert.strictEqual(owners.length, 0, "precondition: nobody owns the probe code");
    const result = await redeemReferralCode(OTHER_ID, orphanCode);
    assert.strictEqual(result.kind, "unknown_code");
  });
});

// ---- Activation: both sides granted exactly once ---------------------------

describe("activation grants", () => {
  it("first activation grants BOTH sides amounts read from the constants", async () => {
    const refereeBefore = (await getOrCreateTokenState(REFEREE_ID)).balance;
    const referrerBefore = (await getOrCreateTokenState(REFERRER_ID)).balance;

    const activated = await activateReferralIfPending(REFEREE_ID);
    assert.strictEqual(activated, true, "pending redemption activates");

    const [row] = await db
      .select()
      .from(referralRedemptionsTable)
      .where(eq(referralRedemptionsTable.refereeUserId, REFEREE_ID));
    assert.ok(row!.activatedAt instanceof Date, "activated_at set");
    assert.ok(row!.grantedAt instanceof Date, "granted_at set");
    const refId = `referral:${row!.id}`;

    const refereeLedger = await db
      .select()
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, REFEREE_ID),
          eq(tokenLedgerTable.reason, "earn_referral_referee"),
        ),
      );
    assert.strictEqual(refereeLedger.length, 1, "one referee ledger row");
    assert.strictEqual(refereeLedger[0]!.refId, refId, "referee refId is referral:<id>");
    assert.strictEqual(refereeLedger[0]!.delta, REFERRAL_REWARD_REFEREE_CHAI, "referee amount from constant");

    const referrerLedger = await db
      .select()
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, REFERRER_ID),
          eq(tokenLedgerTable.reason, "earn_referral_referrer"),
        ),
      );
    assert.strictEqual(referrerLedger.length, 1, "one referrer ledger row");
    assert.strictEqual(referrerLedger[0]!.refId, refId, "referrer refId is referral:<id>");
    assert.strictEqual(referrerLedger[0]!.delta, REFERRAL_REWARD_REFERRER_CHAI, "referrer amount from constant");

    const refereeAfter = (await getOrCreateTokenState(REFEREE_ID)).balance;
    const referrerAfter = (await getOrCreateTokenState(REFERRER_ID)).balance;
    assert.strictEqual(refereeAfter - refereeBefore, REFERRAL_REWARD_REFEREE_CHAI, "referee balance moved by the constant");
    assert.strictEqual(referrerAfter - referrerBefore, REFERRAL_REWARD_REFERRER_CHAI, "referrer balance moved by the constant");
  });

  it("repeat activation grants nothing", async () => {
    const refereeBefore = (await getOrCreateTokenState(REFEREE_ID)).balance;
    const referrerBefore = (await getOrCreateTokenState(REFERRER_ID)).balance;

    const activatedAgain = await activateReferralIfPending(REFEREE_ID);
    assert.strictEqual(activatedAgain, false, "granted_at guard skips");

    const ledger = await db
      .select()
      .from(tokenLedgerTable)
      .where(
        and(
          inArray(tokenLedgerTable.userId, [REFERRER_ID, REFEREE_ID]),
          inArray(tokenLedgerTable.reason, ["earn_referral_referrer", "earn_referral_referee"]),
        ),
      );
    assert.strictEqual(ledger.length, 2, "still exactly one ledger row per side");

    const refereeAfter = (await getOrCreateTokenState(REFEREE_ID)).balance;
    const referrerAfter = (await getOrCreateTokenState(REFERRER_ID)).balance;
    assert.strictEqual(refereeAfter, refereeBefore, "referee balance unchanged");
    assert.strictEqual(referrerAfter, referrerBefore, "referrer balance unchanged");
  });

  it("no pending redemption: returns false, grants nothing", async () => {
    const activated = await activateReferralIfPending(OTHER_ID);
    assert.strictEqual(activated, false);
    const ledger = await db
      .select()
      .from(tokenLedgerTable)
      .where(eq(tokenLedgerTable.userId, OTHER_ID));
    assert.strictEqual(ledger.length, 0, "no ledger rows for a user who never redeemed");
  });
});
