import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFromEvent,
  applyFromSubscriber,
  downgradesFromTransfer,
  transferRecipients,
  PLUS_ENTITLEMENT_ID,
  ONE_LANGUAGE_ENTITLEMENT_ID,
  type RevenueCatEvent,
  type RevenueCatSubscriber,
} from "./revenuecatSync";

// Pure translation tests: prove the mapping from RevenueCat billing events /
// subscriber snapshots to our subscription columns, with no DB or network. This
// is where the "server decides who is Plus" logic is pinned down.

const NOW = new Date("2026-07-13T00:00:00.000Z");
const FUTURE = new Date("2026-08-13T00:00:00.000Z");
const PAST = new Date("2026-06-13T00:00:00.000Z");
const USER = "user_abc";

function event(overrides: Partial<RevenueCatEvent>): RevenueCatEvent {
  return {
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    expiration_at_ms: FUTURE.getTime(),
    period_type: "NORMAL",
    ...overrides,
  };
}

test("INITIAL_PURCHASE grants active Plus until the period end", () => {
  const apply = applyFromEvent(event({}), NOW);
  assert.ok(apply);
  assert.equal(apply.userId, USER);
  assert.equal(apply.tier, "plus");
  assert.equal(apply.subscriptionStatus, "active");
  assert.equal(apply.trialEndsAt, null);
  assert.equal(apply.currentPeriodEnd?.getTime(), FUTURE.getTime());
});

test("RENEWAL keeps Plus active with the new period end", () => {
  const apply = applyFromEvent(event({ type: "RENEWAL" }), NOW);
  assert.equal(apply?.tier, "plus");
  assert.equal(apply?.subscriptionStatus, "active");
});

test("TRIAL period maps to trialing with trialEndsAt set", () => {
  const apply = applyFromEvent(event({ period_type: "TRIAL" }), NOW);
  assert.equal(apply?.tier, "plus");
  assert.equal(apply?.subscriptionStatus, "trialing");
  assert.equal(apply?.trialEndsAt?.getTime(), FUTURE.getTime());
});

test("CANCELLATION keeps Plus (auto-renew off) until the period end", () => {
  const apply = applyFromEvent(event({ type: "CANCELLATION" }), NOW);
  assert.equal(apply?.tier, "plus");
  assert.equal(apply?.subscriptionStatus, "canceled");
  assert.equal(apply?.currentPeriodEnd?.getTime(), FUTURE.getTime());
});

test("EXPIRATION drops the user to Free/expired", () => {
  const apply = applyFromEvent(
    event({ type: "EXPIRATION", expiration_at_ms: PAST.getTime() }),
    NOW,
  );
  assert.equal(apply?.tier, "free");
  assert.equal(apply?.subscriptionStatus, "expired");
});

test("a past expiration is treated as expired even on a non-EXPIRATION event", () => {
  // e.g. a refund back-dates the expiration.
  const apply = applyFromEvent(
    event({ type: "CANCELLATION", expiration_at_ms: PAST.getTime() }),
    NOW,
  );
  assert.equal(apply?.tier, "free");
  assert.equal(apply?.subscriptionStatus, "expired");
});

test("events for an unrelated entitlement are ignored", () => {
  const apply = applyFromEvent(event({ entitlement_ids: ["some_other"] }), NOW);
  assert.equal(apply, null);
});

test("events with no entitlement info apply (single-entitlement app)", () => {
  const apply = applyFromEvent(
    event({ entitlement_ids: null, entitlement_id: null }),
    NOW,
  );
  assert.equal(apply?.tier, "plus");
});

test("non-state and TRANSFER events return null from applyFromEvent", () => {
  assert.equal(applyFromEvent(event({ type: "TEST" }), NOW), null);
  assert.equal(applyFromEvent(event({ type: "SUBSCRIBER_ALIAS" }), NOW), null);
  assert.equal(applyFromEvent(event({ type: "TRANSFER" }), NOW), null);
});

test("events without an app_user_id are ignored", () => {
  assert.equal(applyFromEvent(event({ app_user_id: null }), NOW), null);
});

test("TRANSFER downgrades the losing ids and lists the gaining ids", () => {
  const ev: RevenueCatEvent = {
    type: "TRANSFER",
    transferred_from: ["loser_1", "loser_2"],
    transferred_to: ["winner_1"],
  };
  const downs = downgradesFromTransfer(ev);
  assert.equal(downs.length, 2);
  assert.deepEqual(
    downs.map((d) => d.userId).sort(),
    ["loser_1", "loser_2"],
  );
  assert.ok(downs.every((d) => d.tier === "free"));
  assert.deepEqual(transferRecipients(ev), ["winner_1"]);
});

// --- One Language ($6.99) middle tier --------------------------------------

test("an event for the one_language entitlement maps to the one_language tier", () => {
  const apply = applyFromEvent(
    event({ entitlement_ids: [ONE_LANGUAGE_ENTITLEMENT_ID] }),
    NOW,
  );
  assert.equal(apply?.tier, "one_language");
  assert.equal(apply?.subscriptionStatus, "active");
  assert.equal(apply?.currentPeriodEnd?.getTime(), FUTURE.getTime());
});

