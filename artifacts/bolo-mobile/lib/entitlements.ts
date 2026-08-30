import { ApiError, type UpgradeRequired } from '@workspace/api-client-react';

// Mirrors the web app's `asUpgradeRequired` (gujarati-coach/src/lib/entitlements.ts):
// a structural guard for the shared HTTP 402 "upgrade_required" body every server
// gate returns, so screens can turn a denied request into a paywall route instead
// of a dead-end note or a generic retry screen.
export function asUpgradeRequired(err: unknown): UpgradeRequired | null {
  if (err instanceof ApiError && err.status === 402) {
    const data = err.data;
    if (
      data &&
      typeof data === 'object' &&
      (data as { upgradeRequired?: unknown }).upgradeRequired
    ) {
      return data as UpgradeRequired;
    }
  }
  return null;
}

// Derives the paywall deep link from a server 402 body, mirroring the web's
// upgradeHrefForDenial. A locked language whose cheapest unlock is the
// One-Language tier pre-picks that language on the paywall (?lang=<code>);
// everything else opens the paywall on its default (All-Access) emphasis.
// The denial reason is always forwarded so the paywall can surface contextual
// messaging (e.g. a trial banner when the learner hit the daily lesson cap).
export function paywallHrefForDenial(
  upgrade: UpgradeRequired,
  lang?: string | null,
): {
  pathname: '/(app)/paywall';
  params?: { lang?: string; reason?: string };
} {
  const params: { lang?: string; reason?: string } = {};
  if (
    upgrade.reason === 'language_locked' &&
    upgrade.requiredPlan === 'one_language' &&
    lang
  ) {
    params.lang = lang;
  }
  if (upgrade.reason) params.reason = upgrade.reason;
  return Object.keys(params).length > 0
    ? { pathname: '/(app)/paywall', params }
    : { pathname: '/(app)/paywall' };
}

/**
 * FAMILY IS WITHDRAWN FROM SALE, mobile's copy of the web flag (build 25,
 * 2026-08-30). Web turned the sale off on 2026-08-24
 * (gujarati-coach/src/lib/pricing.ts, FAMILY_PLAN_ENABLED) because neither
 * store sells or honours the tier; mobile never got the flag, so the
 * Subscription screen kept offering "All-Access for up to 4 people" to every
 * Free account, and the owner saw it on the iPad. Same rule as web: it hides
 * the SALE, not the plan. An account already in a family (owner or member)
 * keeps its row, its seats and its invites, and joining by code still works
 * for the people invited to one. Flip both flags together.
 */
export const FAMILY_PLAN_ENABLED = false;
