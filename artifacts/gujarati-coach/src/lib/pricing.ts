// The canonical CLIENT-SIDE pricing surface, shared by the public pricing
// preview (landing page), the authenticated paywall (upgrade.tsx) and the
// account surfaces that quote a plan price.
//
// Prices are NOT written down here. They are read from GET /api/pricing, which
// reports the amounts held by the Stripe price ids checkout actually charges,
// so a displayed price can never drift from the real charge. This module only
// owns presentation: currency formatting, the per-interval copy, and the
// annual savings badge. When the catalog is unavailable, callers render a
// price-free surface rather than an invented number.

import { useEffect, useMemo, useState } from 'react';
import type { PlusInterval } from '@/lib/billing';

// The tiers sold on web: All-Access ("plus") and the Family plan.
export type SelectableTier = 'plus' | 'family';

// The Family plan covers the owner plus 3 invites. Mirrors the seat model in
// lib/db familyPlans (owner occupies the implicit 4th seat).
export const FAMILY_SEATS = 4;

/**
 * Whether the Family plan is OFFERED FOR SALE on web.
 *
 * OFF, 2026-08-24, and this is a platform-parity problem rather than a
 * product one. The Family plan is a Stripe subscription sold on the web, and
 * iOS and Android have no equivalent: nothing in either store's purchase flow
 * sells it and nothing there honours it. So a learner could buy on web what
 * their phone will not recognise, which is the worst shape a paywall can take.
 *
 * IT HIDES THE SALE, NOT THE PLAN. Anyone who already bought Family keeps it:
 * entitlements resolve it server-side exactly as before, `/family` still manages
 * seats and invites, and joining a family still works for the people invited to
 * one. This flag only stops NEW purchases being offered.
 *
 * Flip it back the day the mobile stores sell the same thing.
 */
export const FAMILY_PLAN_ENABLED = false;

// One price as the server reports it: Stripe minor units plus currency.
export type PriceAmount = { amountCents: number; currency: string };

// The one-time Chai packs sold on web.
export type ChaiPackId = 'small' | 'medium' | 'large';

// A pack as the server reports it: the live Stripe amount plus how much Chai
// the ledger credits for it. Both come from the server so the shop cannot
// quote a price or a Chai count the purchase does not honour.
export type PackPrice = PriceAmount & { chai: number };

// GET /api/pricing. An interval is absent when no Stripe price is configured
// for it.
export type PricingCatalog = Record<
  SelectableTier,
  Partial<Record<PlusInterval, PriceAmount>>
> & {
  // Older responses predate packs; treat a missing map as "no packs priced".
  packs?: Partial<Record<ChaiPackId, PackPrice>>;
};

// One tier/interval ready to render.
export type TierPrice = {
  price: string;
  per: string;
  // Card copy under the price.
  note: string;
  // Billing cadence as a clause, for sentences that already say "cancel".
  cadence: string;
  badge?: string;
  /**
   * What an annual price works out to per month, already formatted, e.g.
   * "$7.49". Set on ANNUAL only; undefined on monthly, where the headline
   * price is already the monthly number and repeating it reads as a discount
   * that is not there.
   *
   * A structured field rather than a sentence, because every card wants to
   * place it differently and the alternative was each of them parsing it back
   * out of `note`. Requested 2026-08-24: the annual card showed $89.99/yr with
   * no indication that it is cheaper per month than the monthly plan, which is
   * the entire argument for buying it.
   */
  monthlyEquivalent?: string;
};

export type TierPricing = Record<
  SelectableTier,
  Partial<Record<PlusInterval, TierPrice>>
>;

export function formatMoney({ amountCents, currency }: PriceAmount): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

/**
 * What an annual plan works out to per month, for the "just $x/mo" line.
 *
 * FLOORED TO THE CENT, NOT ROUNDED, and that is a correctness rule rather than
 * a style one. $89.99 a year is $7.4991 a month; rounding gives $7.50, and
 * twelve times $7.50 is $90.00, which is MORE than the amount actually
 * charged. An advertised monthly rate that does not multiply back to the price
 * on the same card is a claim the checkout does not honour.
 *
 * Flooring guarantees twelve times the shown figure is never above the annual
 * price. Corrected 2026-08-24, having shipped as $7.50.
 */
function monthlyEquivalent(annual: PriceAmount): string {
  return formatMoney({
    amountCents: Math.floor(annual.amountCents / 12),
    currency: annual.currency,
  });
}

// How much annual saves against paying monthly all year, e.g. "Save 42%".
// Only shown when both amounts are known and annual is genuinely cheaper.
function savingsBadge(
  monthly: PriceAmount | undefined,
  annual: PriceAmount,
): string | undefined {
  if (!monthly || monthly.amountCents <= 0) return undefined;
  const yearlyAtMonthlyRate = monthly.amountCents * 12;
  if (annual.amountCents >= yearlyAtMonthlyRate) return undefined;
  const percent = Math.round(
    (1 - annual.amountCents / yearlyAtMonthlyRate) * 100,
  );
  return percent > 0 ? `Save ${percent}%` : undefined;
}

