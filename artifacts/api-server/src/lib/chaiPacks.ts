// Chai packs — the only way to buy Chai with money, on BOTH platforms.
//
// One catalog, two tills. Web sells the packs through Stripe Checkout; iOS
// sells the SAME packs as StoreKit consumables through RevenueCat (Apple
// requires digital goods consumed in the app to be sold through IAP, so
// pointing an iPhone at Stripe would be a 3.1.1 violation). What a pack
// CONTAINS is stated once, here, and both credit paths read it.
//
// The catalog is the single source of truth for what a pack contains and what
// it seeds in Stripe. Three rules keep it honest:
//   1. Nothing inlines a pack amount or price at a call site — the credit path
//      reads `chai` off this catalog by pack id, so a tampered client cannot
//      ask for more Chai than the pack holds.
//   2. `cents` exists to SEED Stripe (scripts/seedStripeProducts.ts) and to
//      keep the ladder written down in one place. What a learner is shown and
//      charged is the live Stripe price behind the configured price id, read
//      through the pricing catalog — never this number. On iOS the displayed
//      price comes from the StoreKit product itself, so `cents` never reaches
//      the phone at all.
//   3. `appleProductId` is the ONLY mapping between an Apple SKU and a pack.
//      The app is told which product id belongs to which pack by the server
//      (GET /chai-packs); it never carries its own copy, and the credit path
//      resolves the pack from the product id the store reported.

import { getChaiPackPriceId } from "./stripePricing";
import { grantTokensDetailed } from "./tokenService";
import type { TokenStateRow } from "./tokenService";

export type ChaiPackId = "small" | "medium" | "large";

export type ChaiPack = {
  id: ChaiPackId;
  // How much Chai the ledger credits on a paid purchase, on either platform.
  chai: number;
  // Seed amount in minor units. NOT a display price (see rule 2 above).
  cents: number;
  // Stripe product name; also how the seeder finds an existing product.
  productName: string;
  description: string;
  // The App Store consumable product id, created and priced in App Store
  // Connect by the owner. Rule 3 above: no mirrored copy anywhere else.
  appleProductId: string;
};

// Owner ruling Aug 11, 2026, amended Aug 13, 2026: the Chai each pack grants
// halves (50→25, 150→75, 400→200); the prices are unchanged. Zero pack
// purchases exist on either platform, so nothing already sold is redefined.
export const CHAI_PACKS: readonly ChaiPack[] = [
  {
    id: "small",
    chai: 25,
    cents: 199,
    productName: "Bolo! Chai — 25",
    description: "25 Chai for the Bolo! wallet.",
    appleProductId: "bolo_chai_cutting",
  },
  {
    id: "medium",
    chai: 75,
    cents: 499,
    productName: "Bolo! Chai — 75",
    description: "75 Chai for the Bolo! wallet.",
    appleProductId: "bolo_chai_kulhad",
  },
  {
    id: "large",
    chai: 200,
    cents: 999,
    productName: "Bolo! Chai — 200",
    description: "200 Chai for the Bolo! wallet.",
    appleProductId: "bolo_chai_kettle",
  },
] as const;

export function getChaiPack(id: string | null | undefined): ChaiPack | null {
  return CHAI_PACKS.find((pack) => pack.id === id) ?? null;
}

// Resolves the pack an App Store consumable belongs to. This is the whole
// recognition step for an iOS purchase: a store event whose product id is not
// in the catalog is not a Chai pack, whatever else it claims to be.
export function getChaiPackByAppleProductId(
  productId: string | null | undefined,
): ChaiPack | null {
  if (typeof productId !== "string" || productId.length === 0) return null;
  return CHAI_PACKS.find((pack) => pack.appleProductId === productId) ?? null;
}

// The ledger reason every WEB (Stripe) pack credit is written under.
export const CHAI_PACK_REASON = "purchase_chai_pack" as const;

// Marks a Checkout Session as ours. The webhook sees every event on the
// account — subscriptions included — so the credit path must be able to tell a
// pack purchase apart from anything else that completes a session.
export const CHAI_PACK_SESSION_KIND = "chai_pack";

/**
 * What the webhook needs from a completed Checkout Session, or null when the
 * session is not a paid Chai pack.
 *
 * Split out from the webhook handler so the mapping is testable without a
 * signed Stripe request. Three things must all hold, and each is a real guard:
 *   - the session is one of ours (`kind`), so a subscription session never
 *     credits Chai;
 *   - it is in payment mode, so a subscription session cannot credit Chai;
 *   - it is actually PAID — a session can complete unpaid (async payment
 *     methods settle later, and Stripe then raises
 *     `checkout.session.async_payment_succeeded`, which the webhook handles
 *     through this same mapper), and an unpaid session must never mint Chai;
 *   - the pack id resolves in the catalog, so a stale or hand-made session
 *     cannot name a pack that no longer exists.
 *
 * The metadata is written by us at session creation, never by the client.
 */
