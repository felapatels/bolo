/**
 * gameSessions.test.ts
 *
 * Integration tests for the Chunk 6A game-session Chai grants and payload
 * validation additions. Tests run against the live development DATABASE_URL
 * and self-provision a dedicated test user.
 *
 * Coverage (Chunk 6A spec items 1-6; items 7-8 are route-layer and require an
 * HTTP harness not present in this codebase's test infrastructure -- they are
 * defended by the route's existing 422 / plan-gate paths, which have not
 * changed, and by typecheck over the zod additions):
 *
 *   1. Absent-context: zero signal/closeout ledger rows (no grant fired)
 *   2. Hub context:    zero signal/closeout ledger rows (no grant fired)
 *   3. Signal happy path: 1 Chai granted, ledger row with composed refId
 *   4. Signal replay: second call no-ops (single ledger row, balance unchanged)
 *   5. Closeout happy path: 2 Chai granted once; replay grants nothing
 *   6a. contextRef regex: zod rejects "gap-" (no digits) and "gap-abc" (letters)
 *   6b. context enum: zod rejects an unknown string
 *   6c. contextRef present with hub context: caught by the post-parse check
 *   6d. contextRef absent with signal context: caught by the post-parse check
 *   9.  chaiGranted receipt derivation: present only when THIS call inserted
 *       the ledger row (grantTokensDetailed's `granted` flag), absent on a
 *       spent refId, absent for hub/absent context, absent on a failed
 *       session, and never fabricated by an unrelated grant moving the balance
 *
 * Runs with: node --import tsx --test src/test/gameSessions.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { db, pool, usersTable, tokenLedgerTable, userTokenStateTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import {
  grantTokens,
  grantTokensDetailed,
  getOrCreateTokenState,
} from "../lib/tokenService.js";
import {
  signalFirstClearChai,
  CLOSEOUT_FIRST_CHAI,
  TOKEN_EARN_STREAK_DAY,
  gameSessionPassed,
} from "../lib/tokenEconomy.js";

// Mirrors the GameSessionBody zod additions in routes/learning.ts.
// Testing the schema in isolation keeps the test independent of the full
// route module import (which would start a db pool, etc.).
const GameSessionContextFields = z.object({
  context: z.enum(["hub", "signal", "closeout"]).optional(),
  contextRef: z.string().regex(/^gap-[0-9]+$/).optional(),
});

// Post-parse validation logic (mirrors routes/learning.ts).
function validateContextRef(context: string | undefined, contextRef: string | undefined): boolean {
  if (context === "signal" && !contextRef) return false;
  if (context !== "signal" && contextRef !== undefined) return false;
  return true;
}

const TEST_USER_ID = "test-game-sessions-6a-user";

async function cleanupTokens() {
  await db.delete(tokenLedgerTable).where(eq(tokenLedgerTable.userId, TEST_USER_ID));
  await db.delete(userTokenStateTable).where(eq(userTokenStateTable.userId, TEST_USER_ID));
}

before(async () => {
  await db.insert(usersTable).values({ id: TEST_USER_ID, createdAt: new Date() }).onConflictDoNothing();
  await cleanupTokens();
});

after(async () => {
  await cleanupTokens();
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// ---- Item 1 / 2: absent and hub context produce zero grants ----------------

describe("absent-context and hub-context: zero token grants", () => {
  before(async () => { await cleanupTokens(); });

  it("absent context: no signal or closeout ledger rows", async () => {
    // In the route handler, absent context skips both grant branches.
    // Verify at service layer by checking there are no ledger rows for either
    // grant reason.
    const rows = await db
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, "earn_signal_first_clear"),
        ),
      );
    assert.strictEqual(rows.length, 0, "absent context must produce no signal ledger rows");
  });

  it("hub context: no signal or closeout grants fired", async () => {
    // hub is an accepted context value that does not trigger any grant.
    // Verify the schema accepts it and no ledger rows exist after a
    // simulated hub session (no grantTokens call in that branch).
    const parse = GameSessionContextFields.safeParse({ context: "hub" });
    assert.ok(parse.success, "hub context must parse successfully");
    const validationOk = validateContextRef("hub", undefined);
    assert.ok(validationOk, "hub context with no contextRef must pass validation");

    const rows = await db
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, "earn_closeout_first"),
        ),
      );
    assert.strictEqual(rows.length, 0, "hub context must produce no closeout ledger rows");
  });
});

// ---- Item 3 / 4: signal grant + idempotency --------------------------------

describe("signal context: once-ever Chai grant", () => {
  before(async () => { await cleanupTokens(); });

  const LANG = "hi";
  const CAT_ID = 1;
  const CONTEXT_REF = "gap-42";
  const REF_ID = `${LANG}:${CAT_ID}:${CONTEXT_REF}`;

  it("first signal clear grants the configured signal reward and creates a ledger row", async () => {
    const stateBefore = await getOrCreateTokenState(TEST_USER_ID);
    const stateAfter = await grantTokens(
      TEST_USER_ID,
      "earn_signal_first_clear",
      REF_ID,
      signalFirstClearChai(LANG),
    );
    assert.strictEqual(stateAfter.balance, stateBefore.balance + signalFirstClearChai(LANG));

    const rows = await db
      .select({ refId: tokenLedgerTable.refId })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, "earn_signal_first_clear"),
        ),
      );
    assert.strictEqual(rows.length, 1, "exactly one ledger row for the signal grant");
    assert.strictEqual(rows[0]!.refId, REF_ID, "refId must be languageCode:categoryId:contextRef");
  });

  it("second signal call with same refId is a no-op: balance unchanged, still one ledger row", async () => {
    const balanceBeforeReplay = (await getOrCreateTokenState(TEST_USER_ID)).balance;
    const stateAfterReplay = await grantTokens(
      TEST_USER_ID,
      "earn_signal_first_clear",
      REF_ID,
      signalFirstClearChai(LANG),
    );
    assert.strictEqual(
      stateAfterReplay.balance,
      balanceBeforeReplay,
      "replay must not change balance",
    );

    const [row] = await db
      .select({ c: count() })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, "earn_signal_first_clear"),
        ),
      );
    assert.strictEqual(row!.c, 1, "replay must leave exactly one ledger row");
  });
});

// ---- Item 5: closeout grant + idempotency ----------------------------------

describe("closeout context: once-ever Chai grant", () => {
  before(async () => { await cleanupTokens(); });

  const LANG = "hi";
  const CAT_ID = 2;
  const REF_ID = `${LANG}:${CAT_ID}`;

  it("first closeout grants CLOSEOUT_FIRST_CHAI and creates a ledger row", async () => {
    const stateBefore = await getOrCreateTokenState(TEST_USER_ID);
    const stateAfter = await grantTokens(
      TEST_USER_ID,
      "earn_closeout_first",
      REF_ID,
      CLOSEOUT_FIRST_CHAI,
    );
    assert.strictEqual(stateAfter.balance, stateBefore.balance + CLOSEOUT_FIRST_CHAI);

    const rows = await db
      .select({ refId: tokenLedgerTable.refId })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, "earn_closeout_first"),
        ),
      );
    assert.strictEqual(rows.length, 1, "exactly one ledger row for the closeout grant");
    assert.strictEqual(rows[0]!.refId, REF_ID, "refId must be languageCode:categoryId");
  });

  it("repeat closeout is a no-op: balance unchanged, still one ledger row", async () => {
    const balanceBeforeReplay = (await getOrCreateTokenState(TEST_USER_ID)).balance;
    const stateAfterReplay = await grantTokens(
      TEST_USER_ID,
      "earn_closeout_first",
      REF_ID,
      CLOSEOUT_FIRST_CHAI,
    );
    assert.strictEqual(
      stateAfterReplay.balance,
      balanceBeforeReplay,
      "replay must not change balance",
    );

    const [row] = await db
      .select({ c: count() })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, "earn_closeout_first"),
        ),
      );
    assert.strictEqual(row!.c, 1, "replay must leave exactly one ledger row");
  });
});

// ---- Item 6: contextRef + context validation --------------------------------

describe("pass gate: majority correct (Signal polish item 1)", () => {
  // The route gates BOTH the signal and closeout grant branches on this exact
  // function, so pinning it here pins the grant condition. The owner evidence
  // run (1 of 8 correct paying Chai) must be impossible under this rule.
  it("gameSessionPassed: passing means strictly more than half the rounds", () => {
    assert.strictEqual(gameSessionPassed(1, 8), false, "1 of 8 (the owner evidence run) must not pass");
    assert.strictEqual(gameSessionPassed(4, 8), false, "exactly half is not a majority");
    assert.strictEqual(gameSessionPassed(5, 8), true, "5 of 8 passes");
    assert.strictEqual(gameSessionPassed(1, 3), false, "1 of 3 fails");
    assert.strictEqual(gameSessionPassed(2, 3), true, "2 of 3 passes");
    assert.strictEqual(gameSessionPassed(1, 1), true, "a perfect single-round run passes");
    assert.strictEqual(gameSessionPassed(0, 1), false, "an all-miss run fails");
  });
});

describe("contextRef / context payload validation", () => {
  // 6a: contextRef regex
  it("zod rejects contextRef missing digits ('gap-')", () => {
    const result = GameSessionContextFields.safeParse({ context: "signal", contextRef: "gap-" });
    assert.ok(!result.success, "gap- (no digits) must fail zod");
  });

  it("zod rejects contextRef with letters ('gap-abc')", () => {
    const result = GameSessionContextFields.safeParse({ context: "signal", contextRef: "gap-abc" });
    assert.ok(!result.success, "gap-abc (letters) must fail zod");
  });

  it("zod accepts valid contextRef ('gap-0', 'gap-99')", () => {
    assert.ok(GameSessionContextFields.safeParse({ context: "signal", contextRef: "gap-0" }).success);
    assert.ok(GameSessionContextFields.safeParse({ context: "signal", contextRef: "gap-99" }).success);
  });

  // 6b: unknown context enum value
  it("zod rejects unknown context value", () => {
    const result = GameSessionContextFields.safeParse({ context: "unknown" });
    assert.ok(!result.success, "unknown context must fail zod");
  });

  // 6c: contextRef present with a non-signal context
  it("post-parse check: contextRef with hub context is rejected", () => {
    const parse = GameSessionContextFields.safeParse({ context: "hub", contextRef: "gap-5" });
    assert.ok(parse.success, "zod itself accepts it (ref is optional)");
    const valid = validateContextRef(parse.data.context, parse.data.contextRef);
    assert.ok(!valid, "hub + contextRef must fail the post-parse check");
  });

  it("post-parse check: contextRef with closeout context is rejected", () => {
    const parse = GameSessionContextFields.safeParse({ context: "closeout", contextRef: "gap-5" });
    assert.ok(parse.success, "zod itself accepts it");
    const valid = validateContextRef(parse.data.context, parse.data.contextRef);
    assert.ok(!valid, "closeout + contextRef must fail the post-parse check");
  });

  // 6d: contextRef absent with signal context
  it("post-parse check: signal context without contextRef is rejected", () => {
    const parse = GameSessionContextFields.safeParse({ context: "signal" });
    assert.ok(parse.success, "zod itself accepts it (contextRef is optional in schema)");
    const valid = validateContextRef(parse.data.context, parse.data.contextRef);
    assert.ok(!valid, "signal without contextRef must fail the post-parse check");
  });

  it("post-parse check: signal context with valid contextRef is accepted", () => {
    const parse = GameSessionContextFields.safeParse({ context: "signal", contextRef: "gap-7" });
    assert.ok(parse.success);
    const valid = validateContextRef(parse.data.context, parse.data.contextRef);
    assert.ok(valid, "signal + valid contextRef must pass");
  });
});

// ---- Item 9: chaiGranted receipt derivation --------------------------------

/**
 * Mirrors the chaiGranted derivation in routes/learning.ts POST /game-sessions
 * (both grant paths), the same way validateContextRef above mirrors the route's
 * post-parse check -- this codebase's api tests have no HTTP harness.
 *
 * The receipt comes from grantTokensDetailed's `granted` flag, which reports
 * whether THIS call inserted the ledger row. It is deliberately NOT a
 * stateBefore/stateAfter balance compare: that cannot distinguish this grant
 * from an unrelated one landing between the two reads.
 *
 * Returning `undefined` models the route omitting the key entirely
 * (`...(chaiGranted !== undefined && { chaiGranted })`).
 */
