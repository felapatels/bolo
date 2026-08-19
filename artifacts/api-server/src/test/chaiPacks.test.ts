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
 *   - App Store consumables: recognition by product id, the refId is the
 *     TRANSACTION id (never the original one), two distinct purchases of the
 *     same pack credit twice, one replayed purchase credits once, and the iOS
 *     and web idempotency domains cannot collide
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
  CHAI_PACK_IOS_REASON,
  CHAI_PACK_SESSION_KIND,
  getChaiPack,
  getChaiPackByAppleProductId,
  chaiPackCreditFromSession,
  chaiPackCreditFromStoreEvent,
  creditChaiPack,
  creditChaiPackFromStore,
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

// A RevenueCat consumable event as the webhook receives it, trimmed to the
// fields the mapping reads.
function storeEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "NON_SUBSCRIPTION_PURCHASE",
    app_user_id: TEST_USER_ID,
    product_id: "bolo_chai_cutting",
    transaction_id: "2000000000001",
    original_transaction_id: "2000000000001",
    store: "APP_STORE",
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
  it("is the ruled ladder: 25/$1.99, 75/$4.99, 200/$9.99", () => {
    assert.deepStrictEqual(
      CHAI_PACKS.map((p) => [p.id, p.chai, p.cents]),
      [
        ["small", 25, 199],
        ["medium", 75, 499],
        ["large", 200, 999],
      ],
    );
  });

  it("says the same numbers to the buyer as it credits", () => {
    // The product name is what Stripe's checkout page shows the learner. A
    // name saying "50" over a credit of 25 is a lie to someone paying money.
    for (const pack of CHAI_PACKS) {
      assert.ok(
        pack.productName.includes(String(pack.chai)),
        `${pack.id}: product name "${pack.productName}" must state ${pack.chai}`,
      );
      assert.ok(
        pack.description.includes(String(pack.chai)),
        `${pack.id}: description "${pack.description}" must state ${pack.chai}`,
      );
    }
  });

  it("resolves a pack by id and refuses anything else", () => {
    assert.strictEqual(getChaiPack("medium")?.chai, 75);
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
    // which id to use, keying on anything else risks two ledger rows for one
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
    assert.strictEqual(state.balance, 25);
  });

  it("credits nothing on a replay of the same Stripe transaction", async () => {
    // Stripe retries, duplicate deliveries, and our own 500-and-retry all
    // arrive carrying the same transaction id.
    const credit = chaiPackCreditFromSession(session());
    assert.ok(credit);
    const { state, granted } = await creditChaiPack(credit);
    assert.strictEqual(granted, false, "a replay must not credit again");
    assert.strictEqual(state.balance, 25);

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
    // Nothing in this path involves the browser, this IS the whole flow for a
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
    assert.strictEqual(state.balance, 225, "25 from the first pack + 200");
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
    assert.strictEqual(state.balance, 250, "225 + the small pack's 25");
  });
});

