import { useUser } from "@clerk/react";
import {
  useGetEntitlements,
  getGetEntitlementsQueryKey,
  type Entitlements,
  type PlanFeatures,
  type DailyLessonAllowance,
  type UpgradeRequired,
} from "@workspace/api-client-react";

// The client never decides tiers on its own — everything here is derived from
// the server's GET /entitlements snapshot. Components read this hook to know the
// current plan, which features are unlocked, and how much daily allowance is
// left, so the "locked-but-visible" UI stays in lockstep with the server.

const LOCKED_FEATURES: PlanFeatures = {
  allLanguages: false,
  unlimitedLessons: false,
  review: false,
  advancedAnalytics: false,
};

const UNKNOWN_ALLOWANCE: DailyLessonAllowance = {
  limit: null,
  used: 0,
  remaining: null,
};

export type EntitlementsView = {
  /** Snapshot is still loading (only ever true for a signed-in caller). */
  isLoading: boolean;
  isSignedIn: boolean;
  entitlements: Entitlements | undefined;
  plan: "free" | "plus";
  /** True for both an active subscription and an active trial. */
  isPlus: boolean;
  status: string;
  isTrialing: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  allowedLanguages: string[];
  features: PlanFeatures;
  dailyNewLessons: DailyLessonAllowance;
  /** Whether the caller's plan may open a given language code. */
  isLanguageAllowed: (code: string) => boolean;
};

export function useEntitlements(): EntitlementsView {
  const { isSignedIn } = useUser();
  const { data, isLoading } = useGetEntitlements({
    // Only signed-in callers have entitlements; skip the request (which 401s)
    // on public routes like the marketing landing page.
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetEntitlementsQueryKey(),
    },
  });

  return {
    isLoading: !!isSignedIn && isLoading,
    isSignedIn: !!isSignedIn,
    entitlements: data,
    plan: (data?.plan as "free" | "plus") ?? "free",
    isPlus: data?.plan === "plus",
    status: data?.status ?? "none",
    isTrialing: data?.status === "trialing",
    trialEndsAt: data?.trialEndsAt ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
    allowedLanguages: data?.allowedLanguages ?? [],
    features: data?.features ?? LOCKED_FEATURES,
    dailyNewLessons: data?.limits?.dailyNewLessons ?? UNKNOWN_ALLOWANCE,
    // Until the snapshot loads we optimistically allow, so the default language
    // never flashes a lock; once loaded the real allow-list applies.
    isLanguageAllowed: (code: string) =>
      !data || data.allowedLanguages.includes(code),
  };
}

// Structural guard for the shared HTTP 402 "upgrade_required" body that every
// server gate returns. Lets pages turn a denied request into an upgrade prompt
// instead of a generic error.
export function asUpgradeRequired(err: unknown): UpgradeRequired | null {
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status?: unknown }).status === 402
  ) {
    const data = (err as { data?: unknown }).data;
    if (
      data &&
      typeof data === "object" &&
      (data as { upgradeRequired?: unknown }).upgradeRequired
    ) {
      return data as UpgradeRequired;
    }
  }
  return null;
}
