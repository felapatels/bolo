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

// Map a Stripe price's `recurring.interval` ("month"/"year") onto our
// PlusInterval. Used by the in-place Plus -> Family upgrade so an annual
// All-Access holder lands on annual Family: the billing cadence is derived
// from the subscription being upgraded, never from client input.
export function intervalFromStripeRecurring(
  recurring: string | null | undefined,
): PlusInterval {
  return recurring === "year" ? "annual" : "monthly";
}

// One-time Chai packs (web only). Same env-configured shape as the
// subscription prices: `scripts/seedStripeProducts.ts` creates the products and
// prints the ids to set. An unconfigured pack simply cannot be checked out.
export function getChaiPackPriceId(packId: string): string | null {
  const key = `STRIPE_CHAI_PACK_${packId.toUpperCase()}_PRICE_ID`;
  return process.env[key]?.trim() || null;
}

// The Family plan (up to 4 people) — monthly or annual, like Plus.
export function getFamilyPriceId(interval: PlusInterval): string | null {
  const key =
    interval === "monthly"
      ? "STRIPE_FAMILY_MONTHLY_PRICE_ID"
      : "STRIPE_FAMILY_ANNUAL_PRICE_ID";
  return process.env[key]?.trim() || null;
}
