// Pure translation layer between RevenueCat's billing events / subscriber state
// and the subscription columns the entitlement backbone reads
// (`tier`, `subscriptionStatus`, `trialEndsAt`, `currentPeriodEnd`). Kept free of
// Express and the database so it can be unit-tested in isolation and reused by
// both the webhook (push) and the reconcile-on-read path (pull).
//
// The server — never the client — decides who is Plus: these mappers are the
// single place that turns "what RevenueCat says about billing" into "what plan
// the user gets".

import type { SubscriptionStatus } from "./entitlements";

// The RevenueCat entitlement identifier that maps to Bolo! Plus. Configurable so
// it can match whatever the RevenueCat project uses; defaults to "plus".
export const PLUS_ENTITLEMENT_ID =
  process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "plus";

// The concrete subscription columns we write for a user, plus the user id the
// change applies to. `subscriptionProviderId` records RevenueCat's stable
// original app-user id for bookkeeping.
export interface RevenueCatApply {
  userId: string;
  tier: "free" | "plus";
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  subscriptionProviderId: string | null;
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

// The subset of a RevenueCat webhook event we consume. RevenueCat sends many
// fields; we only read these. See https://www.revenuecat.com/docs/webhooks.
export interface RevenueCatEvent {
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  period_type?: string | null; // "TRIAL" | "NORMAL" | "INTRO" | "PROMOTIONAL"
  // Present only on TRANSFER events (no app_user_id in that case).
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

export interface RevenueCatWebhookBody {
  event?: RevenueCatEvent;
  api_version?: string;
}

// Event types that never change entitlement state — safely acknowledged as
// no-ops so RevenueCat doesn't retry them.
const IGNORED_EVENT_TYPES = new Set([
  "TEST",
  "SUBSCRIBER_ALIAS",
  "INVOICE_ISSUANCE",
  "VIRTUAL_CURRENCY_TRANSACTION",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

// True when the event pertains to our Plus entitlement. If the event carries no
// entitlement info at all we assume it applies (this is a single-entitlement
// app), but if it lists entitlements and ours isn't among them we ignore it.
function concernsPlus(event: RevenueCatEvent): boolean {
  if (Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0) {
    return event.entitlement_ids.includes(PLUS_ENTITLEMENT_ID);
  }
  if (typeof event.entitlement_id === "string" && event.entitlement_id) {
    return event.entitlement_id === PLUS_ENTITLEMENT_ID;
  }
  return true;
}

function msToDate(ms: number | null | undefined): Date | null {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms) : null;
}

// Translates a single-subscriber webhook event into the subscription columns to
// write, or returns null to ignore it (unrelated entitlement, non-state event,
// or missing user id). TRANSFER events span two users and are handled by
// `applesFromTransfer` instead.
export function applyFromEvent(
  event: RevenueCatEvent,
  now: Date = new Date(),
): RevenueCatApply | null {
  const type = event.type ?? "";
  if (IGNORED_EVENT_TYPES.has(type)) return null;
  if (type === "TRANSFER") return null; // handled separately
  if (!concernsPlus(event)) return null;

  const userId = event.app_user_id ?? null;
  if (!userId) return null;

  const providerId = event.original_app_user_id ?? event.app_user_id ?? null;
  const expiresAt = msToDate(event.expiration_at_ms);
  const lapsed = expiresAt != null && expiresAt.getTime() <= now.getTime();

  // Access ends: an explicit expiration, or any event whose period has already
  // elapsed (covers refunds that back-date the expiration).
  if (type === "EXPIRATION" || lapsed) {
    return {
      userId,
      tier: "free",
      subscriptionStatus: "expired",
      trialEndsAt: null,
      currentPeriodEnd: expiresAt,
      subscriptionProviderId: providerId,
    };
  }

  const isTrial = (event.period_type ?? "").toUpperCase() === "TRIAL";
  // CANCELLATION only turns off auto-renew — access continues until the period
  // (or trial) ends, so we keep tier "plus" and let the date drive expiry.
  const status: SubscriptionStatus = isTrial
    ? "trialing"
    : type === "CANCELLATION"
      ? "canceled"
      : "active";

  return {
    userId,
    tier: "plus",
    subscriptionStatus: status,
    trialEndsAt: isTrial ? expiresAt : null,
    currentPeriodEnd: expiresAt,
    subscriptionProviderId: providerId,
  };
}

// A TRANSFER moves a subscription between app-user ids (e.g. a device restore
// onto a different account). The `transferred_from` ids lose access; the
// `transferred_to` ids should be reconciled against live state (the event alone
// doesn't carry their resulting entitlement), so we only emit the downgrades
// here and leave the upgrade to reconcile-on-read.
export function downgradesFromTransfer(
  event: RevenueCatEvent,
): RevenueCatApply[] {
  if (event.type !== "TRANSFER") return [];
  const from = Array.isArray(event.transferred_from)
    ? event.transferred_from
    : [];
  return from
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => ({
      userId: id,
      tier: "free" as const,
      subscriptionStatus: "expired" as const,
      trialEndsAt: null,
      currentPeriodEnd: null,
      subscriptionProviderId: id,
    }));
}

// The user ids that gained a subscription via a TRANSFER and should be pulled
// fresh from RevenueCat (their entitlement isn't in the event payload).
export function transferRecipients(event: RevenueCatEvent): string[] {
  if (event.type !== "TRANSFER") return [];
  const to = Array.isArray(event.transferred_to) ? event.transferred_to : [];
  return to.filter((id): id is string => typeof id === "string" && id.length > 0);
}

// ---------------------------------------------------------------------------
// Subscriber snapshots (reconcile-on-read / pull)
// ---------------------------------------------------------------------------

// The subset of the RevenueCat v1 subscriber object we read. See
// https://www.revenuecat.com/docs/api-v1#tag/customers.
export interface RevenueCatSubscriber {
  original_app_user_id?: string | null;
  entitlements?: Record<
    string,
    { expires_date?: string | null; product_identifier?: string | null }
  > | null;
  subscriptions?: Record<
    string,
    {
      expires_date?: string | null;
      period_type?: string | null; // "normal" | "trial" | "intro"
      unsubscribe_detected_at?: string | null;
    }
  > | null;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Translates a live RevenueCat subscriber snapshot (keyed by the caller's user
// id) into the subscription columns to write. Used by reconcile-on-read to heal
// state when a webhook was missed. `null` entitlements/subscriber means the user
// has no Plus access (Free).
export function applyFromSubscriber(
  userId: string,
  subscriber: RevenueCatSubscriber | null,
  now: Date = new Date(),
): RevenueCatApply {
  const providerId = subscriber?.original_app_user_id ?? userId;
  const ent = subscriber?.entitlements?.[PLUS_ENTITLEMENT_ID];

  // No Plus entitlement on record → Free.
  if (!ent) {
    return {
      userId,
      tier: "free",
      subscriptionStatus: "none",
      trialEndsAt: null,
      currentPeriodEnd: null,
      subscriptionProviderId: providerId,
    };
  }

  const expiresAt = parseDate(ent.expires_date);
  // A null expiry means a lifetime/non-expiring grant → always active.
  const active = expiresAt == null || expiresAt.getTime() > now.getTime();
  if (!active) {
    return {
      userId,
      tier: "free",
      subscriptionStatus: "expired",
      trialEndsAt: null,
      currentPeriodEnd: expiresAt,
      subscriptionProviderId: providerId,
    };
  }

  const sub = ent.product_identifier
    ? subscriber?.subscriptions?.[ent.product_identifier]
    : undefined;
  const isTrial = (sub?.period_type ?? "").toLowerCase() === "trial";
  const canceled = sub?.unsubscribe_detected_at != null;
  const status: SubscriptionStatus = isTrial
    ? "trialing"
    : canceled
      ? "canceled"
      : "active";

  return {
    userId,
    tier: "plus",
    subscriptionStatus: status,
    trialEndsAt: isTrial ? expiresAt : null,
    currentPeriodEnd: expiresAt,
    subscriptionProviderId: providerId,
  };
}
