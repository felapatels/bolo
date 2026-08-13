// The pricing catalog is a money surface: what it reports is what the paywall
// shows, so it must mirror Stripe exactly, never invent a price, and never
// serve a cached value once it has gone stale.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildPricingCatalog,
  getPricingCatalog,
  PRICING_CACHE_TTL_MS,
  PRICING_FAILURE_COOLDOWN_MS,
  __resetPricingCatalogCacheForTests,
  type PriceFetcher,
} from "./pricingCatalog";

const KEYS = [
  "STRIPE_PLUS_MONTHLY_PRICE_ID",
  "STRIPE_PLUS_ANNUAL_PRICE_ID",
  "STRIPE_FAMILY_MONTHLY_PRICE_ID",
  "STRIPE_FAMILY_ANNUAL_PRICE_ID",
  // Chai packs are configured in this environment, so they must be saved AND
  // cleared per test — otherwise the ambient ids leak in and the fetcher is
  // asked for prices these tests never stubbed.
  "STRIPE_CHAI_PACK_SMALL_PRICE_ID",
  "STRIPE_CHAI_PACK_MEDIUM_PRICE_ID",
  "STRIPE_CHAI_PACK_LARGE_PRICE_ID",
];

const saved: Record<string, string | undefined> = {};

const AMOUNTS: Record<string, number> = {
  price_plus_month: 1299,
  price_plus_year: 8999,
  price_fam_month: 2499,
  price_fam_year: 17499,
  price_pack_small: 199,
  price_pack_medium: 499,
  price_pack_large: 999,
};

function fetcherFor(calls: string[]): PriceFetcher {
  return async (priceId: string) => {
    calls.push(priceId);
    const unit_amount = AMOUNTS[priceId];
    assert.ok(unit_amount !== undefined, `unexpected price id ${priceId}`);
    return { unit_amount, currency: "usd" };
  };
}

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  process.env.STRIPE_PLUS_MONTHLY_PRICE_ID = "price_plus_month";
  process.env.STRIPE_PLUS_ANNUAL_PRICE_ID = "price_plus_year";
  process.env.STRIPE_FAMILY_MONTHLY_PRICE_ID = "price_fam_month";
  process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID = "price_fam_year";
  delete process.env.STRIPE_CHAI_PACK_SMALL_PRICE_ID;
  delete process.env.STRIPE_CHAI_PACK_MEDIUM_PRICE_ID;
  delete process.env.STRIPE_CHAI_PACK_LARGE_PRICE_ID;
  __resetPricingCatalogCacheForTests();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  __resetPricingCatalogCacheForTests();
});

describe("buildPricingCatalog", () => {
  test("reports the Stripe amount for every configured price id", async () => {
    const catalog = await buildPricingCatalog(fetcherFor([]));

    assert.deepEqual(catalog, {
      plus: {
        monthly: { amountCents: 1299, currency: "usd" },
        annual: { amountCents: 8999, currency: "usd" },
      },
      family: {
        monthly: { amountCents: 2499, currency: "usd" },
        annual: { amountCents: 17499, currency: "usd" },
      },
      packs: {},
    });
  });

  test("prices every configured Chai pack, carrying the Chai it credits", async () => {
    process.env.STRIPE_CHAI_PACK_SMALL_PRICE_ID = "price_pack_small";
    process.env.STRIPE_CHAI_PACK_MEDIUM_PRICE_ID = "price_pack_medium";
    process.env.STRIPE_CHAI_PACK_LARGE_PRICE_ID = "price_pack_large";

    const catalog = await buildPricingCatalog(fetcherFor([]));

    // The amount comes from Stripe; the Chai count comes from the same catalog
    // the credit path grants from, so the shop cannot advertise a pack size
    // the purchase does not deliver.
    assert.deepEqual(catalog.packs, {
      small: { amountCents: 199, currency: "usd", chai: 25 },
      medium: { amountCents: 499, currency: "usd", chai: 75 },
      large: { amountCents: 999, currency: "usd", chai: 200 },
    });
  });

  test("an unconfigured pack is absent, and packs alone never satisfy the price check", async () => {
    process.env.STRIPE_CHAI_PACK_SMALL_PRICE_ID = "price_pack_small";

    const catalog = await buildPricingCatalog(fetcherFor([]));
    assert.deepEqual(catalog.packs, {
      small: { amountCents: 199, currency: "usd", chai: 25 },
    });

    // A deployment with packs but no plans is still misconfigured: the paywall
    // is the surface the check exists to protect.
    for (const key of KEYS.slice(0, 4)) delete process.env[key];
    await assert.rejects(
      () => buildPricingCatalog(fetcherFor([])),
      /No Stripe price ids/,
    );
  });

  test("an unconfigured interval is absent, never guessed", async () => {
    delete process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID;

    const catalog = await buildPricingCatalog(fetcherFor([]));

    assert.equal(catalog.family.annual, undefined);
    assert.deepEqual(catalog.family.monthly, {
      amountCents: 2499,
      currency: "usd",
    });
  });

  test("a configured price Stripe cannot amount is an error", async () => {
    const fetchPrice: PriceFetcher = async () => ({
      unit_amount: null,
      currency: "usd",
    });

    await assert.rejects(() => buildPricingCatalog(fetchPrice), /unit_amount/);
  });

  test("no configured price ids at all is an error", async () => {
    for (const key of KEYS) delete process.env[key];

    await assert.rejects(
      () => buildPricingCatalog(fetcherFor([])),
      /No Stripe price ids/,
    );
  });
});

