// Plan prices are a money surface: the client must render exactly what Stripe
// charges, derive the annual savings from the real amounts, and show nothing
// at all when the catalog is unavailable rather than inventing a number.
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  buildTierPricing,
  formatMoney,
  usePricing,
  __seedPricingForTests,
  PRICING_CACHE_TTL_MS,
  type PricingCatalog,
} from "@/lib/pricing";
import { PRICING_CATALOG } from "./fixtures";

describe("formatMoney", () => {
  test("renders Stripe minor units as currency", () => {
    expect(formatMoney({ amountCents: 2499, currency: "usd" })).toBe("$24.99");
    expect(formatMoney({ amountCents: 17499, currency: "usd" })).toBe("$174.99");
  });

  test("keeps two fraction digits on whole amounts", () => {
    expect(formatMoney({ amountCents: 2000, currency: "usd" })).toBe("$20.00");
  });
});

describe("buildTierPricing", () => {
  test("renders both tiers from the catalog amounts", () => {
    const pricing = buildTierPricing(PRICING_CATALOG);

    expect(pricing.plus.monthly?.price).toBe("$12.99");
    expect(pricing.plus.monthly?.per).toBe("/mo");
    expect(pricing.family.monthly?.price).toBe("$24.99");
    expect(pricing.family.annual?.price).toBe("$174.99");
    expect(pricing.family.annual?.per).toBe("/yr");
  });

  test("derives the monthly equivalent of an annual plan", () => {
    const pricing = buildTierPricing(PRICING_CATALOG);

    // $89.99 / 12 = $7.50, $174.99 / 12 = $14.58.
    expect(pricing.plus.annual?.note).toBe("Just $7.50/mo, billed yearly.");
    expect(pricing.family.annual?.note).toBe(
      "Just $14.58/mo for up to 4 people, billed yearly.",
    );
  });

  test("derives the savings badge from the real amounts", () => {
    const pricing = buildTierPricing(PRICING_CATALOG);

    expect(pricing.plus.annual?.badge).toBe("Save 42%");
    expect(pricing.family.annual?.badge).toBe("Save 42%");
  });

  test("no badge when annual is not actually cheaper", () => {
    const flat: PricingCatalog = {
      plus: {
        monthly: { amountCents: 1000, currency: "usd" },
        annual: { amountCents: 12000, currency: "usd" },
      },
      family: {},
    };

    expect(buildTierPricing(flat).plus.annual?.badge).toBeUndefined();
  });

  test("an interval missing from the catalog stays missing", () => {
    const monthlyOnly: PricingCatalog = {
      plus: { monthly: { amountCents: 1299, currency: "usd" } },
      family: {},
    };

    const pricing = buildTierPricing(monthlyOnly);

    expect(pricing.plus.annual).toBeUndefined();
    expect(pricing.family.monthly).toBeUndefined();
  });

  test("the cadence clause matches the interval", () => {
    const pricing = buildTierPricing(PRICING_CATALOG);

    expect(pricing.plus.monthly?.cadence).toBe("billed monthly");
    expect(pricing.plus.annual?.cadence).toBe("billed yearly");
  });
});

describe("usePricing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __seedPricingForTests(PRICING_CATALOG);
  });

  test("serves the cached catalog without a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => usePricing());

    expect(result.current.pricing?.family.monthly?.price).toBe("$24.99");
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("fetches the catalog from the pricing endpoint when empty", async () => {
    __seedPricingForTests(null);
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => PRICING_CATALOG,
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => usePricing());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/pricing",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.current.pricing?.plus.monthly?.price).toBe("$12.99");
    expect(result.current.isError).toBe(false);
  });

  test("refetches instead of quoting a catalog older than the TTL", async () => {
    __seedPricingForTests(PRICING_CATALOG);
    const stale: PricingCatalog = {
      plus: { monthly: { amountCents: 1499, currency: "usd" } },
      family: {},
    };
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => stale }));
    vi.stubGlobal("fetch", fetchSpy);
    // A long-lived tab: the seeded catalog is now older than the TTL.
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + PRICING_CACHE_TTL_MS + 1);

    const { result } = renderHook(() => usePricing());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.pricing?.plus.monthly?.price).toBe("$14.99"),
    );
    vi.mocked(Date.now).mockRestore();
  });

  test("reports an error instead of a price when the catalog is unavailable", async () => {
    __seedPricingForTests(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );

    const { result } = renderHook(() => usePricing());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.pricing).toBeNull();
  });
});

beforeEach(() => {
  // setup.ts seeds the live ladder before every test; the fetch cases above
  // clear it explicitly.
});
