import type { QueryClient } from "@tanstack/react-query";

// Web checkout / subscription management.
//
// All checkout on web is real Stripe: `beginAllAccessCheckout`,
// `beginFamilyCheckout`, and `cancelPlus` create a Stripe session server-side
// and then hand the browser off to Stripe's hosted pages via a full-page
// redirect — so they never resolve on success (the tab navigates away). Stripe
// returns the learner to /upgrade?checkout=success|cancel; the upgrade page
// picks that up and calls `refreshAfterBilling` to re-pull entitlements so the
// app unlocks.
//
// The "One Language" tier is NOT sold on web (it stays RevenueCat/mobile-only);
// web sells All-Access and Family.

// The billing interval — selects the monthly vs annual Stripe price.
export type PlusInterval = "monthly" | "annual";

// The artifact base path (e.g. "/gujarati-coach/") so Stripe's return URLs land
// back inside the app, not at the domain root. BASE_URL always has a trailing
// slash.
const BASE_PATH = import.meta.env.BASE_URL;

// POST to a Stripe session endpoint and return the hosted-page URL to redirect
// to. Sends the artifact base path so the server can build same-origin return
// URLs that keep the app's path prefix.
async function postForRedirectUrl(
  path: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, basePath: BASE_PATH }),
  });
  if (!res.ok) {
    let message = `Checkout failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Checkout is temporarily unavailable.");
  }
  return data.url;
}

// After returning from Stripe, re-pull every server-derived query so the app
// unlocks (or re-locks) immediately without a manual refresh.
export async function refreshAfterBilling(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries();
}

// Start the top "All-Access" (Plus) tier via real Stripe Checkout. `withTrial`
// begins the 7-day free trial (used for new subscribers); pass false when an
// existing subscriber upgrades and shouldn't get a fresh trial. Redirects the
// browser to Stripe — does not return on success.
export async function beginAllAccessCheckout(
  withTrial: boolean,
  interval: PlusInterval,
  _queryClient?: QueryClient,
): Promise<void> {
  const url = await postForRedirectUrl("/api/stripe/checkout", {
    interval,
    withTrial,
  });
  window.location.href = url;
}

// Start the Family plan (up to 4 people; monthly or annual) via Stripe. For a
// learner with no existing Stripe subscription this redirects to Stripe
// Checkout (does not return). For an existing Plus subscriber the server
// upgrades the SAME subscription in place (prorated, never a second
// subscription) and this resolves with "upgraded".
export async function beginFamilyCheckout(
  interval: PlusInterval,
  queryClient?: QueryClient,
): Promise<"redirected" | "upgraded"> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: "family", interval, basePath: BASE_PATH }),
  });
  if (!res.ok) {
    let message = `Checkout failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { url?: string; upgraded?: boolean };
  if (data.upgraded) {
    if (queryClient) await refreshAfterBilling(queryClient);
    return "upgraded";
  }
  if (!data.url) throw new Error("Checkout is temporarily unavailable.");
  window.location.href = data.url;
  return "redirected";
}

// Buy a one-time Chai pack (web only). Same hosted-Stripe hand-off as the
// subscription paths: this redirects and does not return on success. The
// client names the pack and nothing else — the price, the Chai, and the credit
// are all server-side, and Stripe's webhook is what actually credits the
// wallet, so closing the tab mid-purchase still delivers the Chai.
export async function beginChaiPackCheckout(packId: string): Promise<void> {
  const url = await postForRedirectUrl("/api/stripe/chai-checkout", { packId });
  window.location.href = url;
}

// Open Stripe's hosted billing portal to manage/cancel the subscription.
// Redirects the browser — does not return on success.
export async function cancelPlus(): Promise<void> {
  const url = await postForRedirectUrl("/api/stripe/portal", {});
  window.location.href = url;
}
