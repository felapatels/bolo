import type { QueryClient } from "@tanstack/react-query";

// Web checkout / subscription management.
//
// The production Stripe/RevenueCat web checkout endpoint is owned by the
// separate payments task and isn't wired here. Until it lands, the upgrade flow
// drives the server's dev-override endpoint (non-production only) so the full
// locked -> upgrade -> unlocked -> lapse -> re-locked experience is testable end
// to end across all three tiers. When the real checkout ships, only the
// `begin*Checkout` helpers need to change to redirect to the provider's hosted
// checkout; everything else (the unlock via entitlements refetch) stays the same.

// The billing interval is presentational for now — the dev-override records only
// the tier, so monthly vs annual doesn't change the resulting entitlements. The
// real provider checkout will use it to pick the right price.
export type PlusInterval = "monthly" | "annual";

// The paid tier a learner is buying: the middle "One Language" tier or top
// "All-Access" (Plus) tier.
export type PaidTier = "one_language" | "plus";

type DevPlan = "free" | "one_language" | "plus" | "trial";

async function devSetPlan(
  plan: DevPlan,
  chosenLanguage?: string,
): Promise<void> {
  const res = await fetch("/api/entitlements/dev-override", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      plan === "one_language" ? { plan, chosenLanguage } : { plan },
    ),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Checkout isn't available in this environment yet."
        : `Checkout failed (${res.status}).`,
    );
  }
}

// After any billing change, re-pull every server-derived query so the app
// unlocks (or re-locks) immediately without a manual refresh. Entitlements are
// refetched first so plan-dependent UI (language guard, feature gates) settles.
async function refreshAfterBilling(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries();
}

// Start the middle "One Language" tier for the language the learner picked at
// checkout (locked in for the life of the subscription on the server). Free
// Hindi plus the chosen language unlock, with no daily lesson cap.
export async function beginOneLanguageCheckout(
  chosenLanguage: string,
  _interval: PlusInterval,
  queryClient: QueryClient,
): Promise<void> {
  await devSetPlan("one_language", chosenLanguage);
  await refreshAfterBilling(queryClient);
}

// Start the top "All-Access" tier. `withTrial` begins the 7-day free trial
// (all-access that reverts unless converted); otherwise it activates Plus
// directly — used when a One Language subscriber upgrades and shouldn't get a
// fresh trial.
export async function beginAllAccessCheckout(
  withTrial: boolean,
  _interval: PlusInterval,
  queryClient: QueryClient,
): Promise<void> {
  await devSetPlan(withTrial ? "trial" : "plus");
  await refreshAfterBilling(queryClient);
}

// Cancel / lapse the subscription — returns the caller to Free so re-locking can
// be verified. The real billing portal replaces this once payments are wired.
export async function cancelPlus(queryClient: QueryClient): Promise<void> {
  await devSetPlan("free");
  await refreshAfterBilling(queryClient);
}
