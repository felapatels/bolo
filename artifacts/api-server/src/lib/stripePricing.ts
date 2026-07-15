// Stripe price ids for Bolo! Plus, set once `scripts/seedStripeProducts.ts` has
// created the product/prices in Stripe. Kept out of code (env-configured) so
// the same code works across dev/prod Stripe accounts without a redeploy.

export type PlusInterval = "monthly" | "annual";

export function getPlusPriceId(interval: PlusInterval): string | null {
  const key =
    interval === "monthly"
      ? "STRIPE_PLUS_MONTHLY_PRICE_ID"
      : "STRIPE_PLUS_ANNUAL_PRICE_ID";
  return process.env[key]?.trim() || null;
}

// The Family plan ($19.99/mo, up to 4 people) is monthly-only.
export function getFamilyPriceId(): string | null {
  return process.env.STRIPE_FAMILY_MONTHLY_PRICE_ID?.trim() || null;
}
