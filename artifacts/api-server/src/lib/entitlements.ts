// Plan & entitlement configuration — the single source of truth for what the
// Free tier vs Bolo! Plus can access. This module is pure (no database, no
// Express) so it can be unit-tested in isolation and imported anywhere. The
// live, per-user daily-lesson counts are layered on by the DB-touching
// lessonLimits helpers; everything here is deterministic given its inputs.

export type Plan = "free" | "one_language" | "plus";

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "expired"
  | "canceled"
  // A subscription paused for a bounded window: access is suspended (resolves to
  // Free) while the pause is open, but it is NOT expired — it resumes to its
  // underlying tier once the pause window closes.
  | "paused";

// ---------------------------------------------------------------------------
// Tier policy (see task brief) — change these to change the policy everywhere.
// ---------------------------------------------------------------------------

// Free is limited to a single language: Hindi.
export const FREE_LANGUAGE = "hi";

// AI generation cost is bounded per topic (see phraseCeilings.ts), not per day:
// there is no daily new-lesson meter on any tier.

// Free's weekly ceiling on Bolo Parrot conversational chat audio, in seconds
// (2 minutes). One Language and Plus are unlimited. Chat language access
// still follows the existing plan-based language allowlist below.
export const FREE_WEEKLY_CHAT_SECONDS_CAP = 120;

// The feature flags a plan unlocks. These are the flags every gate reads.
export interface PlanFeatures {
  // Access to every language (Free is capped to FREE_LANGUAGE).
  allLanguages: boolean;
  // No daily ceiling on new lesson generation.
  unlimitedLessons: boolean;
  // Review / weakest-phrase practice sessions.
  review: boolean;
  // Advanced progress analytics.
  advancedAnalytics: boolean;
  // The deep, pre-seeded "premium" phrase library beyond each topic's free
  // starter set. Only Plus unlocks the extra phrases; everyone else sees the
  // starter phrases (plus any they generated themselves).
  extendedLibrary: boolean;
  // The "sentence stage": every topic's final step of full, natural sentences
  // a learner graduates to after the phrase list. Plus-only.
  sentences: boolean;
  // No weekly ceiling on Bolo Parrot conversational chat audio time. Free is
  // capped (FREE_WEEKLY_CHAT_SECONDS_CAP); One Language and Plus are unlimited.
  unlimitedChatTime: boolean;
  // The Script Trace character-writing mini-game. Plus-only.
  scriptTrace: boolean;
  // Phrase Builder mini-game (arrange word tiles into correct phrases). Plus-only.
  phraseBuilder: boolean;
  // Speed Round mini-game (race against the clock). Plus-only.
  speedRound: boolean;
}

// The subscription-shaped fields we persist on the user row, in the shape the
// resolver needs. Kept structural so callers can pass a raw user row.
export interface SubscriptionState {
  tier: string;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  // The One Language tier's single chosen language (null for Free/Plus).
  chosenLanguage: string | null;
  // When a paused subscription resumes. Only consulted while
  // `subscriptionStatus` is "paused". Optional so callers that predate the
  // pause feature (and never pause) can omit it.
  pauseUntil?: Date | null;
}

// The effective plan the server acts on, after applying trial/expiry rules.
export interface ResolvedPlan {
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  // Only set (non-null) when `plan` is "one_language" — the language the
  // subscriber unlocked on top of free Hindi.
  chosenLanguage: string | null;
  // Set (non-null) only while the subscription is actively paused — the instant
  // the (suspended) subscription resumes. Null in every other state.
  pauseUntil: Date | null;
}

