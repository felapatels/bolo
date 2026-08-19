import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  applyFromStripeSubscription,
  applyFromStripeDeletion,
} from "./stripeSync";

// Pure translation-layer tests: a Stripe Subscription object in, the columns we
// write out. No network, no database, mirrors revenuecat.test.ts's coverage of
// applyFromEvent. The entitlement math that consumes these columns is proven
// separately in the entitlements tests.

const USER = "user_stripe_test";

// Minimal builder for the bits of a Subscription our translation reads.
function sub(
  overrides: Partial<Stripe.Subscription> & {
    status: Stripe.Subscription.Status;
  },
): Stripe.Subscription {
  return {
    id: "sub_123",
    metadata: { userId: USER },
    trial_end: null,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 2_000_000_000 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

test("an active subscription maps to active Plus until the period end", () => {
  const apply = applyFromStripeSubscription(sub({ status: "active" }));
  assert.deepEqual(apply, {
    userId: USER,
    tier: "plus",
    subscriptionStatus: "active",
    trialEndsAt: null,
    currentPeriodEnd: new Date(2_000_000_000 * 1000),
    subscriptionProviderId: "sub_123",
  });
});

test("a trialing subscription maps to trialing with trialEndsAt set", () => {
  const apply = applyFromStripeSubscription(
    sub({ status: "trialing", trial_end: 1_900_000_000 }),
  );
  assert.equal(apply?.subscriptionStatus, "trialing");
  assert.equal(apply?.tier, "plus");
  assert.deepEqual(apply?.trialEndsAt, new Date(1_900_000_000 * 1000));
});

test("cancel_at_period_end reads as canceled but stays Plus until the period ends", () => {
  const apply = applyFromStripeSubscription(
    sub({ status: "active", cancel_at_period_end: true }),
  );
  assert.equal(apply?.tier, "plus");
  assert.equal(apply?.subscriptionStatus, "canceled");
  assert.deepEqual(apply?.currentPeriodEnd, new Date(2_000_000_000 * 1000));
});

test("past_due keeps Plus (payment-retry grace) until the period lapses", () => {
  const apply = applyFromStripeSubscription(sub({ status: "past_due" }));
  assert.equal(apply?.tier, "plus");
  assert.equal(apply?.subscriptionStatus, "active");
});

test("a canceled subscription drops to Free/expired", () => {
  const apply = applyFromStripeSubscription(sub({ status: "canceled" }));
  assert.equal(apply?.tier, "free");
  assert.equal(apply?.subscriptionStatus, "expired");
});

test("incomplete_expired drops to Free/expired", () => {
  const apply = applyFromStripeSubscription(
    sub({ status: "incomplete_expired" }),
  );
  assert.equal(apply?.tier, "free");
  assert.equal(apply?.subscriptionStatus, "expired");
});

test("an incomplete subscription (first payment pending) is not actionable yet", () => {
  assert.equal(applyFromStripeSubscription(sub({ status: "incomplete" })), null);
});

test("a paused subscription is not actionable", () => {
  assert.equal(applyFromStripeSubscription(sub({ status: "paused" })), null);
});

test("a subscription without a userId in metadata is ignored", () => {
  const apply = applyFromStripeSubscription(
    sub({ status: "active", metadata: {} }),
  );
  assert.equal(apply, null);
});

test("current_period_end is read from the subscription root when not on the item", () => {
  const raw = sub({ status: "active" });
  (raw.items as unknown as { data: unknown[] }).data = [{}];
  (raw as unknown as { current_period_end: number }).current_period_end =
    1_800_000_000;
  const apply = applyFromStripeSubscription(raw);
  assert.deepEqual(apply?.currentPeriodEnd, new Date(1_800_000_000 * 1000));
});

test("a deletion event ends access outright (Free/canceled, no period end)", () => {
  const apply = applyFromStripeDeletion(sub({ status: "canceled" }));
  assert.deepEqual(apply, {
    userId: USER,
    tier: "free",
    subscriptionStatus: "canceled",
    trialEndsAt: null,
    currentPeriodEnd: null,
    subscriptionProviderId: "sub_123",
  });
});

test("a deletion event without a userId is ignored", () => {
  const apply = applyFromStripeDeletion(
    sub({ status: "canceled", metadata: {} }),
  );
  assert.equal(apply, null);
});
