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

// A refused "Add more phrases" tap that no upgrade would fix: the topic is at
// its ceiling on the top tier (409 topic_full), an append for this topic is
// already running (409 append_in_progress), or the learner has used their
// hourly appends (429 append_rate_limited). Read the machine-readable `reason`
// Never branch on the message text, which is copy and will change.
export type AppendRefusal = {
  error: string;
  reason: string;
  retryAfterSeconds?: number;
};

export function asAppendRefusal(err: unknown): AppendRefusal | null {
  if (!err || typeof err !== "object") return null;
  const status = (err as { status?: unknown }).status;
  if (status !== 409 && status !== 429) return null;
  const data = (err as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const reason = (data as { reason?: unknown }).reason;
  if (typeof reason !== "string") return null;
  return data as AppendRefusal;
}

// Builds a deep link into the paywall that preselects a plan card. Web sells
// All-Access ("plus") and Family — the One Language tier stays mobile-only, so
// every locked surface points at All-Access. See upgrade.tsx for how the
// params are read back.
export function upgradeHref(opts?: {
  plan?: "plus" | "family";
  reason?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts?.plan) params.set("plan", opts.plan);
  // Forward the denial reason so the paywall can surface contextual messaging
  // (e.g. a trial banner when the learner hit the daily lesson cap).
  if (opts?.reason) params.set("reason", opts.reason);
  const qs = params.toString();
  return qs ? `/upgrade?${qs}` : "/upgrade";
}

// Derives the paywall deep link from a server 402 body. The server may report
// `requiredPlan: "one_language"` (the cheapest unlocking tier ON MOBILE), but
// web doesn't sell that tier — every denial lands on the All-Access card.
export function upgradeHrefForDenial(
  upgrade: UpgradeRequired,
  _lang?: string | null,
): string {
  return upgradeHref({
    plan: "plus",
    reason: upgrade.reason ?? null,
  });
}
