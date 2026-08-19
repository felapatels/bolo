// Assembles the subscription-management snapshot the account UI reads: the
// current tier/status, the relevant dates, the chosen language (middle tier), a
// best-effort payment-method summary, and billing/invoice history. The server, not the client, is authoritative for tier/status, so those come from the
// resolved plan; the softer fields (payment method, invoice history) are pulled
// from RevenueCat where available and degrade gracefully to null/empty when the
// provider isn't configured or doesn't expose them.

import type { User } from "@workspace/db";
import type { ResolvedPlan } from "./entitlements";
import { resolvePlanWithFamily } from "./familyAccess";
import { fetchSubscriber } from "./revenuecatClient";
import type { RevenueCatSubscriber } from "./revenuecatSync";

export interface PaymentMethodSummary {
  // The store/processor the subscription is billed through, when known.
  store: string | null;
  // A link where the customer can manage/cancel with the store, when exposed.
  managementUrl: string | null;
}

export interface BillingHistoryEntry {
  productId: string;
  store: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  periodType: string | null;
  // "active" | "expired" | "canceled", derived from the stored dates/flags.
  status: string;
}

export interface SubscriptionDetails {
  tier: ResolvedPlan["plan"];
  status: ResolvedPlan["status"];
  chosenLanguage: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  pauseUntil: string | null;
  // True when the subscription is set to end at the period boundary (canceled
  // but still within its paid period).
  cancelAtPeriodEnd: boolean;
  retentionOfferAcceptedAt: string | null;
  provider: string | null;
  paymentMethod: PaymentMethodSummary | null;
  billingHistory: BillingHistoryEntry[];
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// Turns a RevenueCat subscriber's `subscriptions` map into billing-history
// entries, newest first. Each subscription period becomes one entry.
function historyFromSubscriber(
  subscriber: RevenueCatSubscriber,
  now: Date,
): BillingHistoryEntry[] {
  const subs = subscriber.subscriptions ?? {};
  const entries: BillingHistoryEntry[] = Object.entries(subs).map(
    ([productId, sub]) => {
      const expires = sub.expires_date ? new Date(sub.expires_date) : null;
      const expired =
        expires != null &&
        !Number.isNaN(expires.getTime()) &&
        expires.getTime() <= now.getTime();
      const canceled = sub.unsubscribe_detected_at != null;
      const status = expired ? "expired" : canceled ? "canceled" : "active";
      return {
        productId,
        store: sub.store ?? null,
        purchasedAt: sub.purchase_date ?? sub.original_purchase_date ?? null,
        expiresAt: sub.expires_date ?? null,
        periodType: sub.period_type ?? null,
        status,
      };
    },
  );
  // Newest purchase first; entries with no purchase date sink to the bottom.
  entries.sort((a, b) => {
    const ta = a.purchasedAt ? Date.parse(a.purchasedAt) : 0;
    const tb = b.purchasedAt ? Date.parse(b.purchasedAt) : 0;
    return tb - ta;
  });
  return entries;
}

// Derives the payment-method summary from a subscriber snapshot: the store of
// the most-recently-purchased subscription plus the management link. Returns
// null when nothing is known.
function paymentMethodFromSubscriber(
  subscriber: RevenueCatSubscriber,
  history: BillingHistoryEntry[],
): PaymentMethodSummary | null {
  const store = history.find((h) => h.store)?.store ?? null;
  const managementUrl = subscriber.management_url ?? null;
  if (!store && !managementUrl) return null;
  return { store, managementUrl };
}

// Builds the full subscription-details snapshot for a user. Reads tier/status
// from the resolved plan (authoritative) and, when RevenueCat is configured and
// reachable, enriches with payment method + billing history. A missing/failed
// provider pull simply omits those softer fields, the core plan state still
// comes back.
export async function buildSubscriptionDetails(
  user: User,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  // Family-aware: a seat member's snapshot reads Plus through the owner's
  // subscription (their own row stays free), so the account UI never
  // ping-pongs between "you're paid" (entitlements) and "you're free" (here).
  const resolved = await resolvePlanWithFamily(user, now);

  // A "canceled" subscription still inside its paid period ends at the boundary.
  const cancelAtPeriodEnd =
    user.subscriptionStatus === "canceled" && resolved.plan !== "free";

  let provider: string | null = user.subscriptionProvider ?? null;
  let paymentMethod: PaymentMethodSummary | null = null;
  let billingHistory: BillingHistoryEntry[] = [];

  // Best-effort enrichment: fetchSubscriber returns null when RevenueCat isn't
  // configured/reachable, in which case we degrade gracefully.
  const subscriber = await fetchSubscriber(user.id);
  if (subscriber) {
    provider = provider ?? "revenuecat";
    billingHistory = historyFromSubscriber(subscriber, now);
    paymentMethod = paymentMethodFromSubscriber(subscriber, billingHistory);
  }

  return {
    tier: resolved.plan,
    status: resolved.status,
    chosenLanguage: resolved.chosenLanguage,
    trialEndsAt: iso(resolved.trialEndsAt),
    currentPeriodEnd: iso(resolved.currentPeriodEnd),
    pauseUntil: iso(resolved.pauseUntil),
    cancelAtPeriodEnd,
    retentionOfferAcceptedAt: iso(user.retentionOfferAcceptedAt),
    provider,
    paymentMethod,
    billingHistory,
  };
}