// Resolves the user's *effective* plan from their stored subscription fields.
// Rules, in order:
//   - An active trial (status "trialing" and trialEndsAt still in the future)
//     always counts as Plus — the 7-day trial applies to all-access only.
//   - A "plus" tier counts as Plus unless its paid period has lapsed
//     (currentPeriodEnd in the past), in which case it reads as expired/Free.
//   - A "one_language" tier counts as One Language (carrying its chosen
//     language) unless its paid period has lapsed, in which case it reads as
//     expired/Free.
//   - Otherwise Free — a trial that has since lapsed surfaces as "expired".
export function resolvePlan(
  state: SubscriptionState,
  now: Date = new Date(),
): ResolvedPlan {
  const t = now.getTime();
  const rawStatus = (state.subscriptionStatus ?? "none") as SubscriptionStatus;

  // Paused subscriptions come first. While the pause window is open the
  // subscription is suspended — the learner gets no paid access (resolves to
  // Free) but is NOT expired, so it will resume. Without this branch a paused
  // "plus" row within its paid period would fall through and wrongly grant full
  // Plus access. Once the window has elapsed we drop the paused status and
  // resolve the underlying tier as if active (the subscription has resumed).
  if (rawStatus === "paused") {
    const pauseActive =
      state.pauseUntil != null && state.pauseUntil.getTime() > t;
    if (pauseActive) {
      return {
        plan: "free",
        status: "paused",
        trialEndsAt: null,
        currentPeriodEnd: state.currentPeriodEnd,
        chosenLanguage: null,
        pauseUntil: state.pauseUntil ?? null,
      };
    }
  }

  // Everywhere below, a lapsed pause reads as a resumed (active) subscription.
  const status: SubscriptionStatus =
    rawStatus === "paused" ? "active" : rawStatus;
  const trialActive =
    status === "trialing" &&
    state.trialEndsAt != null &&
    state.trialEndsAt.getTime() > t;

  if (trialActive) {
    return {
      plan: "plus",
      status: "trialing",
      trialEndsAt: state.trialEndsAt,
      currentPeriodEnd: state.currentPeriodEnd,
      chosenLanguage: null,
      pauseUntil: null,
    };
  }

  const periodLapsed =
    state.currentPeriodEnd != null && state.currentPeriodEnd.getTime() <= t;

  // The Family tier is the owner's side of the $19.99/mo family plan. For
  // entitlement purposes the owner is simply a Plus subscriber (the plan
  // resolves to "plus" so every existing gate and client keeps working);
  // family-ness — seats, invites, the join code — is surfaced separately via
  // the /family endpoints. Members are resolved through the owner's row by
  // the family cascade in loadEntitlements, not here.
  if (state.tier === "plus" || state.tier === "family") {
    if (!periodLapsed) {
      return {
        plan: "plus",
        status: status === "none" ? "active" : status,
        trialEndsAt: state.trialEndsAt,
        currentPeriodEnd: state.currentPeriodEnd,
        chosenLanguage: null,
        pauseUntil: null,
      };
    }
    return {
      plan: "free",
      status: "expired",
      trialEndsAt: state.trialEndsAt,
      currentPeriodEnd: state.currentPeriodEnd,
      chosenLanguage: null,
      pauseUntil: null,
    };
  }

  if (state.tier === "one_language") {
    if (!periodLapsed) {
      return {
        plan: "one_language",
        status: status === "none" ? "active" : status,
        trialEndsAt: state.trialEndsAt,
        currentPeriodEnd: state.currentPeriodEnd,
        chosenLanguage: state.chosenLanguage,
        pauseUntil: null,
      };
    }
    return {
      plan: "free",
      status: "expired",
      trialEndsAt: state.trialEndsAt,
      currentPeriodEnd: state.currentPeriodEnd,
      chosenLanguage: null,
      pauseUntil: null,
    };
  }

  return {
    plan: "free",
    status: status === "trialing" ? "expired" : status,
    trialEndsAt: state.trialEndsAt,
    currentPeriodEnd: state.currentPeriodEnd,
    chosenLanguage: null,
    pauseUntil: null,
  };
}

export function featuresForPlan(plan: Plan): PlanFeatures {
  if (plan === "plus") {
    return {
      allLanguages: true,
      unlimitedLessons: true,
      review: true,
      advancedAnalytics: true,
      extendedLibrary: true,
      sentences: true,
      unlimitedChatTime: true,
      scriptTrace: true,
      phraseBuilder: true,
      speedRound: true,
    };
  }
  if (plan === "one_language") {
    // The middle tier lifts the daily-lesson cap and the weekly chat-time cap;
    // review, advanced analytics, the extended library, and exclusive badges
    // stay all-access-only.
    return {
      allLanguages: false,
      unlimitedLessons: true,
      review: false,
      advancedAnalytics: false,
      extendedLibrary: false,
      sentences: false,
      unlimitedChatTime: true,
      scriptTrace: false,
      phraseBuilder: false,
      speedRound: false,
    };
  }
  return {
    allLanguages: false,
    unlimitedLessons: false,
    review: false,
    advancedAnalytics: false,
    extendedLibrary: false,
    sentences: false,
    unlimitedChatTime: false,
    scriptTrace: false,
    phraseBuilder: false,
    speedRound: false,
  };
}

// The languages a plan may access. `null` means "every language"; Free is
// restricted to the single free language; One Language may access free Hindi
// plus the single language chosen at purchase.
export function allowedLanguagesForPlan(
  plan: Plan,
  chosenLanguage: string | null = null,
): string[] | null {
  if (plan === "plus") return null;
  if (plan === "one_language") {
    return chosenLanguage && chosenLanguage !== FREE_LANGUAGE
      ? [FREE_LANGUAGE, chosenLanguage]
      : [FREE_LANGUAGE];
  }
  return [FREE_LANGUAGE];
}

// The weekly Bolo Parrot chat-time ceiling for a plan, in seconds. `null`
// means unlimited (both paid tiers). Only Free is capped.
export function weeklyChatSecondsLimit(plan: Plan): number | null {
  return plan === "free" ? FREE_WEEKLY_CHAT_SECONDS_CAP : null;
}

export function isLanguageAllowed(
  plan: Plan,
  lang: string,
  chosenLanguage: string | null = null,
): boolean {
  const allowed = allowedLanguagesForPlan(plan, chosenLanguage);
  return allowed === null || allowed.includes(lang);
}

// ---------------------------------------------------------------------------
// The structured "upgrade required" response returned for denied Free actions.
// A single shape across every gate so clients handle the paywall uniformly.
// ---------------------------------------------------------------------------