describe("getPricingCatalog caching", () => {
  test("reuses the cached catalog inside the TTL", async () => {
    const calls: string[] = [];
    const fetchPrice = fetcherFor(calls);

    await getPricingCatalog({ now: 1_000, fetchPrice });
    await getPricingCatalog({ now: 1_000 + PRICING_CACHE_TTL_MS - 1, fetchPrice });

    assert.equal(calls.length, 4);
  });

  test("refetches once the TTL has passed", async () => {
    const calls: string[] = [];
    const fetchPrice = fetcherFor(calls);

    await getPricingCatalog({ now: 1_000, fetchPrice });
    await getPricingCatalog({ now: 1_000 + PRICING_CACHE_TTL_MS, fetchPrice });

    assert.equal(calls.length, 8);
  });

  test("a failure is never served as a price, and is replayed during the cooldown instead of re-hitting Stripe", async () => {
    // The route is public: without a cooldown an outage would let every
    // unauthenticated request start its own Stripe lookup.
    const calls: string[] = [];
    const fetchPrice: PriceFetcher = async (id) => {
      calls.push(id);
      throw new Error("stripe down");
    };

    await assert.rejects(
      () => getPricingCatalog({ now: 1_000, fetchPrice }),
      /stripe down/,
    );
    const attempted = calls.length;
    await assert.rejects(
      () =>
        getPricingCatalog({
          now: 1_000 + PRICING_FAILURE_COOLDOWN_MS - 1,
          fetchPrice,
        }),
      /stripe down/,
    );

    assert.equal(calls.length, attempted);
  });

  test("retries Stripe once the failure cooldown has passed", async () => {
    let fail = true;
    const calls: string[] = [];
    const ok = fetcherFor(calls);
    const fetchPrice: PriceFetcher = async (id) => {
      if (fail) throw new Error("stripe down");
      return ok(id);
    };

    await assert.rejects(() => getPricingCatalog({ now: 1_000, fetchPrice }));
    fail = false;
    const catalog = await getPricingCatalog({
      now: 1_000 + PRICING_FAILURE_COOLDOWN_MS,
      fetchPrice,
    });

    assert.deepEqual(catalog.plus.monthly, {
      amountCents: 1299,
      currency: "usd",
    });
  });

  test("concurrent callers share one in-flight fetch", async () => {
    const calls: string[] = [];
    const slow: PriceFetcher = async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return fetcherFor(calls)(id);
    };

    await Promise.all([
      getPricingCatalog({ now: 1_000, fetchPrice: slow }),
      getPricingCatalog({ now: 1_000, fetchPrice: slow }),
      getPricingCatalog({ now: 1_000, fetchPrice: slow }),
    ]);

    assert.equal(calls.length, 4);
  });
});
