// The live price catalog, read from Stripe.
//
// Stripe is the ONLY source of truth for what a plan costs: the amounts here
// come from the same price ids checkout charges (STRIPE_*_PRICE_ID), so a
// displayed price can never drift from the amount the learner is actually
// billed. Clients render from this catalog instead of shipping their own
// hardcoded money strings.
//
// Amounts change rarely, so the catalog is cached in memory for a few minutes
// and concurrent callers share one in-flight fetch. A Stripe failure is
// surfaced to the caller (the route answers 503) rather than served as a stale
// or empty price list: no failed lookup ever becomes a displayed price.
//
// A failure IS remembered for a short cooldown, though. The route is public, so
// without it every unauthenticated request arriving during a Stripe outage
// would start its own Stripe lookup (in-flight sharing only coalesces
// overlapping calls, not sequential ones) and turn an outage into unbounded
// third-party call amplification. The cooldown is far shorter than the success
// TTL, so recovery is still prompt.

import { getUncachableStripeClient } from "./stripeClient";
import { getPlusPriceId, getFamilyPriceId } from "./stripePricing";
import type { PlusInterval } from "./stripePricing";

export type PricedTier = "plus" | "family";

export type PriceAmount = {
  // Minor units exactly as Stripe holds them (1299 = $12.99). The client owns
  // currency formatting.
  amountCents: number;
  // ISO currency code, lowercase, as Stripe returns it (e.g. "usd").
  currency: string;
};

export type PricingCatalog = Record<
  PricedTier,
  Partial<Record<PlusInterval, PriceAmount>>
>;

// How long a successful catalog is reused before Stripe is asked again.
export const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

// How long a failed lookup is replayed as a failure before Stripe is retried.
export const PRICING_FAILURE_COOLDOWN_MS = 30 * 1000;

// Retrieves one Stripe price. Injectable so tests can exercise the shaping and
// caching without a network call.
export type PriceFetcher = (
  priceId: string,
) => Promise<{ unit_amount: number | null; currency: string }>;

const stripePriceFetcher: PriceFetcher = async (priceId) => {
  const stripe = await getUncachableStripeClient();
  const price = await stripe.prices.retrieve(priceId);
  return { unit_amount: price.unit_amount, currency: price.currency };
};

const TIER_PRICE_IDS: Record<
  PricedTier,
  (interval: PlusInterval) => string | null
> = {
  plus: getPlusPriceId,
  family: getFamilyPriceId,
};

const INTERVALS: PlusInterval[] = ["monthly", "annual"];

// Builds the catalog from whatever price ids are configured. An unconfigured
// id is simply absent from the result (clients degrade to a price-free
// surface); a configured id that Stripe cannot price is an error, because
// showing nothing where a real charge exists is a money bug worth surfacing.
export async function buildPricingCatalog(
  fetchPrice: PriceFetcher,
): Promise<PricingCatalog> {
  const catalog: PricingCatalog = { plus: {}, family: {} };

  for (const tier of Object.keys(TIER_PRICE_IDS) as PricedTier[]) {
    for (const interval of INTERVALS) {
      const priceId = TIER_PRICE_IDS[tier](interval);
      if (!priceId) continue;
      const price = await fetchPrice(priceId);
      if (price.unit_amount === null) {
        throw new Error(
          `Stripe price ${priceId} (${tier}/${interval}) has no unit_amount`,
        );
      }
      catalog[tier][interval] = {
        amountCents: price.unit_amount,
        currency: price.currency,
      };
    }
  }

  const priced = INTERVALS.some(
    (interval) => catalog.plus[interval] || catalog.family[interval],
  );
  if (!priced) {
    throw new Error("No Stripe price ids are configured");
  }
  return catalog;
}

type CacheEntry = { at: number; catalog: PricingCatalog };
type FailureEntry = { at: number; error: Error };

let cached: CacheEntry | null = null;
let lastFailure: FailureEntry | null = null;
let inFlight: Promise<PricingCatalog> | null = null;

export type GetPricingCatalogOptions = {
  // Injected clock and fetcher, test-only.
  now?: number;
  fetchPrice?: PriceFetcher;
};

// The cached read used by the route.
export async function getPricingCatalog(
  options: GetPricingCatalogOptions = {},
): Promise<PricingCatalog> {
  const now = options.now ?? Date.now();
  if (cached && now - cached.at < PRICING_CACHE_TTL_MS) {
    return cached.catalog;
  }
  if (inFlight) return inFlight;
  if (lastFailure && now - lastFailure.at < PRICING_FAILURE_COOLDOWN_MS) {
    throw lastFailure.error;
  }

  const fetchPrice = options.fetchPrice ?? stripePriceFetcher;
  inFlight = buildPricingCatalog(fetchPrice)
    .then((catalog) => {
      cached = { at: now, catalog };
      lastFailure = null;
      return catalog;
    })
    .catch((err: unknown) => {
      lastFailure = {
        at: now,
        error: err instanceof Error ? err : new Error(String(err)),
      };
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function __resetPricingCatalogCacheForTests(): void {
  cached = null;
  lastFailure = null;
  inFlight = null;
}