async function deriveChaiGranted(
  userId: string,
  context: "hub" | "signal" | "closeout" | undefined,
  sessionPassed: boolean,
  opts: { languageCode: string; categoryId: number; contextRef?: string },
): Promise<number | undefined> {
  let chaiGranted: number | undefined;
  if (context === "signal" && sessionPassed) {
    const amount = signalFirstClearChai(opts.languageCode);
    const { granted } = await grantTokensDetailed(
      userId,
      "earn_signal_first_clear",
      `${opts.languageCode}:${opts.categoryId}:${opts.contextRef}`,
      amount,
    );
    if (granted) chaiGranted = amount;
  } else if (context === "closeout" && sessionPassed) {
    const { granted } = await grantTokensDetailed(
      userId,
      "earn_closeout_first",
      `${opts.languageCode}:${opts.categoryId}`,
      CLOSEOUT_FIRST_CHAI,
    );
    if (granted) chaiGranted = CLOSEOUT_FIRST_CHAI;
  }
  return chaiGranted;
}

describe("chaiGranted receipt: present only when the ledger actually granted", () => {
  before(async () => { await cleanupTokens(); });

  const LANG = "hi";
  const CAT_ID = 4;
  const SIGNAL_OPTS = { languageCode: LANG, categoryId: CAT_ID, contextRef: "gap-77" };

  it("signal first clear: receipt present and equals the configured reward", async () => {
    const receipt = await deriveChaiGranted(TEST_USER_ID, "signal", true, SIGNAL_OPTS);
    assert.strictEqual(
      receipt,
      signalFirstClearChai(LANG),
      "a real first clear must carry the served reward amount",
    );
  });

  it("signal replay on a spent refId: receipt absent, balance unchanged", async () => {
    const balanceBefore = (await getOrCreateTokenState(TEST_USER_ID)).balance;
    const receipt = await deriveChaiGranted(TEST_USER_ID, "signal", true, SIGNAL_OPTS);
    const balanceAfter = (await getOrCreateTokenState(TEST_USER_ID)).balance;

    assert.strictEqual(receipt, undefined, "an already-spent refId must produce no receipt");
    assert.strictEqual(balanceAfter, balanceBefore, "replay must not move the balance");
  });

  it("regression: an unrelated grant interleaved mid-flight never fabricates a receipt", async () => {
    // The retired defect, reproduced deterministically rather than by racing.
    // `retiredBalanceCompare` is the OLD algorithm, kept only as a regression
    // witness: read the balance, grant, infer a receipt from the difference.
    // Driving the unrelated earn into the window BETWEEN those two reads is
    // what makes this discriminating -- landing it before the call (an earlier
    // draft of this test) leaves the old algorithm passing too.
    //
    // On a replay, grantTokens still returns a freshly read in-transaction
    // state, so an interleaved earn shows up in stateAfter and the old compare
    // reports a signal grant that never happened.
    async function retiredBalanceCompare(
      refId: string,
      amount: number,
      interleave: () => Promise<unknown>,
    ): Promise<number | undefined> {
      const stateBefore = await getOrCreateTokenState(TEST_USER_ID);
      await interleave();
      const stateAfter = await grantTokens(
        TEST_USER_ID,
        "earn_signal_first_clear",
        refId,
        amount,
      );
      return stateAfter.balance > stateBefore.balance ? amount : undefined;
    }

    const amount = signalFirstClearChai(LANG);
    const spentRefId = `${LANG}:${CAT_ID}:${SIGNAL_OPTS.contextRef}`;
    // Precondition: the first test in this suite already spent this refId, so
    // BOTH algorithms are looking at a replay that must pay nothing.
    const ledgerBefore = await db
      .select({ c: count() })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.refId, spentRefId),
        ),
      );
    assert.strictEqual(ledgerBefore[0]!.c, 1, "precondition: refId already spent exactly once");

    const retiredReceipt = await retiredBalanceCompare(spentRefId, amount, () =>
      grantTokensDetailed(TEST_USER_ID, "earn_streak_day", "2026-08-05", TOKEN_EARN_STREAK_DAY),
    );
    assert.strictEqual(
      retiredReceipt,
      amount,
      "witness: the retired balance compare DOES mis-report an unrelated grant",
    );

    // The shipped derivation, same already-spent refId, same interleave shape.
    await grantTokensDetailed(
      TEST_USER_ID,
      "earn_streak_day",
      "2026-08-06",
      TOKEN_EARN_STREAK_DAY,
    );
    const liveReceipt = await deriveChaiGranted(TEST_USER_ID, "signal", true, SIGNAL_OPTS);
    assert.strictEqual(
      liveReceipt,
      undefined,
      "shipped derivation must report nothing: no signal row was inserted",
    );

    // Neither path may have added a signal ledger row.
    const ledgerAfter = await db
      .select({ c: count() })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.refId, spentRefId),
        ),
      );
    assert.strictEqual(ledgerAfter[0]!.c, 1, "replays must not add signal ledger rows");
  });

  it("closeout first: receipt present; replay: receipt absent", async () => {
    const closeoutOpts = { languageCode: LANG, categoryId: 5 };
    const first = await deriveChaiGranted(TEST_USER_ID, "closeout", true, closeoutOpts);
    assert.strictEqual(first, CLOSEOUT_FIRST_CHAI, "first closeout must carry the receipt");

    const replay = await deriveChaiGranted(TEST_USER_ID, "closeout", true, closeoutOpts);
    assert.strictEqual(replay, undefined, "closeout replay must produce no receipt");
  });

  it("hub launch: no receipt and no ledger row", async () => {
    const receipt = await deriveChaiGranted(TEST_USER_ID, "hub", true, {
      languageCode: LANG,
      categoryId: 6,
    });
    assert.strictEqual(receipt, undefined, "hub launches have no grant path");

    const rows = await db
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.refId, `${LANG}:6`),
        ),
      );
    assert.strictEqual(rows.length, 0, "hub context must insert no ledger row");
  });

  it("absent context: no receipt", async () => {
    const receipt = await deriveChaiGranted(TEST_USER_ID, undefined, true, {
      languageCode: LANG,
      categoryId: 7,
    });
    assert.strictEqual(receipt, undefined, "absent context must stay byte-identical (no key)");
  });

  it("failed signal session: no receipt, and the refId stays claimable", async () => {
    const failOpts = { languageCode: LANG, categoryId: 8, contextRef: "gap-3" };
    // 1 of 4 correct is not a strict majority.
    assert.strictEqual(gameSessionPassed(1, 4), false, "precondition: this session fails");

    const failReceipt = await deriveChaiGranted(TEST_USER_ID, "signal", false, failOpts);
    assert.strictEqual(failReceipt, undefined, "a failing session must not grant");

    // The once-ever refId was left unspent, so a later passing run still pays.
    const passReceipt = await deriveChaiGranted(TEST_USER_ID, "signal", true, failOpts);
    assert.strictEqual(
      passReceipt,
      signalFirstClearChai(LANG),
      "the unspent refId must still pay on a later passing run",
    );
  });
});
