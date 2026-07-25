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
  extendedLibrary: false,
  unlimitedChatTime: false,
  phraseBuilder: false,
  speedRound: false,
};

const UNKNOWN_ALLOWANCE: DailyLessonAllowance = {
  limit: null,
  used: 0,
  remaining: null,
};

// The three tiers the client can be on. Kept in lockstep with the server's
// entitlements.Plan; the client only ever reads which one the snapshot reports.
export type Plan = "free" | "one_language" | "plus";

export type EntitlementsView = {
  /** Snapshot is still loading (only ever true for a signed-in caller). */
  isLoading: boolean;
  isSignedIn: boolean;
  entitlements: Entitlements | undefined;
  /** The effective plan the server resolved. */
  plan: Plan;
  /** Any paid tier (One Language or All-Access), including an active trial. */
  isPaid: boolean;
  /** The middle tier: free Hindi + one chosen language, unlimited lessons. */
  isOneLanguage: boolean;
  /** All-Access: every language plus review/analytics/badges. */
  isAllAccess: boolean;
  /**
   * Back-compat alias for the all-access tier. Kept because several surfaces
   * that gate on "the top tier" (exclusive badges, etc.) read `isPlus`.
   */
  isPlus: boolean;
  status: string;
  isTrialing: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  /** The One Language subscriber's chosen language, or null for Free/All-Access. */
  chosenLanguage: string | null;
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

  const plan = (data?.plan as Plan) ?? "free";
  const isAllAccess = plan === "plus";
  const isOneLanguage = plan === "one_language";

  return {
    isLoading: !!isSignedIn && isLoading,
    isSignedIn: !!isSignedIn,
    entitlements: data,
    plan,
    isPaid: isAllAccess || isOneLanguage,
    isOneLanguage,
    isAllAccess,
    isPlus: isAllAccess,
    status: data?.status ?? "none",
    isTrialing: data?.status === "trialing",
    trialEndsAt: data?.trialEndsAt ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
    chosenLanguage: data?.chosenLanguage ?? null,
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

// Builds a deep link into the paywall that preselects the cheapest unlocking
// plan (and, for a locked language, pre-picks that language). Locked surfaces
// pass their context here so the paywall opens on the right card instead of
// always defaulting to All-Access. See upgrade.tsx for how it's read back.
export function upgradeHref(opts?: {
  plan?: "one_language" | "plus";
  lang?: string | null;
  reason?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts?.plan) params.set("plan", opts.plan);
  // A specific language only makes sense to pre-pick on the One Language tier.
  if (opts?.plan === "one_language" && opts.lang) params.set("lang", opts.lang);
  // Forward the denial reason so the paywall can surface contextual messaging
  // (e.g. a trial banner when the learner hit the daily lesson cap).
  if (opts?.reason) params.set("reason", opts.reason);
  const qs = params.toString();
  return qs ? `/upgrade?${qs}` : "/upgrade";
}

// Derives the paywall deep link from a server 402 body. The server already
// reports the cheapest unlocking tier in `requiredPlan`; a locked language also
// tells us which language to pre-pick (passed in from the active language).
export function upgradeHrefForDenial(
  upgrade: UpgradeRequired,
  lang?: string | null,
): string {
  const plan = upgrade.requiredPlan === "one_language" ? "one_language" : "plus";
  return upgradeHref({
    plan,
    lang: upgrade.reason === "language_locked" ? lang : null,
    reason: upgrade.reason ?? null,
  });
}