export type UpgradeReason =
  | "language_locked"
  // Retired: no tier has a daily new-lesson meter, so the server never sends
  // this. Kept in the vocabulary because both clients still use the same string
  // as a paywall deep-link param to lead with the free-trial CTA.
  | "daily_lesson_limit"
  | "feature_locked"
  | "chat_time_limit"
  // The topic already holds as many phrases as this plan allows. Only
  // All-Access lifts it (One Language shares Free's ceiling), and the top tier
  // never receives this; it gets a plain 409 topic_full instead.
  | "phrase_ceiling"
  // M1 teaser: the caller used up their 3 free teaser phrases in this locked
  // language. Distinguishable from a plain lock so clients can render "you
  // tried it — here is what you unlock" instead of a generic paywall.
  | "teaser_exhausted";

export interface UpgradeRequiredPayload {
  error: "upgrade_required";
  upgradeRequired: true;
  reason: UpgradeReason;
  message: string;
  // The PlanFeatures key involved, when applicable (e.g. "allLanguages").
  feature: string | null;
  requiredPlan: Plan;
  // M1 teaser progress for locked-language denials (both teaser-available and
  // exhausted states), so clients can show remaining teaser phrases. Optional
  // and additive: absent on non-language gates and for older payload readers.
  teaser?: { consumed: number; limit: number };
}

export function upgradeRequired(
  reason: UpgradeReason,
  message: string,
  feature: string | null = null,
  // The cheapest plan that unlocks the denied action. Language locks and the
  // daily-lesson cap can be lifted by the middle tier; the all-access-only
  // features (review, analytics, exclusive badges) require Plus.
  requiredPlan: Plan = "plus",
): UpgradeRequiredPayload {
  return {
    error: "upgrade_required",
    upgradeRequired: true,
    reason,
    message,
    feature,
    requiredPlan,
  };
}

// Thrown from deep in the generation path (a beforeGenerate hook) to abort a
// gated action; route handlers catch it and emit the 402 payload.
export class UpgradeRequiredError extends Error {
  constructor(public readonly payload: UpgradeRequiredPayload) {
    super(payload.message);
    this.name = "UpgradeRequiredError";
  }
}

// ---------------------------------------------------------------------------
// The entitlements snapshot returned by GET /entitlements. Assembled from the
// resolved plan plus the live daily-lesson usage and the full language list.
// ---------------------------------------------------------------------------

export interface DailyLessonAllowance {
  // null = unlimited (Plus).
  limit: number | null;
  used: number;
  // null = unlimited (Plus).
  remaining: number | null;
}

export interface WeeklyChatAllowance {
  // null = unlimited (One Language and Plus).
  limit: number | null;
  used: number;
  // null = unlimited (One Language and Plus).
  remaining: number | null;
}

export interface Entitlements {
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  // When an actively-paused subscription resumes, or null when not paused.
  pauseUntil: string | null;
  // The One Language tier's chosen language, or null for Free/Plus.
  chosenLanguage: string | null;
  // The concrete list of language codes the caller may access.
  allowedLanguages: string[];
  features: PlanFeatures;
  limits: {
    dailyNewLessons: DailyLessonAllowance;
    // The Bolo Parrot conversational chat time allowance. Chat language
    // access is not surfaced separately here — it follows `allowedLanguages`
    // above, the same plan-based allowlist used everywhere else.
    weeklyChatSeconds: WeeklyChatAllowance;
  };
}

export function buildEntitlements(
  resolved: ResolvedPlan,
  usedToday: number,
  allLanguageCodes: string[],
  usedChatSecondsThisWeek: number = 0,
): Entitlements {
  const { plan, chosenLanguage } = resolved;
  // No tier has a daily new-lesson ceiling: AI cost is bounded per topic by the
  // phrase ceiling and per user by the manual-append burst bound. The wire
  // field stays (installed builds read it) and always reports unlimited.
  const limit: number | null = null;
  const remaining: number | null = null;
  const chatLimit = weeklyChatSecondsLimit(plan);
  const chatRemaining =
    chatLimit === null
      ? null
      : Math.max(0, chatLimit - usedChatSecondsThisWeek);
  const allowed = allowedLanguagesForPlan(plan, chosenLanguage);
  return {
    plan,
    status: resolved.status,
    trialEndsAt: resolved.trialEndsAt
      ? resolved.trialEndsAt.toISOString()
      : null,
    currentPeriodEnd: resolved.currentPeriodEnd
      ? resolved.currentPeriodEnd.toISOString()
      : null,
    pauseUntil: resolved.pauseUntil ? resolved.pauseUntil.toISOString() : null,
    // Only surfaced for the middle tier; irrelevant (null) for Free/Plus.
    chosenLanguage: plan === "one_language" ? chosenLanguage : null,
    // For Plus (allowed === null) return every seeded language so clients never
    // hardcode the list.
    allowedLanguages: allowed === null ? allLanguageCodes : allowed,
    features: featuresForPlan(plan),
    limits: {
      dailyNewLessons: { limit, used: usedToday, remaining },
      weeklyChatSeconds: {
        limit: chatLimit,
        used: usedChatSecondsThisWeek,
        remaining: chatRemaining,
      },
    },
  };
}