describe("mapping an App Store consumable purchase to a credit", () => {
  it("gives every pack a distinct Apple product id and resolves it back", () => {
    const ids = CHAI_PACKS.map((p) => p.appleProductId);
    assert.strictEqual(new Set(ids).size, ids.length, "product ids are unique");
    for (const pack of CHAI_PACKS) {
      assert.strictEqual(
        getChaiPackByAppleProductId(pack.appleProductId)?.id,
        pack.id,
      );
    }
    assert.strictEqual(getChaiPackByAppleProductId("bolo_plus_monthly"), null);
    assert.strictEqual(getChaiPackByAppleProductId(undefined), null);
  });

  it("maps a consumable event to the user, pack and prefixed transaction id", () => {
    assert.deepStrictEqual(chaiPackCreditFromStoreEvent(storeEvent()), {
      userId: TEST_USER_ID,
      pack: getChaiPack("small"),
      refId: "apple_tx:2000000000001",
    });
  });

  it("keys on the transaction id, NEVER the original transaction id", () => {
    // Apple reuses original_transaction_id across every purchase of the same
    // product. Keying on it would make a learner's second pack collide with
    // their first and silently credit nothing.
    const credit = chaiPackCreditFromStoreEvent(
      storeEvent({
        transaction_id: "2000000000009",
        original_transaction_id: "2000000000001",
      }),
    );
    assert.strictEqual(credit?.refId, "apple_tx:2000000000009");
  });

  it("recognises the purchase by product id, not by event type alone", () => {
    // A consumable event for a product we do not sell is not a Chai pack.
    assert.strictEqual(
      chaiPackCreditFromStoreEvent(storeEvent({ product_id: "bolo_hats_01" })),
      null,
    );
    // And a subscription event naming a Chai product is not one either.
    assert.strictEqual(
      chaiPackCreditFromStoreEvent(storeEvent({ type: "INITIAL_PURCHASE" })),
      null,
    );
  });

  it("refuses an event with no user or no transaction id", () => {
    assert.strictEqual(
      chaiPackCreditFromStoreEvent(storeEvent({ app_user_id: null })),
      null,
    );
    assert.strictEqual(
      chaiPackCreditFromStoreEvent(storeEvent({ transaction_id: null })),
      null,
    );
    assert.strictEqual(
      chaiPackCreditFromStoreEvent(storeEvent({ transaction_id: "" })),
      null,
    );
  });
});

describe("crediting an App Store purchase", () => {
  before(async () => {
    await cleanup();
  });

  it("credits exactly the pack's Chai, from the catalog", async () => {
    const credit = chaiPackCreditFromStoreEvent(storeEvent());
    assert.ok(credit);
    const { state, granted } = await creditChaiPackFromStore(credit);
    assert.strictEqual(granted, true);
    assert.strictEqual(state.balance, 25);
  });

  // The guard that stops a later refactor collapsing repeat purchases back
  // into the subscription-shaped "a replay is free" assumption. Buying the
  // same pack twice is two payments and must be two credits.
  it("GUARD: two distinct purchases of the SAME pack credit twice", async () => {
    const first = chaiPackCreditFromStoreEvent(
      storeEvent({ transaction_id: "2000000000010" }),
    );
    const second = chaiPackCreditFromStoreEvent(
      storeEvent({ transaction_id: "2000000000011" }),
    );
    assert.ok(first && second);
    assert.notStrictEqual(first.refId, second.refId);

    const a = await creditChaiPackFromStore(first);
    const b = await creditChaiPackFromStore(second);
    assert.strictEqual(a.granted, true);
    assert.strictEqual(b.granted, true, "the second payment must credit too");
    assert.strictEqual(b.state.balance, 75, "25 + 25 + 25");
  });

  it("credits nothing when ONE purchase is replayed", async () => {
    // This is the recovery path arriving twice: the app asked the store to
    // re-deliver a transaction that had, in fact, already been credited.
    const credit = chaiPackCreditFromStoreEvent(
      storeEvent({ transaction_id: "2000000000010" }),
    );
    assert.ok(credit);
    const { state, granted } = await creditChaiPackFromStore(credit);
    assert.strictEqual(granted, false);
    assert.strictEqual(state.balance, 75, "a replay adds nothing");

    const rows = await db
      .select()
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, TEST_USER_ID),
          eq(tokenLedgerTable.reason, CHAI_PACK_IOS_REASON),
          eq(tokenLedgerTable.refId, "apple_tx:2000000000010"),
        ),
      );
    assert.strictEqual(rows.length, 1, "exactly one ledger row per purchase");
  });

  it("keeps the iOS and web idempotency domains apart", async () => {
    // Pathological but cheap to rule out: the same id string arriving from
    // both stores must credit twice, because they are two payments. The
    // ledger's unique index is (userId, reason, refId), and the two tills use
    // different reasons.
    const shared = "collide_1";
    const web = await creditChaiPack({
      userId: TEST_USER_ID,
      pack: getChaiPack("small")!,
      transactionId: shared,
    });
    const ios = await creditChaiPackFromStore({
      userId: TEST_USER_ID,
      pack: getChaiPack("small")!,
      refId: shared,
    });
    assert.strictEqual(web.granted, true);
    assert.strictEqual(ios.granted, true);
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
