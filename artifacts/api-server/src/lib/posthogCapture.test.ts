import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  APP_ID,
  captureBody,
  captureUuid,
  funnelFromRevenueCat,
  funnelFromStripe,
  sendFunnelEvent,
} from "./posthogCapture";

// The server half of the funnel set (owner analytics audit, 2026-09-16). The
// mapping decides what the owner reads as "trials" and "subscriptions", so
// each branch, and each thing that must NOT count, is pinned here.

const rc = (over: Record<string, unknown>) => ({
  id: "0f1e2d3c-rc-event",
  type: "INITIAL_PURCHASE",
  app_user_id: "user_abc",
  store: "APP_STORE",
  product_id: "bolo_plus_monthly",
  entitlement_ids: ["plus"],
  period_type: "TRIAL",
  event_timestamp_ms: 1_758_000_000_000,
  price: 0,
  currency: "USD",
  ...over,
});

test("RevenueCat: an initial purchase on a trial period is trial_started", () => {
  const c = funnelFromRevenueCat(rc({}));
  assert.equal(c?.event, "trial_started");
  assert.equal(c?.distinctId, "user_abc");
  assert.equal(c?.properties.platform, "ios");
  assert.equal(c?.properties.converted_from_trial, false);
});

test("RevenueCat: an initial purchase on a normal period is subscription_started", () => {
  const c = funnelFromRevenueCat(rc({ period_type: "NORMAL", store: "PLAY_STORE", price: 9.99 }));
  assert.equal(c?.event, "subscription_started");
  assert.equal(c?.properties.platform, "android");
  assert.equal(c?.properties.price, 9.99);
});

test("RevenueCat: the trial's first paid renewal is subscription_started, converted", () => {
  const c = funnelFromRevenueCat(rc({ type: "RENEWAL", period_type: "NORMAL", is_trial_conversion: true }));
  assert.equal(c?.event, "subscription_started");
  assert.equal(c?.properties.converted_from_trial, true);
});

test("RevenueCat: ordinary renewals, cancellations and Chai packs are not funnel steps", () => {
  assert.equal(funnelFromRevenueCat(rc({ type: "RENEWAL", period_type: "NORMAL" })), null);
  assert.equal(funnelFromRevenueCat(rc({ type: "CANCELLATION" })), null);
  assert.equal(funnelFromRevenueCat(rc({ type: "NON_RENEWING_PURCHASE" })), null);
  assert.equal(funnelFromRevenueCat(rc({ app_user_id: null })), null);
  assert.equal(funnelFromRevenueCat(rc({ id: null })), null);
});

const stripeEvent = (
  type: string,
  status: string,
  previous?: Record<string, unknown>,
): Stripe.Event =>
  ({
    id: "evt_123",
    type,
    created: 1_758_000_000,
    data: {
      object: {
        status,
        metadata: { userId: "user_web", plan: "plus" },
        items: { data: [{ price: { id: "price_1", unit_amount: 999, currency: "usd" } }] },
      },
      ...(previous ? { previous_attributes: previous } : {}),
    },
  }) as unknown as Stripe.Event;

test("Stripe: created trialing is trial_started, created active is subscription_started", () => {
  const t = funnelFromStripe(stripeEvent("customer.subscription.created", "trialing"));
  assert.equal(t?.event, "trial_started");
  assert.equal(t?.properties.platform, "web");
  assert.equal(t?.properties.price, 9.99);
  assert.equal(t?.properties.currency, "USD");
  const s = funnelFromStripe(stripeEvent("customer.subscription.created", "active"));
  assert.equal(s?.event, "subscription_started");
});

test("Stripe: trialing to active on an update is the conversion, and only that", () => {
  const c = funnelFromStripe(stripeEvent("customer.subscription.updated", "active", { status: "trialing" }));
  assert.equal(c?.event, "subscription_started");
  assert.equal(c?.properties.converted_from_trial, true);
  // An update that is not the conversion (a card change on an active sub, a
  // lapse to past_due) must not count a second subscription.
  assert.equal(funnelFromStripe(stripeEvent("customer.subscription.updated", "active")), null);
  assert.equal(
    funnelFromStripe(stripeEvent("customer.subscription.updated", "past_due", { status: "active" })),
    null,
  );
  assert.equal(funnelFromStripe(stripeEvent("customer.subscription.deleted", "canceled")), null);
});

test("a webhook retry produces the same uuid and timestamp, so PostHog deduplicates", () => {
  const a = captureBody("phc_test", funnelFromRevenueCat(rc({}))!);
  const b = captureBody("phc_test", funnelFromRevenueCat(rc({}))!);
  assert.equal(a.uuid, b.uuid);
  assert.equal(a.timestamp, b.timestamp);
  assert.match(a.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(captureUuid("stripe:evt_1", "trial_started"), captureUuid("stripe:evt_2", "trial_started"));
  assert.equal(a.properties.app, APP_ID);
});

test("nothing is sent outside a Replit deployment", () => {
  const saved = { dep: process.env.REPLIT_DEPLOYMENT, fetch: globalThis.fetch };
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    delete process.env.REPLIT_DEPLOYMENT;
    sendFunnelEvent(funnelFromRevenueCat(rc({})));
    assert.equal(calls, 0);
    // The positive case, so this guard is not only ever observed agreeing.
    process.env.REPLIT_DEPLOYMENT = "1";
    process.env.POSTHOG_KEY = "phc_test";
    sendFunnelEvent(funnelFromRevenueCat(rc({})));
    assert.equal(calls, 1);
  } finally {
    if (saved.dep === undefined) delete process.env.REPLIT_DEPLOYMENT;
    else process.env.REPLIT_DEPLOYMENT = saved.dep;
    delete process.env.POSTHOG_KEY;
    globalThis.fetch = saved.fetch;
  }
});
