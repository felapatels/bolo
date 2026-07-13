import type { QueryClient } from "@tanstack/react-query";

// Web checkout / subscription management.
//
// The production Stripe/RevenueCat web checkout endpoint is owned by the
// separate payments task and isn't wired here. Until it lands, the upgrade flow
// drives the server's dev-override endpoint (non-production only) so the full
// locked -> upgrade -> unlocked -> lapse -> re-locked experience is testable end
// to end. When the real checkout ships, only `beginCheckout` needs to change to
// redirect to the provider's hosted checkout; everything else (the unlock via
// entitlements refetch) stays the same.

export type PlusInterval = "monthly" | "annual";

async function devSetPlan(plan: "free" | "plus" | "trial"): Promise<void> {
  const res = await fetch("/api/entitlements/dev-override", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
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

// Start a Plus subscription. `withTrial` begins the 7-day free trial (Plus
// access that reverts unless converted); otherwise it activates Plus directly.
export async function beginCheckout(
  _interval: PlusInterval,
  withTrial: boolean,
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