test("a TRIAL period on the one_language entitlement is treated as active (no trial)", () => {
  const apply = applyFromEvent(
    event({
      entitlement_ids: [ONE_LANGUAGE_ENTITLEMENT_ID],
      period_type: "TRIAL",
    }),
    NOW,
  );
  assert.equal(apply?.tier, "one_language");
  assert.equal(apply?.subscriptionStatus, "active");
  assert.equal(apply?.trialEndsAt, null);
});

test("when an event lists both entitlements, all-access wins", () => {
  const apply = applyFromEvent(
    event({ entitlement_ids: [ONE_LANGUAGE_ENTITLEMENT_ID, PLUS_ENTITLEMENT_ID] }),
    NOW,
  );
  assert.equal(apply?.tier, "plus");
});

test("expiring the one_language entitlement drops the user to Free/expired", () => {
  const apply = applyFromEvent(
    event({
      type: "EXPIRATION",
      entitlement_ids: [ONE_LANGUAGE_ENTITLEMENT_ID],
      expiration_at_ms: PAST.getTime(),
    }),
    NOW,
  );
  assert.equal(apply?.tier, "free");
  assert.equal(apply?.subscriptionStatus, "expired");
});

// --- subscriber snapshots (reconcile-on-read) ------------------------------

function subscriber(over: Partial<RevenueCatSubscriber>): RevenueCatSubscriber {
  return { original_app_user_id: USER, ...over };
}

test("subscriber with an active Plus entitlement resolves to active Plus", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_plus_monthly",
        },
      },
      subscriptions: {
        bolo_plus_monthly: {
          expires_date: FUTURE.toISOString(),
          period_type: "normal",
          unsubscribe_detected_at: null,
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.tier, "plus");
  assert.equal(apply.subscriptionStatus, "active");
});

test("subscriber whose entitlement already expired resolves to Free/expired", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: {
          expires_date: PAST.toISOString(),
          product_identifier: "bolo_plus_monthly",
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.tier, "free");
  assert.equal(apply.subscriptionStatus, "expired");
});

test("subscriber in a trial resolves to trialing", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_plus_monthly",
        },
      },
      subscriptions: {
        bolo_plus_monthly: {
          expires_date: FUTURE.toISOString(),
          period_type: "trial",
          unsubscribe_detected_at: null,
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.subscriptionStatus, "trialing");
  assert.equal(apply.trialEndsAt?.getTime(), FUTURE.getTime());
});

test("subscriber with a canceled (unsubscribed) active sub resolves to canceled", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_plus_monthly",
        },
      },
      subscriptions: {
        bolo_plus_monthly: {
          expires_date: FUTURE.toISOString(),
          period_type: "normal",
          unsubscribe_detected_at: PAST.toISOString(),
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.subscriptionStatus, "canceled");
  assert.equal(apply.tier, "plus");
});

test("subscriber with no Plus entitlement resolves to Free/none", () => {
  const apply = applyFromSubscriber(USER, subscriber({ entitlements: {} }), NOW);
  assert.equal(apply.tier, "free");
  assert.equal(apply.subscriptionStatus, "none");
});

test("a null subscriber (no RevenueCat record) resolves to Free/none", () => {
  const apply = applyFromSubscriber(USER, null, NOW);
  assert.equal(apply.tier, "free");
  assert.equal(apply.subscriptionStatus, "none");
});

test("subscriber with an active one_language entitlement resolves to one_language", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [ONE_LANGUAGE_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_one_language_monthly",
        },
      },
      subscriptions: {
        bolo_one_language_monthly: {
          expires_date: FUTURE.toISOString(),
          period_type: "normal",
          unsubscribe_detected_at: null,
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.tier, "one_language");
  assert.equal(apply.subscriptionStatus, "active");
});

test("subscriber with both entitlements active prefers all-access Plus", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_plus_monthly",
        },
        [ONE_LANGUAGE_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_one_language_monthly",
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.tier, "plus");
});

test("subscriber with an expired plus but active one_language resolves to one_language", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: {
          expires_date: PAST.toISOString(),
          product_identifier: "bolo_plus_monthly",
        },
        [ONE_LANGUAGE_ENTITLEMENT_ID]: {
          expires_date: FUTURE.toISOString(),
          product_identifier: "bolo_one_language_monthly",
        },
      },
    }),
    NOW,
  );
  assert.equal(apply.tier, "one_language");
  assert.equal(apply.subscriptionStatus, "active");
});

test("a lifetime (null-expiry) entitlement is always active Plus", () => {
  const apply = applyFromSubscriber(
    USER,
    subscriber({
      entitlements: {
        [PLUS_ENTITLEMENT_ID]: { expires_date: null, product_identifier: "lt" },
      },
    }),
    NOW,
  );
  assert.equal(apply.tier, "plus");
  assert.equal(apply.subscriptionStatus, "active");
});
