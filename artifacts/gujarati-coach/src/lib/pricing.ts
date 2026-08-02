// The canonical CLIENT-SIDE pricing display config, shared by the public
// pricing preview (landing page) and the authenticated paywall (upgrade.tsx)
// so the two can never drift apart. These display strings mirror the store
// pricing ladder; the REAL charge comes from the Stripe price ids the server
// holds (STRIPE_*_PRICE_ID env vars), keep both in sync, and keep
// scripts/seedStripeProducts.ts in sync too.

import type { PlusInterval } from '@/lib/billing';

// The tiers sold on web: All-Access ("plus") and the Family plan.
export type SelectableTier = 'plus' | 'family';

// The Family plan covers the owner plus 3 invites. Mirrors the seat model in
// lib/db familyPlans (owner occupies the implicit 4th seat).
export const FAMILY_SEATS = 4;

export const TIER_PRICING: Record<
  SelectableTier,
  Record<PlusInterval, { price: string; per: string; note: string; badge?: string }>
> = {
  plus: {
    monthly: {
      price: '$12.99',
      per: '/mo',
      note: 'Billed monthly. Cancel anytime.',
    },
    annual: {
      price: '$89.99',
      per: '/yr',
      note: 'Just $7.50/mo, billed yearly.',
      badge: 'Save 42%',
    },
  },
  family: {
    monthly: {
      price: '$19.99',
      per: '/mo',
      note: `One bill covers up to ${FAMILY_SEATS} people. Billed monthly. Cancel anytime.`,
    },
    annual: {
      price: '$139.99',
      per: '/yr',
      note: `Just $11.67/mo for up to ${FAMILY_SEATS} people, billed yearly.`,
      badge: 'Save 42%',
    },
  },
};
