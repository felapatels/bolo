import type { Entitlements } from "@workspace/api-client-react";
import type { PricingCatalog } from "@/lib/pricing";

// Shared entitlement snapshots mirroring what GET /api/entitlements returns for
// each plan. The whole locked-vs-unlocked UI is driven off these shapes, so the
// tests assert against the same server contract the app consumes.

export const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  status: "free",
  trialEndsAt: null,
  currentPeriodEnd: null,
  allowedLanguages: ["gu"],
  features: {
    allLanguages: false,
    unlimitedLessons: false,
    review: false,
    advancedAnalytics: false,
    extendedLibrary: false,
  },
  limits: {
    dailyNewLessons: { limit: 3, used: 1, remaining: 2 },
  },
} as Entitlements;

export const PLUS_ENTITLEMENTS: Entitlements = {
  plan: "plus",
  status: "active",
  trialEndsAt: null,
  currentPeriodEnd: "2099-01-01T00:00:00.000Z",
  allowedLanguages: ["gu", "hi"],
  features: {
    allLanguages: true,
    unlimitedLessons: true,
    review: true,
    advancedAnalytics: true,
    extendedLibrary: true,
  },
  limits: {
    dailyNewLessons: { limit: null, used: 0, remaining: null },
  },
} as Entitlements;

// A trial is fully unlocked, only distinguished by status. It must open the
// same surfaces as an active subscription.
export const TRIALING_ENTITLEMENTS: Entitlements = {
  ...PLUS_ENTITLEMENTS,
  status: "trialing",
  trialEndsAt: "2099-01-01T00:00:00.000Z",
  currentPeriodEnd: null,
} as Entitlements;

// The live Stripe price ladder as GET /api/pricing reports it (minor units,
// exactly as Stripe holds them). Seeded into the shared pricing cache by
// setup.ts so every component test renders real, deterministic amounts without
// a network call. Update this when the Stripe prices themselves change.
export const PRICING_CATALOG: PricingCatalog = {
  plus: {
    monthly: { amountCents: 1299, currency: "usd" },
    annual: { amountCents: 8999, currency: "usd" },
  },
  family: {
    monthly: { amountCents: 2499, currency: "usd" },
    annual: { amountCents: 17499, currency: "usd" },
  },
};

// The shared HTTP 402 body every server gate returns, wrapped to look like the
// ApiError the client throws (status + parsed data).
export function upgradeRequiredError(
  reason: "language_locked" | "daily_lesson_limit" | "feature_locked",
  message: string,
) {
  return {
    status: 402,
    data: {
      error: "upgrade_required",
      upgradeRequired: true,
      reason,
      message,
      feature: reason === "language_locked" ? "allLanguages" : null,
      // Mirrors the server: a locked language or the daily cap are both cheapest
      // to lift with the One Language tier; only Plus-only features need All-Access.
      requiredPlan: reason === "feature_locked" ? "plus" : "one_language",
    },
  };
}
