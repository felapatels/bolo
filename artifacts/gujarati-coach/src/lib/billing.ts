import type { QueryClient } from "@tanstack/react-query";

// Web checkout / subscription management.
//
// All-Access (Plus) checkout is real Stripe: `beginAllAccessCheckout` and
// `cancelPlus` create a Stripe session server-side and then hand the browser off
// to Stripe's hosted pages via a full-page redirect — so they never resolve on
// success (the tab navigates away). Stripe returns the learner to
// /upgrade?checkout=success|cancel; the upgrade page picks that up and calls
// `refreshAfterBilling` to re-pull entitlements so the app unlocks.
//
// The middle "One Language" tier is NOT sold through Stripe on web (it stays
// RevenueCat/mobile-only). Its web flow drives the server's non-production
// dev-override so the tier is still exercisable end to end (locked -> upgrade ->
// unlocked -> lapse -> re-locked). In production that endpoint 404s, so
// `beginOneLanguageCheckout` surfaces a clear "not available" error.

// The billing interval. For All-Access it selects the monthly vs annual Stripe
// price; for the dev-override One-Language path it's presentational.
export type PlusInterval = "monthly" | "annual";

// The paid tier a learner is buying: the middle "One Language" tier or top
// "All-Access" (Plus) tier.
export type PaidTier = "one_language" | "plus";

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

type DevPlan = "free" | "one_language" | "plus" | "trial";

// Non-production only: flip the caller's tier via the server dev-override so the
// One-Language web flow is testable without a real provider. 404s in production.
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
    let message =
      res.status === 404
        ? "This plan isn't available to purchase on the web yet."
        : `Couldn't start this plan (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the message above.
    }
    throw new Error(message);
  }
}

// Start the middle "One Language" tier for the language the learner picked at
// checkout (locked in for the life of the subscription on the server). Free
// Hindi plus the chosen language unlock, with no daily lesson cap. Not real on
// web yet — dev-override only.
export async function beginOneLanguageCheckout(
  chosenLanguage: string,
  _interval: PlusInterval,
  queryClient: QueryClient,
): Promise<void> {
  await devSetPlan("one_language", chosenLanguage);
  await refreshAfterBilling(queryClient);
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

// Start the Family plan ($19.99/mo, up to 4 people) via Stripe. For a learner
// with no existing Stripe subscription this redirects to Stripe Checkout (does
// not return). For an existing Plus subscriber the server upgrades the SAME
// subscription in place (prorated, never a second subscription) and this
// resolves with "upgraded".
export async function beginFamilyCheckout(
  queryClient?: QueryClient,
): Promise<"redirected" | "upgraded"> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: "family", basePath: BASE_PATH }),
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

// Open Stripe's hosted billing portal to manage/cancel the subscription.
// Redirects the browser — does not return on success.
export async function cancelPlus(): Promise<void> {
  const url = await postForRedirectUrl("/api/stripe/portal", {});
  window.location.href = url;
}
