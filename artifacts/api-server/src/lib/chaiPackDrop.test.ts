import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  chaiPackCreditFromStoreEvent,
  CHAI_PACKS,
  NON_SUBSCRIPTION_PURCHASE_EVENT,
} from "./chaiPacks";

// ---------------------------------------------------------------------------
// MONEY TAKEN, NOTHING GRANTED.
//
// A real sandbox purchase on 2026-08-19 succeeded at Apple, RevenueCat
// delivered the webhook, the server answered 200, and no Chai arrived. Nothing
// anywhere recorded that a learner had paid and received nothing, because the
// event simply fell through the handler.
//
// These pin the four gates that can drop a paid purchase, so the next time one
// fails it is a named cause rather than a mystery.
// ---------------------------------------------------------------------------

const good = {
  type: NON_SUBSCRIPTION_PURCHASE_EVENT,
  product_id: CHAI_PACKS[0]!.appleProductId,
  app_user_id: "user_2abc",
  transaction_id: "1000000999",
};

describe("the four gates a paid purchase must pass", () => {
  test("all four met, it credits", () => {
    const credit = chaiPackCreditFromStoreEvent(good);
    assert.equal(credit?.userId, "user_2abc");
    assert.equal(credit?.pack.id, CHAI_PACKS[0]!.id);
    assert.ok(credit?.refId.includes("1000000999"));
  });

  test("A PRODUCT ID THE CATALOG DOES NOT KNOW is dropped", () => {
    // The likeliest cause in practice: the identifier in App Store Connect
    // differs by a prefix or a dot from the one the server matches on.
    for (const wrong of [
      "com.bolo.chai.cutting",
      "bolo_chai_Cutting",
      "chai_cutting",
      "",
    ]) {
      assert.equal(
        chaiPackCreditFromStoreEvent({ ...good, product_id: wrong }),
        null,
        `${wrong} must not credit`,
      );
    }
  });

  test("AN ANONYMOUS CUSTOMER is dropped", () => {
    // RevenueCat mints $RCAnonymousID when the SDK was never told who the
    // learner is. There is no user to credit, and crediting the literal string
    // would create a ghost account holding real money.
    assert.equal(chaiPackCreditFromStoreEvent({ ...good, app_user_id: null }), null);
  });

  test("a missing transaction id is dropped, because idempotency needs it", () => {
    // The transaction id IS the ledger key. Without it a retry would double the
    // grant, which is worse than dropping the purchase.
    assert.equal(chaiPackCreditFromStoreEvent({ ...good, transaction_id: "" }), null);
    assert.equal(
      chaiPackCreditFromStoreEvent({ ...good, transaction_id: undefined }),
      null,
    );
  });

  test("a subscription event never credits Chai", () => {
    // Recognition is by product id AND event type: a consumable path must not
    // be reachable from a renewal, or a subscriber would mint Chai monthly.
    assert.equal(
      chaiPackCreditFromStoreEvent({ ...good, type: "RENEWAL" }),
      null,
    );
    assert.equal(
      chaiPackCreditFromStoreEvent({ ...good, type: "INITIAL_PURCHASE" }),
      null,
    );
  });

  test("the catalog the server matches on is exactly these three", () => {
    // Pinned so a rename in App Store Connect fails a test rather than a
    // customer's purchase.
    assert.deepEqual(
      CHAI_PACKS.map((p) => p.appleProductId),
      ["bolo_chai_cutting", "bolo_chai_kulhad", "bolo_chai_kettle"],
    );
  });
});
