// The in-place Plus -> Family upgrade must preserve the learner's billing
// cadence: the Family price is chosen from the CURRENT subscription's
// recurring interval, never from client input. These tests pin that mapping
// and the env-var price selection it feeds.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  intervalFromStripeRecurring,
  getFamilyPriceId,
  getPlusPriceId,
} from "./stripePricing";

describe("intervalFromStripeRecurring", () => {
  test("a yearly Stripe subscription maps to the annual interval", () => {
    assert.equal(intervalFromStripeRecurring("year"), "annual");
  });

  test("a monthly Stripe subscription maps to the monthly interval", () => {
    assert.equal(intervalFromStripeRecurring("month"), "monthly");
  });

  test("missing recurring info falls back to monthly", () => {
    assert.equal(intervalFromStripeRecurring(undefined), "monthly");
    assert.equal(intervalFromStripeRecurring(null), "monthly");
  });
});

describe("price id selection from env", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = [
    "STRIPE_FAMILY_MONTHLY_PRICE_ID",
    "STRIPE_FAMILY_ANNUAL_PRICE_ID",
    "STRIPE_PLUS_MONTHLY_PRICE_ID",
    "STRIPE_PLUS_ANNUAL_PRICE_ID",
  ];

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.STRIPE_FAMILY_MONTHLY_PRICE_ID = "price_fam_month";
    process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID = "price_fam_year";
    process.env.STRIPE_PLUS_MONTHLY_PRICE_ID = "price_plus_month";
    process.env.STRIPE_PLUS_ANNUAL_PRICE_ID = "price_plus_year";
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("an annual All-Access holder upgrades onto the ANNUAL Family price", () => {
    const interval = intervalFromStripeRecurring("year");
    assert.equal(getFamilyPriceId(interval), "price_fam_year");
  });

  test("a monthly All-Access holder upgrades onto the MONTHLY Family price", () => {
    const interval = intervalFromStripeRecurring("month");
    assert.equal(getFamilyPriceId(interval), "price_fam_month");
  });

  test("plus price ids resolve per interval", () => {
    assert.equal(getPlusPriceId("monthly"), "price_plus_month");
    assert.equal(getPlusPriceId("annual"), "price_plus_year");
  });

  test("a missing annual Family env var returns null (caller falls back)", () => {
    delete process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID;
    assert.equal(getFamilyPriceId("annual"), null);
  });
});
