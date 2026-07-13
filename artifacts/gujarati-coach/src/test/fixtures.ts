import type { Entitlements } from "@workspace/api-client-react";

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
      requiredPlan: reason === "language_locked" ? "one_language" : "plus",
    },
  };
}