// Turns the server catalog into rendered copy. Intervals missing from the
// catalog stay missing.
export function buildTierPricing(catalog: PricingCatalog): TierPricing {
  const pricing: TierPricing = { plus: {}, family: {} };

  for (const tier of ['plus', 'family'] as SelectableTier[]) {
    const monthly = catalog[tier]?.monthly;
    const annual = catalog[tier]?.annual;

    if (monthly) {
      pricing[tier].monthly = {
        price: formatMoney(monthly),
        per: '/mo',
        note:
          tier === 'family'
            ? `One bill covers up to ${FAMILY_SEATS} people. Billed monthly. Cancel anytime.`
            : 'Billed monthly. Cancel anytime.',
        cadence: 'billed monthly',
      };
    }

    if (annual) {
      pricing[tier].annual = {
        price: formatMoney(annual),
        per: '/yr',
        note:
          tier === 'family'
            ? `Just ${monthlyEquivalent(annual)}/mo for up to ${FAMILY_SEATS} people, billed yearly.`
            : `Just ${monthlyEquivalent(annual)}/mo, billed yearly.`,
        cadence: 'billed yearly',
        badge: savingsBadge(monthly, annual),
        monthlyEquivalent: monthlyEquivalent(annual),
      };
    }
  }

  return pricing;
}

// Module-scope cache: prices change rarely, so every surface in a session
// shares one fetch. It EXPIRES, though: a long-lived tab must not keep quoting
// an amount Stripe has since changed, so past the TTL the next surface to
// mount refetches and shows a placeholder meanwhile rather than a possibly
// stale price.
export const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; catalog: PricingCatalog };

let cached: CacheEntry | null = null;
let inFlight: Promise<PricingCatalog> | null = null;

function freshCatalog(): PricingCatalog | null {
  if (!cached) return null;
  if (Date.now() - cached.at >= PRICING_CACHE_TTL_MS) {
    cached = null;
    return null;
  }
  return cached.catalog;
}

async function fetchCatalog(): Promise<PricingCatalog> {
  const res = await fetch('/api/pricing', { credentials: 'include' });
  if (!res.ok) throw new Error(`Pricing unavailable (${res.status}).`);
  return (await res.json()) as PricingCatalog;
}

// One pack ready to render: the Chai count, the formatted price, and the id
// checkout is started with. Ordered smallest first, and only packs the server
// could price are present.
export type PackOffer = {
  id: ChaiPackId;
  chai: number;
  price: string;
};

const PACK_ORDER: ChaiPackId[] = ['small', 'medium', 'large'];

export function buildPackOffers(catalog: PricingCatalog): PackOffer[] {
  const packs = catalog.packs ?? {};
  return PACK_ORDER.flatMap((id) => {
    const pack = packs[id];
    if (!pack) return [];
    return [{ id, chai: pack.chai, price: formatMoney(pack) }];
  });
}

export type UsePricingResult = {
  pricing: TierPricing | null;
  // Empty until the catalog loads, and empty when no pack is priced — the
  // shop renders nothing rather than an invented amount.
  packs: PackOffer[];
  isLoading: boolean;
  isError: boolean;
};

export function usePricing(): UsePricingResult {
  const [catalog, setCatalog] = useState<PricingCatalog | null>(freshCatalog);
  const [isLoading, setIsLoading] = useState(freshCatalog() === null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const fresh = freshCatalog();
    if (fresh) {
      setCatalog(fresh);
      setIsLoading(false);
      return;
    }
    // Past the TTL the expired amount is dropped, not re-displayed while the
    // refetch runs: a placeholder is honest, a stale price is not.
    setCatalog(null);
    setIsLoading(true);
    let active = true;
    if (!inFlight) {
      inFlight = fetchCatalog()
        .then((loaded) => {
          cached = { at: Date.now(), catalog: loaded };
          return loaded;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    inFlight
      .then((loaded) => {
        if (!active) return;
        setCatalog(loaded);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsError(true);
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pricing = useMemo(
    () => (catalog ? buildTierPricing(catalog) : null),
    [catalog],
  );

  const packs = useMemo(
    () => (catalog ? buildPackOffers(catalog) : []),
    [catalog],
  );

  return { pricing, packs, isLoading, isError };
}

// Test seam: primes (or clears) the shared catalog so component tests render
// deterministic prices without a network call.
export function __seedPricingForTests(catalog: PricingCatalog | null): void {
  cached = catalog ? { at: Date.now(), catalog } : null;
  inFlight = null;
}
