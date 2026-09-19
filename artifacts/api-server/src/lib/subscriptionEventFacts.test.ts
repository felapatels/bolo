import { test } from "node:test";
import assert from "node:assert/strict";
import { isRevenueEvent } from "./subscriptionEventFacts.js";

// WHAT COUNTS AS MONEY. Every wrong answer here becomes a revenue number
// somebody acts on, and the two failure directions are not symmetric: counting
// a sandbox purchase as revenue tells the owner he has customers he does not
// have, which is the exact fault this table was built to end.

const PAID = {
  type: "INITIAL_PURCHASE",
  period_type: "NORMAL",
  environment: "PRODUCTION",
  price: 89.99,
  currency: "USD",
};

test("a real production purchase is revenue", () => {
  assert.equal(isRevenueEvent(PAID), true);
});

test("the same purchase in SANDBOX is not", () => {
  // THE WHOLE POINT. A TestFlight or App Review purchase is identical in every
  // other field, and for weeks the only thing telling them apart was a
  // hand-kept list of tester ids in ownerGate.ts.
  assert.equal(isRevenueEvent({ ...PAID, environment: "SANDBOX" }), false);
});

test("a missing environment is not revenue either", () => {
  // Absent means unknown. Counting unknown as production is the same mistake
  // wearing a different coat, and it is the one an older webhook version would
  // have produced, since the field was simply not read.
  assert.equal(isRevenueEvent({ ...PAID, environment: undefined }), false);
});

test("a free trial is not revenue, however real the account", () => {
  assert.equal(isRevenueEvent({ ...PAID, period_type: "TRIAL" }), false);
});

test("a promotional grant is not revenue", () => {
  // rc_promo_plus_three_month rows are the bulk of what looks like a
  // subscriber list on the RevenueCat overview.
  assert.equal(isRevenueEvent({ ...PAID, period_type: "PROMOTIONAL" }), false);
});

test("a renewal IS revenue: it is the money that arrives every year", () => {
  assert.equal(isRevenueEvent({ ...PAID, type: "RENEWAL" }), true);
});

test("a trial converting is revenue, because the price is real by then", () => {
  // RevenueCat sends the conversion as a RENEWAL with is_trial_conversion and
  // period_type NORMAL. Both of the fleet's real customers arrived this way.
  assert.equal(
    isRevenueEvent({
      ...PAID,
      type: "RENEWAL",
      period_type: "NORMAL",
      is_trial_conversion: true,
    }),
    true,
  );
});

test("a cancellation is not revenue, and not negative revenue either", () => {
  // On the App Store a cancellation turns off auto-renewal. Access runs to the
  // paid expiry and no money moves. A refund is a different thing and is
  // deliberately not modelled yet: inventing its shape from documentation is
  // how a total ends up wrong in a direction nobody checks.
  assert.equal(isRevenueEvent({ ...PAID, type: "CANCELLATION" }), false);
});

test("an expiration is not revenue", () => {
  assert.equal(isRevenueEvent({ ...PAID, type: "EXPIRATION" }), false);
});

test("a zero or missing price is not revenue whatever the type says", () => {
  assert.equal(isRevenueEvent({ ...PAID, price: 0 }), false);
  assert.equal(isRevenueEvent({ ...PAID, price: undefined }), false);
});

test("an unknown event type is not revenue", () => {
  // RevenueCat adds types. The ledger stores every one of them, but only the
  // named few are counted as money, so a new type cannot silently become
  // income.
  assert.equal(isRevenueEvent({ ...PAID, type: "SOMETHING_NEW" }), false);
});
