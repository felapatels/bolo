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

// The RevenueCat entitlement identifier that maps to all-access Bolo! Plus.
// Configurable so it can match whatever the RevenueCat project uses; defaults
// to "plus".
export const PLUS_ENTITLEMENT_ID =
  process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "plus";

// The RevenueCat entitlement identifier that maps to the middle One Language
// ($6.99) tier. Defaults to "one_language".
export const ONE_LANGUAGE_ENTITLEMENT_ID =
  process.env.REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID?.trim() || "one_language";

// The concrete subscription columns we write for a user, plus the user id the
// change applies to. `subscriptionProviderId` records RevenueCat's stable
// original app-user id for bookkeeping. Note: `chosenLanguage` is deliberately
// NOT written here — the billing sync preserves whatever the subscriber chose,
// which is captured separately at purchase.
export interface RevenueCatApply {
  userId: string;
  tier: "free" | "one_language" | "plus";
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

// Which of our entitlements the event pertains to, or null to ignore it.
// All-access is preferred when both are listed. If the event carries no
// entitlement info at all we assume all-access applies (backwards compatible
// with the original single-entitlement app); if it lists entitlements and
// neither of ours is among them we ignore it.
function concernedEntitlement(
  event: RevenueCatEvent,
): "plus" | "one_language" | null {
  const ids =
    Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0
      ? event.entitlement_ids
      : typeof event.entitlement_id === "string" && event.entitlement_id
        ? [event.entitlement_id]
        : null;
  if (ids === null) return "plus";
  if (ids.includes(PLUS_ENTITLEMENT_ID)) return "plus";
  if (ids.includes(ONE_LANGUAGE_ENTITLEMENT_ID)) return "one_language";
  return null;
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
  const tier = concernedEntitlement(event);
  if (tier === null) return null;

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

  // The 7-day free trial applies to all-access only, so a TRIAL period on the
  // middle tier is treated as a plain active period.
  const isTrial =
    tier === "plus" && (event.period_type ?? "").toUpperCase() === "TRIAL";
  // CANCELLATION only turns off auto-renew — access continues until the period
  // (or trial) ends, so we keep the paid tier and let the date drive expiry.
  const status: SubscriptionStatus = isTrial
    ? "trialing"
    : type === "CANCELLATION"
      ? "canceled"
      : "active";

  return {
    userId,
    tier,
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
  // A link the store surfaces for the customer to manage/cancel their
  // subscription (present for App Store / Play Store customers).
  management_url?: string | null;
  entitlements?: Record<
    string,
    { expires_date?: string | null; product_identifier?: string | null }
  > | null;
  subscriptions?: Record<
    string,
    {
      expires_date?: string | null;
      purchase_date?: string | null;
      original_purchase_date?: string | null;
      period_type?: string | null; // "normal" | "trial" | "intro"
      unsubscribe_detected_at?: string | null;
      billing_issues_detected_at?: string | null;
      // The store the subscription was bought through, e.g. "app_store",
      // "play_store", "stripe", "promotional".
      store?: string | null;
    }
  > | null;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The resolution of a single RevenueCat entitlement into the fields we care
// about, or null when the entitlement isn't on record at all.
interface EntitlementResolution {
  active: boolean;
  expiresAt: Date | null;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
}

function resolveEntitlement(
  subscriber: RevenueCatSubscriber | null,
  entitlementId: string,
  tier: "plus" | "one_language",
  now: Date,
): EntitlementResolution | null {
  const ent = subscriber?.entitlements?.[entitlementId];
  if (!ent) return null;

  const expiresAt = parseDate(ent.expires_date);
  // A null expiry means a lifetime/non-expiring grant → always active.
  const active = expiresAt == null || expiresAt.getTime() > now.getTime();
  if (!active) {
    return { active: false, expiresAt, status: "expired", trialEndsAt: null };
  }

  const sub = ent.product_identifier
    ? subscriber?.subscriptions?.[ent.product_identifier]
    : undefined;
  // Trials apply to all-access only.
  const isTrial =
    tier === "plus" && (sub?.period_type ?? "").toLowerCase() === "trial";
  const canceled = sub?.unsubscribe_detected_at != null;
  const status: SubscriptionStatus = isTrial
    ? "trialing"
    : canceled
      ? "canceled"
      : "active";

  return { active: true, expiresAt, status, trialEndsAt: isTrial ? expiresAt : null };
}

// Translates a live RevenueCat subscriber snapshot (keyed by the caller's user
// id) into the subscription columns to write. Used by reconcile-on-read to heal
// state when a webhook was missed. All-access is preferred when both paid
// entitlements are somehow active; an expired-but-present entitlement resolves
// to Free/expired; a `null`/empty subscriber means the user has no paid access
// (Free/none).
export function applyFromSubscriber(
  userId: string,
  subscriber: RevenueCatSubscriber | null,
  now: Date = new Date(),
): RevenueCatApply {
  const providerId = subscriber?.original_app_user_id ?? userId;

  const plus = resolveEntitlement(subscriber, PLUS_ENTITLEMENT_ID, "plus", now);
  const one = resolveEntitlement(
    subscriber,
    ONE_LANGUAGE_ENTITLEMENT_ID,
    "one_language",
    now,
  );

  // Prefer all-access when it's active, then the middle tier.
  if (plus?.active) {
    return {
      userId,
      tier: "plus",
      subscriptionStatus: plus.status,
      trialEndsAt: plus.trialEndsAt,
      currentPeriodEnd: plus.expiresAt,
      subscriptionProviderId: providerId,
    };
  }
  if (one?.active) {
    return {
      userId,
      tier: "one_language",
      subscriptionStatus: one.status,
      trialEndsAt: one.trialEndsAt,
      currentPeriodEnd: one.expiresAt,
      subscriptionProviderId: providerId,
    };
  }

  // Neither active. If either entitlement was present (but lapsed) → expired,
  // else the user has no record → none.
  const present = plus != null || one != null;
  return {
    userId,
    tier: "free",
    subscriptionStatus: present ? "expired" : "none",
    trialEndsAt: null,
    currentPeriodEnd: present ? (plus?.expiresAt ?? one?.expiresAt ?? null) : null,
    subscriptionProviderId: providerId,
  };
}
