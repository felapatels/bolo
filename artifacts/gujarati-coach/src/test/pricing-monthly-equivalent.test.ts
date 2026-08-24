// The annual "just $x/mo" figure, and why it is floored.
//
// $89.99 a year is $7.4991 a month. Rounded that is $7.50, and twelve times
// $7.50 is $90.00 — more than the card's own annual price. An advertised
// monthly rate that does not multiply back to the amount charged is a claim
// checkout will not honour, so the figure is floored to the cent.
//
// Shipped as $7.50 and corrected 2026-08-24 when the owner asked for $7.49.
import { describe, test, expect } from "vitest";
import { buildTierPricing, type PricingCatalog } from "@/lib/pricing";

const catalog = (annualCents: number): PricingCatalog => ({
  plus: {
    monthly: { amountCents: 1299, currency: "usd" },
    annual: { amountCents: annualCents, currency: "usd" },
  },
  family: {},
});

describe("the annual monthly-equivalent figure", () => {
  test("$89.99/yr shows as $7.49/mo, not $7.50", () => {
    expect(buildTierPricing(catalog(8999)).plus.annual?.monthlyEquivalent).toBe(
      "$7.49",
    );
  });

  test("twelve times the shown figure never exceeds the annual price", () => {
    // The invariant the flooring exists for, checked across a spread of prices
    // rather than the one that prompted it.
    for (const cents of [8999, 9999, 4999, 17499, 12000, 100, 1]) {
      const shown =
        buildTierPricing(catalog(cents)).plus.annual?.monthlyEquivalent ?? "";
      const shownCents = Math.round(Number(shown.replace(/[^0-9.]/g, "")) * 100);
      expect(shownCents * 12).toBeLessThanOrEqual(cents);
    }
  });

  test("monthly carries no monthly-equivalent, because it is already monthly", () => {
    expect(
      buildTierPricing(catalog(8999)).plus.monthly?.monthlyEquivalent,
    ).toBeUndefined();
  });

  test("the note copy quotes the same floored figure", () => {
    expect(buildTierPricing(catalog(8999)).plus.annual?.note).toContain("$7.49");
  });
});
