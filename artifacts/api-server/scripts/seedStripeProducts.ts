// ---------------------------------------------------------------------------
// Creates the Bolo! Plus product + monthly/annual prices in Stripe (idempotent
// — safe to re-run). Prints the price ids to set as STRIPE_PLUS_MONTHLY_PRICE_ID
// / STRIPE_PLUS_ANNUAL_PRICE_ID so /stripe/checkout can look them up.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run seed-stripe-products
// ---------------------------------------------------------------------------
import { getUncachableStripeClient } from "../src/lib/stripeClient";
import { CHAI_PACKS } from "../src/lib/chaiPacks";

const PRODUCT_NAME = "Bolo! Plus";
// All-Access (Plus) pricing — matches the store (mobile) pricing ladder. These
// constants only seed a NEW Stripe account: the live amounts are whatever the
// configured price ids hold, and clients render those via GET /pricing. If the
// prices are changed in Stripe, update these too so a re-run cannot create a
// second, stale price. The middle One-Language tier is RevenueCat/mobile-only
// and not sold through Stripe.
const MONTHLY_CENTS = 1299; // $12.99/mo
const ANNUAL_CENTS = 8999; // $89.99/yr

// Family plan: one subscription covering up to 4 people (owner + 3 seats).
const FAMILY_PRODUCT_NAME = "Bolo! Family";
const FAMILY_MONTHLY_CENTS = 2499; // $24.99/mo
const FAMILY_ANNUAL_CENTS = 17499; // $174.99/yr

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

// One-time Chai packs (web only; iOS sells consumables through StoreKit
// later). Amounts and prices come from the catalog so this script cannot drift
// from what the credit path grants.
async function findOrCreateOneTimePrice(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  productId: string,
  unitAmount: number,
): Promise<string> {
  const existing = await stripe.prices.list({ product: productId, active: true });
  const match = existing.data.find(
    (p) =>
      p.unit_amount === unitAmount && p.currency === "usd" && !p.recurring,
  );
  if (match) return match.id;

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
  });
  return price.id;
}

async function seedChaiPacks(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
): Promise<string[]> {
  const envLines: string[] = [];
  for (const pack of CHAI_PACKS) {
    const found = await stripe.products.search({
      query: `name:'${pack.productName}' AND active:'true'`,
    });
    const product =
      found.data[0] ??
      (await stripe.products.create({
        name: pack.productName,
        description: pack.description,
        metadata: { chai: String(pack.chai), packId: pack.id },
      }));
    const priceId = await findOrCreateOneTimePrice(
      stripe,
      product.id,
      pack.cents,
    );
    console.log(
      `Chai pack ${pack.id}: ${pack.chai} Chai for $${(pack.cents / 100).toFixed(2)} (${priceId})`,
    );
    envLines.push(
      `  STRIPE_CHAI_PACK_${pack.id.toUpperCase()}_PRICE_ID=${priceId}`,
    );
  }
  return envLines;
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
  // Family plan product + monthly price.
  const existingFamily = await stripe.products.search({
    query: `name:'${FAMILY_PRODUCT_NAME}' AND active:'true'`,
  });
  const familyProduct =
    existingFamily.data[0] ??
    (await stripe.products.create({
      name: FAMILY_PRODUCT_NAME,
      description:
        "Full Plus access for up to 4 people — all 22 official Indian languages, unlimited lessons, review, and analytics for the whole family.",
    }));
  console.log(`Product: ${familyProduct.name} (${familyProduct.id})`);
  const familyMonthlyPriceId = await findOrCreatePrice(
    stripe,
    familyProduct.id,
    FAMILY_MONTHLY_CENTS,
    "month",
  );
  const familyAnnualPriceId = await findOrCreatePrice(
    stripe,
    familyProduct.id,
    FAMILY_ANNUAL_CENTS,
    "year",
  );
  console.log(
    `Family monthly price: ${(FAMILY_MONTHLY_CENTS / 100).toFixed(2)}/mo (${familyMonthlyPriceId})`,
  );
  console.log(
    `Family annual price: ${(FAMILY_ANNUAL_CENTS / 100).toFixed(2)}/yr (${familyAnnualPriceId})`,
  );

  const packEnvLines = await seedChaiPacks(stripe);

  console.log("\nSet these env vars for checkout to use them:");
  console.log(`  STRIPE_PLUS_MONTHLY_PRICE_ID=${monthlyPriceId}`);
  console.log(`  STRIPE_PLUS_ANNUAL_PRICE_ID=${annualPriceId}`);
  console.log(`  STRIPE_FAMILY_MONTHLY_PRICE_ID=${familyMonthlyPriceId}`);
  console.log(`  STRIPE_FAMILY_ANNUAL_PRICE_ID=${familyAnnualPriceId}`);
  for (const line of packEnvLines) console.log(line);
}

main().catch((err) => {
  console.error("Failed to seed Stripe products:", err);
  process.exit(1);
});