export type ChaiPackCredit = {
  userId: string;
  pack: ChaiPack;
  // Stripe's transaction id — the ledger refId, and the whole idempotency
  // story. See `creditChaiPack`.
  transactionId: string;
};

type SessionLike = {
  id?: string | null;
  mode?: string | null;
  payment_status?: string | null;
  payment_intent?: string | { id?: string | null } | null;
  metadata?: Record<string, string> | null;
};

export function chaiPackCreditFromSession(
  session: SessionLike,
): ChaiPackCredit | null {
  const metadata = session.metadata ?? {};
  if (metadata.kind !== CHAI_PACK_SESSION_KIND) return null;
  // Belt and braces with the `kind` marker: a pack is bought in payment mode,
  // full stop, so a subscription session cannot credit Chai by construction
  // even if it somehow carried our metadata.
  if (session.mode !== "payment") return null;
  if (session.payment_status !== "paid") return null;

  const pack = getChaiPack(metadata.packId);
  const userId = metadata.userId;
  if (!pack || !userId) return null;

  // The PaymentIntent id IS the transaction, and it is identical on every
  // event Stripe raises for this payment. REQUIRING it — rather than falling
  // back to the session id — is what keeps the credit idempotent ACROSS event
  // types: `completed` and `async_payment_succeeded` both arrive for a slow
  // payment method, and two deliveries that disagreed about which id to use
  // would write two ledger rows and credit the pack twice. A payment-mode
  // session with no intent has not been paid for, so refusing it costs
  // nothing.
  const intent = session.payment_intent;
  const transactionId = typeof intent === "string" ? intent : intent?.id;
  if (!transactionId) return null;

  return { userId, pack, transactionId };
}

/**
 * Credit a paid pack to the ledger. Idempotent by Stripe transaction id.
 *
 * The ledger's unique (userId, reason, refId) index is the whole guarantee:
 * a replayed webhook, a Stripe retry after our 500, and an out-of-order
 * delivery all carry the SAME transaction id, so the second insert conflicts
 * and credits nothing. `granted` reports whether THIS call was the one that
 * credited, which is what the webhook logs.
 *
 * This is also why the client is never involved: the learner can close the tab
 * the instant Stripe takes their money and the webhook still credits them.
 */
export async function creditChaiPack(
  credit: ChaiPackCredit,
): Promise<{ state: TokenStateRow; granted: boolean }> {
  return grantTokensDetailed(
    credit.userId,
    CHAI_PACK_REASON,
    credit.transactionId,
    credit.pack.chai,
  );
}

// True when every pack has a Stripe price id configured. The shop surface is
// flag-gated on the client, but the server still refuses to start a checkout
// for a pack it cannot price.
export function chaiPacksConfigured(): boolean {
  return CHAI_PACKS.every((pack) => getChaiPackPriceId(pack.id) !== null);
}

// ---------------------------------------------------------------------------
// iOS: StoreKit consumables, credited from the RevenueCat webhook
// ---------------------------------------------------------------------------

/**
 * The ledger reason an APP STORE pack credit is written under.
 *
 * Deliberately distinct from the web reason. The ledger's unique index is
 * (userId, reason, refId), so giving each till its own reason means the two
 * idempotency domains cannot collide even in the pathological case where a
 * Stripe id and an Apple id are the same string.
 */
export const CHAI_PACK_IOS_REASON = "purchase_chai_pack_ios" as const;

/**
 * Prefix on the Apple transaction id in the ledger refId.
 *
 * The prefix is not what makes the row unique (the reason already separates
 * the tills) — it makes the row READABLE. A support question six months from
 * now is answered by looking at the refId and knowing instantly which store it
 * came from and what to paste into that store's dashboard.
 */
export const APPLE_TRANSACTION_REF_PREFIX = "apple_tx:";

/** The RevenueCat event type raised once per consumable purchase. */
/**
 * The RevenueCat event types that mean "a consumable was bought".
 *
 * NON_RENEWING_PURCHASE is the one RevenueCat actually documents and sends.
 * This file listened only for NON_SUBSCRIPTION_PURCHASE, which reads like the
 * right name and is not in their vocabulary at all, so every Chai pack purchase
 * ever made fell through the webhook: delivered, answered 200, credited
 * nothing. Found 2026-08-19 from a real sandbox purchase that took the money
 * and granted no Chai.
 *
 * Both are accepted. The wrong one costs nothing to keep and guards against the
 * possibility that some RevenueCat account or API version does emit it; the
 * right one is what unblocks every real purchase.
 */
