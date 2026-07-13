// ---------------------------------------------------------------------------
// Creates the Bolo! Plus product + monthly/annual prices in Stripe (idempotent
// — safe to re-run). Prints the price ids to set as STRIPE_PLUS_MONTHLY_PRICE_ID
// / STRIPE_PLUS_ANNUAL_PRICE_ID so /stripe/checkout can look them up.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run seed-stripe-products
// ---------------------------------------------------------------------------
import { getUncachableStripeClient } from "../src/lib/stripeClient";

const PRODUCT_NAME = "Bolo! Plus";
// All-Access (Plus) pricing. Keep in sync with the `plus` prices shown in
// artifacts/gujarati-coach/src/pages/upgrade.tsx (TIER_PRICING). The middle
// One-Language tier is RevenueCat/mobile-only and not sold through Stripe.
const MONTHLY_CENTS = 999; // $9.99/mo
const ANNUAL_CENTS = 7199; // $71.99/yr

async function findOrCreatePrice(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  productId: string,
  unitAmount: number,
  interval: "month" | "year",
): Promise<string> {
  const existing = await stripe.prices.list({ product: productId, active: true });
  const match = existing.data.find(
    (p) =>
      p.unit_amount === unitAmount &&
      p.currency === "usd" &&
      p.recurring?.interval === interval,
  );
  if (match) return match.id;

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
    recurring: { interval },
  });
  return price.id;
}

async function main(): Promise<void> {
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({
    query: `name:'${PRODUCT_NAME}' AND active:'true'`,
  });
  const product =
    existingProducts.data[0] ??
    (await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "All 22 official Indian languages, unlimited daily lessons, review, and advanced progress analytics.",
    }));

  console.log(`Product: ${product.name} (${product.id})`);

  const monthlyPriceId = await findOrCreatePrice(
    stripe,
    product.id,
    MONTHLY_CENTS,
    "month",
  );
  const annualPriceId = await findOrCreatePrice(
    stripe,
    product.id,
    ANNUAL_CENTS,
    "year",
  );

  console.log(`Monthly price: $${(MONTHLY_CENTS / 100).toFixed(2)}/mo (${monthlyPriceId})`);
  console.log(`Annual price: $${(ANNUAL_CENTS / 100).toFixed(2)}/yr (${annualPriceId})`);
  console.log("\nSet these env vars for checkout to use them:");
  console.log(`  STRIPE_PLUS_MONTHLY_PRICE_ID=${monthlyPriceId}`);
  console.log(`  STRIPE_PLUS_ANNUAL_PRICE_ID=${annualPriceId}`);
}

main().catch((err) => {
  console.error("Failed to seed Stripe products:", err);
  process.exit(1);
});
