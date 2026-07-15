// Pure translation layer between Stripe's subscription objects and the
// subscription columns the entitlement backbone reads (`tier`,
// `subscriptionStatus`, `trialEndsAt`, `currentPeriodEnd`). Kept free of
// Express and the database so it can be unit-tested in isolation, mirroring
// the RevenueCat translation layer in revenuecatSync.ts.
//
// Stripe web checkout only sells all-access Bolo! Plus (see upgrade.tsx) — the
// middle One-Language tier remains RevenueCat/mobile-only — so every apply here
// targets `tier: "plus"`.
//
// The subscription is tagged with `metadata.userId` at checkout time
// (subscription_data.metadata in routes/stripe.ts), so every subscription
// event carries the Clerk user id directly with no extra Stripe API call.

import type Stripe from "stripe";
import type { SubscriptionStatus } from "./entitlements";

export interface StripeApply {
  userId: string;
  tier: "free" | "plus" | "family";
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  subscriptionProviderId: string | null;
}

function secondsToDate(seconds: unknown): Date | null {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : null;
}

// `current_period_end` moved from the subscription root onto its first item in
// newer Stripe API versions; read both locations for forward/backward safety.
function currentPeriodEnd(sub: Stripe.Subscription): Date | null {
  const itemLevel = (
    sub.items?.data?.[0] as unknown as { current_period_end?: number }
  )?.current_period_end;
  const rootLevel = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  return secondsToDate(itemLevel ?? rootLevel);
}

// Translates a `customer.subscription.created` / `.updated` event's
// subscription object into the columns to write, or null when the event isn't
// attributable to a user (no metadata) or isn't yet an actionable state
// ("incomplete" — the first payment hasn't succeeded yet — or "paused").
// Which paid tier a subscription represents. Checkout (and the in-place
// Plus→Family upgrade) stamp `metadata.plan: "family"` on family
// subscriptions; anything else is regular all-access Plus.
function paidTier(sub: Stripe.Subscription): "plus" | "family" {
  return sub.metadata?.plan === "family" ? "family" : "plus";
}

export function applyFromStripeSubscription(
  sub: Stripe.Subscription,
): StripeApply | null {
  const userId = sub.metadata?.userId;
  if (!userId) return null;

  const trialEndsAt = secondsToDate(sub.trial_end);
  const periodEnd = currentPeriodEnd(sub);

  switch (sub.status) {
    case "trialing":
      return {
        userId,
        tier: paidTier(sub),
        subscriptionStatus: "trialing",
        trialEndsAt,
        currentPeriodEnd: periodEnd,
        subscriptionProviderId: sub.id,
      };
    case "active":
    case "past_due":
    case "unpaid":
      // Access continues until the paid period genuinely ends — resolvePlan
      // downgrades automatically once currentPeriodEnd lapses, so a
      // cancel-at-period-end or a payment retry window still reads as Plus
      // until then.
      return {
        userId,
        tier: paidTier(sub),
        subscriptionStatus: sub.cancel_at_period_end ? "canceled" : "active",
        trialEndsAt: null,
        currentPeriodEnd: periodEnd,
        subscriptionProviderId: sub.id,
      };
    case "canceled":
    case "incomplete_expired":
      return {
        userId,
        tier: "free",
        subscriptionStatus: "expired",
        trialEndsAt: null,
        currentPeriodEnd: periodEnd,
        subscriptionProviderId: sub.id,
      };
    case "incomplete":
    case "paused":
    default:
      return null;
  }
}

// Translates a `customer.subscription.deleted` event — the subscription's
// paid access has definitively ended (as opposed to `cancel_at_period_end`,
// which is a plain "updated" event that keeps access until the period ends).
export function applyFromStripeDeletion(
  sub: Stripe.Subscription,
): StripeApply | null {
  const userId = sub.metadata?.userId;
  if (!userId) return null;
  return {
    userId,
    tier: "free",
    subscriptionStatus: "canceled",
    trialEndsAt: null,
    currentPeriodEnd: null,
    subscriptionProviderId: sub.id,
  };
}