export const CONSUMABLE_PURCHASE_EVENTS = [
  "NON_RENEWING_PURCHASE",
  "NON_SUBSCRIPTION_PURCHASE",
] as const;

/** @deprecated Kept so existing imports keep compiling. Prefer the list. */
export const NON_SUBSCRIPTION_PURCHASE_EVENT = "NON_SUBSCRIPTION_PURCHASE";

export function isConsumablePurchaseEvent(type: string | null | undefined): boolean {
  return typeof type === "string" && (CONSUMABLE_PURCHASE_EVENTS as readonly string[]).includes(type);
}

/**
 * The fields of a RevenueCat webhook event this mapper reads. Structural, so
 * the mapper stays testable without pulling the whole event type in.
 */
export type StoreEventLike = {
  type?: string | null;
  app_user_id?: string | null;
  product_id?: string | null;
  transaction_id?: string | null;
  // Present on consumable events; deliberately NOT used as the refId — see
  // `chaiPackCreditFromStoreEvent`.
  original_transaction_id?: string | null;
};

/**
 * A store purchase resolved to a credit, or null when the event is not a Chai
 * pack purchase.
 */
export type ChaiPackStoreCredit = {
  userId: string;
  pack: ChaiPack;
  // The ledger refId, already prefixed. Composed here so no caller invents it.
  refId: string;
};

/**
 * Maps a RevenueCat consumable event to a credit.
 *
 * Recognition is by PRODUCT ID against the catalog, and the event type is a
 * second gate rather than the whole test: a purchase is a Chai pack because it
 * names one of our Apple SKUs, not because RevenueCat labelled the delivery a
 * non-subscription purchase. An event naming a product we do not sell (a
 * future consumable, another app's SKU, a typo in the dashboard) maps to
 * nothing and credits nothing.
 *
 * The refId is the TRANSACTION id, never the ORIGINAL transaction id. Apple
 * reuses the original id across every purchase of the same product, so keying
 * on it would make a learner's second kettle of Chai collide with their first
 * and silently credit nothing — the ledger index would eat a real payment.
 * The transaction id is unique per purchase, which is exactly the shape the
 * index needs: distinct purchases write distinct rows, and a replay of ONE
 * purchase carries the same id and writes nothing.
 *
 * Nothing here is client-asserted: the amount comes from the catalog, the user
 * from RevenueCat's app_user_id (which is the Clerk id the SDK was configured
 * with), and the transaction id from the store.
 */
export function chaiPackCreditFromStoreEvent(
  event: StoreEventLike,
): ChaiPackStoreCredit | null {
  if (!isConsumablePurchaseEvent(event.type)) return null;

  const pack = getChaiPackByAppleProductId(event.product_id);
  if (!pack) return null;

  const userId = event.app_user_id ?? null;
  if (!userId) return null;

  const transactionId = event.transaction_id;
  if (typeof transactionId !== "string" || transactionId.length === 0) {
    return null;
  }

  return {
    userId,
    pack,
    refId: `${APPLE_TRANSACTION_REF_PREFIX}${transactionId}`,
  };
}

/**
 * Credit a verified App Store pack purchase. Idempotent by Apple transaction
 * id, exactly as the Stripe path is by PaymentIntent id.
 *
 * Two properties this must keep, both pinned by tests:
 *   - two DISTINCT purchases of the same pack credit twice (they carry
 *     different transaction ids), and
 *   - the SAME purchase replayed credits once (the unique index refuses the
 *     second row).
 *
 * The replay case is not hypothetical: a purchase Apple charged for but the
 * server failed to credit is recovered by the app asking the store to
 * re-deliver it, so the same transaction legitimately arrives more than once.
 */
export async function creditChaiPackFromStore(
  credit: ChaiPackStoreCredit,
): Promise<{ state: TokenStateRow; granted: boolean }> {
  return grantTokensDetailed(
    credit.userId,
    CHAI_PACK_IOS_REASON,
    credit.refId,
    credit.pack.chai,
  );
}

/**
 * The ledger refId a given Apple transaction id would be credited under.
 *
 * Used by the recovery READ (`POST /chai-packs/credited`), which turns the
 * transaction ids the app can see into the keys the ledger is indexed by. The
 * app never composes this itself — it only ever sends the store's own ids.
 */
export function appleRefIdFor(transactionId: string): string {
  return `${APPLE_TRANSACTION_REF_PREFIX}${transactionId}`;
}
