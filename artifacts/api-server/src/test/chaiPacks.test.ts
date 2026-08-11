/**
 * chaiPacks.test.ts
 *
 * The Chai pack purchase path is a MONEY surface: a learner's card is charged
 * before any of this runs, so the only acceptable failure mode is crediting
 * once. These tests run against the live development DATABASE_URL and
 * self-provision their own users, cleaning up after themselves.
 *
 * Coverage:
 *   - the catalog: pack amounts/prices are the ruled ladder, ids resolve
 *   - price ids resolve from env per pack; unconfigured packs are not priced
 *   - session mapping: only OUR paid sessions credit; unpaid, foreign, and
 *     unknown-pack sessions map to nothing
 *   - session mapping: the PaymentIntent id is the transaction id, with the
 *     session id as a fallback
 *   - credit-once: a paid session credits exactly the pack's Chai
 *   - replay: the same Stripe transaction credits nothing a second time
 *   - abandoned tab: the credit needs no client at all, and a second distinct
 *     purchase still credits
 *   - Chai is credited server-side from the catalog, so a tampered pack
 *     amount in metadata cannot inflate the grant
 *   - the zero floor: a reversal larger than the balance lands on 0, records
 *     the delta the owner asked for, and is idempotent by refId
 *
 * Runs with: node --import tsx --test src/test/chaiPacks.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import {
  db,
  usersTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CHAI_PACKS,
  CHAI_PACK_REASON,
  CHAI_PACK_SESSION_KIND,
  getChaiPack,
  chaiPackCreditFromSession,
  creditChaiPack,
  chaiPacksConfigured,
} from "../lib/chaiPacks.js";
import { getChaiPackPriceId } from "../lib/stripePricing.js";
import {
  applyChaiAdjustment,
  getOrCreateTokenState,
} from "../lib/tokenService.js";

const TEST_USER_ID = "test-chai-packs-user";

async function cleanup() {
  await db
    .delete(tokenLedgerTable)
    .where(eq(tokenLedgerTable.userId, TEST_USER_ID));
  await db
    .delete(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, TEST_USER_ID));
}

// A Checkout Session as Stripe delivers it to the webhook, trimmed to the
// fields the mapping reads.
function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    metadata: {
      kind: CHAI_PACK_SESSION_KIND,
      userId: TEST_USER_ID,
      packId: "small",
    },
    ...overrides,
  };
}

before(async () => {
  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, createdAt: new Date() })
    .onConflictDoNothing();
  await cleanup();
});

after(async () => {
  await cleanup();
});

describe("the pack catalog", () => {
  it("is the ruled ladder: 50/$1.99, 150/$4.99, 400/$9.99", () => {
    assert.deepStrictEqual(
      CHAI_PACKS.map((p) => [p.id, p.chai, p.cents]),
      [
        ["small", 50, 199],
        ["medium", 150, 499],
        ["large", 400, 999],
      ],
    );
  });

  it("resolves a pack by id and refuses anything else", () => {
    assert.strictEqual(getChaiPack("medium")?.chai, 150);
    assert.strictEqual(getChaiPack("enormous"), null);
    assert.strictEqual(getChaiPack(undefined), null);
  });

  it("reads a price id per pack from the environment", () => {
    const key = "STRIPE_CHAI_PACK_SMALL_PRICE_ID";
    const saved = process.env[key];
    process.env[key] = "price_seeded_small";
    try {
      assert.strictEqual(getChaiPackPriceId("small"), "price_seeded_small");
    } finally {
      if (saved === undefined) delete process.env[key];
      else process.env[key] = saved;
    }
  });

  it("reports itself unconfigured when a pack has no price id", () => {
    const keys = CHAI_PACKS.map(
      (p) => `STRIPE_CHAI_PACK_${p.id.toUpperCase()}_PRICE_ID`,
    );
    const saved = keys.map((k) => process.env[k]);
    try {
      for (const k of keys) process.env[k] = "price_x";
      assert.strictEqual(chaiPacksConfigured(), true);
      delete process.env[keys[1]];
      assert.strictEqual(chaiPacksConfigured(), false);
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i]!;
      });
    }
  });
});

describe("mapping a Checkout Session to a credit", () => {
  it("maps our paid session to the user, pack and transaction", () => {
    const credit = chaiPackCreditFromSession(session());
    assert.deepStrictEqual(credit, {
      userId: TEST_USER_ID,
      pack: getChaiPack("small"),
      transactionId: "pi_test_1",
    });
  });

  it("ignores a session that is not a Chai pack", () => {
    // A subscription checkout completes on the same event type; crediting it
    // would hand out Chai for a plan purchase.
    assert.strictEqual(
      chaiPackCreditFromSession(
        session({
          mode: "subscription",
          metadata: { userId: TEST_USER_ID, plan: "plus" },
        }),
      ),
      null,
    );
  });

  it("ignores a subscription-mode session even if it carries our metadata", () => {
    // Belt and braces: a plan purchase can never credit Chai by construction,
    // not merely because our own sessions happen to be tagged correctly.
    assert.strictEqual(
      chaiPackCreditFromSession(session({ mode: "subscription" })),
      null,
    );
  });

  it("ignores a completed but UNPAID session", () => {
    // Async payment methods complete the session before the money lands.
    assert.strictEqual(
      chaiPackCreditFromSession(session({ payment_status: "unpaid" })),
      null,
    );
  });

  it("ignores an unknown pack id and a session with no user", () => {
    assert.strictEqual(
      chaiPackCreditFromSession(
        session({
          metadata: {
            kind: CHAI_PACK_SESSION_KIND,
            userId: TEST_USER_ID,
            packId: "retired-pack",
          },
        }),
      ),
      null,
    );
    assert.strictEqual(
      chaiPackCreditFromSession(
        session({
          metadata: { kind: CHAI_PACK_SESSION_KIND, packId: "small" },
        }),
      ),
      null,
    );
  });

  it("takes the transaction id from the PaymentIntent, expanded or not", () => {
    assert.strictEqual(
      chaiPackCreditFromSession(session({ payment_intent: { id: "pi_obj" } }))
        ?.transactionId,
      "pi_obj",
    );
  });

  it("refuses a session with no PaymentIntent rather than keying on the session id", () => {
    // The two events for a slow payment method (completed, then
    // async_payment_succeeded) share a PaymentIntent but not a preference for
    // which id to use — keying on anything else risks two ledger rows for one
    // payment, i.e. crediting the pack twice. And a payment-mode session with
    // no intent has not been paid for anyway.
    assert.strictEqual(
      chaiPackCreditFromSession(session({ payment_intent: null })),
      null,
    );
  });

  it("maps the async-payment success event identically, so it credits once", () => {
    // A bank debit completes the session UNPAID and settles later. Both
    // deliveries run through this mapper; the first yields nothing, the second
    // yields the same transaction id the credit would have used all along.
    const completedUnpaid = session({ payment_status: "unpaid" });
    const settledLater = session({ payment_status: "paid" });

    assert.strictEqual(chaiPackCreditFromSession(completedUnpaid), null);
    assert.strictEqual(
      chaiPackCreditFromSession(settledLater)?.transactionId,
      "pi_test_1",
    );
  });
});

describe("crediting a purchase", () => {
  before(async () => {
    await cleanup();
  });

  it("credits exactly the pack's Chai on the first delivery", async () => {
    const credit = chaiPackCreditFromSession(session());
    assert.ok(credit);
    const { state, granted } = await creditChaiPack(credit);
    assert.strictEqual(granted, true);
    assert.strictEqual(state.balance, 50);
  });

  it("credits nothing on a replay of the same Stripe transaction", async () => {
    // Stripe retries, duplicate deliveries, and our own 500-and-retry all
    // arrive carrying the same transaction id.
    const credit = chaiPackCreditFromSession(session());
    assert.ok(credit);
    const { state, granted } = await creditChaiPack(credit);
    assert.strictEqual(granted, false, "a replay must not credit again");
    assert.strictEqual(state.balance, 50);

    const rows = await db
      .select()
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, CHAI_PACK_REASON),
        ),
      );
    assert.strictEqual(rows.length, 1, "exactly one ledger row per purchase");
  });

  it("credits an abandoned tab: the webhook alone completes the purchase", async () => {
    // Nothing in this path involves the browser — this IS the whole flow for a
    // learner who closed the tab the instant Stripe took the money.
    const credit = chaiPackCreditFromSession(
      session({
        id: "cs_test_2",
        payment_intent: "pi_test_2",
        metadata: {
          kind: CHAI_PACK_SESSION_KIND,
          userId: TEST_USER_ID,
          packId: "large",
        },
      }),
    );
    assert.ok(credit);
    const { state, granted } = await creditChaiPack(credit);
    assert.strictEqual(granted, true);
    assert.strictEqual(state.balance, 450, "50 from the first pack + 400");
  });

  it("grants the catalog's Chai, never an amount carried in metadata", async () => {
    // The client never states an amount, and a hand-made session that tries to
    // is ignored: the grant reads `chai` off the resolved pack.
    const credit = chaiPackCreditFromSession(
      session({
        id: "cs_test_3",
        payment_intent: "pi_test_3",
        metadata: {
          kind: CHAI_PACK_SESSION_KIND,
          userId: TEST_USER_ID,
          packId: "small",
          chai: "99999",
        },
      }),
    );
    assert.ok(credit);
    const { state } = await creditChaiPack(credit);
    assert.strictEqual(state.balance, 500, "450 + the small pack's 50");
  });
});

describe("the zero floor on manual reversals", () => {
  before(async () => {
    await cleanup();
  });

  it("floors a reversal larger than the balance at zero", async () => {
    const credit = chaiPackCreditFromSession(session());
    assert.ok(credit);
    await creditChaiPack(credit);

    // The learner spent most of a refunded pack before the refund landed.
    const { state, applied } = await applyChaiAdjustment(
      TEST_USER_ID,
      "refund:pi_test_1",
      -200,
    );
    assert.strictEqual(applied, true);
    assert.strictEqual(state.balance, 0, "a balance may never go negative");

    // The ledger still records what was asked for; the state records what
    // happened. Both are needed to explain the row later.
    const [row] = await db
      .select()
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.refId, "refund:pi_test_1"),
        ),
      );
    assert.strictEqual(row.delta, -200);
    assert.strictEqual(row.balanceAfter, 0);
  });

  it("is idempotent: re-running the same correction changes nothing", async () => {
    await applyChaiAdjustment(TEST_USER_ID, "grant:goodwill", 30);
    const { state, applied } = await applyChaiAdjustment(
      TEST_USER_ID,
      "grant:goodwill",
      30,
    );
    assert.strictEqual(applied, false);
    assert.strictEqual(state.balance, 30, "a repeated correction never stacks");

    const fresh = await getOrCreateTokenState(TEST_USER_ID);
    assert.strictEqual(fresh.balance, 30);
  });
});
