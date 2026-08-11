// Chai packs — the only way to buy Chai with money, sold on WEB ONLY.
//
// iOS packs will be StoreKit consumables later and are deliberately absent
// here; nothing in this file may be surfaced to the mobile app.
//
// The catalog is the single source of truth for what a pack contains and what
// it seeds in Stripe. Two rules keep it honest:
//   1. Nothing inlines a pack amount or price at a call site — the credit path
//      reads `chai` off this catalog by pack id, so a tampered client cannot
//      ask for more Chai than the pack holds.
//   2. `cents` exists to SEED Stripe (scripts/seedStripeProducts.ts) and to
//      keep the ladder written down in one place. What a learner is shown and
//      charged is the live Stripe price behind the configured price id, read
//      through the pricing catalog — never this number.

import { getChaiPackPriceId } from "./stripePricing";
import { grantTokensDetailed } from "./tokenService";
import type { TokenStateRow } from "./tokenService";

export type ChaiPackId = "small" | "medium" | "large";

export type ChaiPack = {
  id: ChaiPackId;
  // How much Chai the ledger credits on a paid purchase.
  chai: number;
  // Seed amount in minor units. NOT a display price (see rule 2 above).
  cents: number;
  // Stripe product name; also how the seeder finds an existing product.
  productName: string;
  description: string;
};

// Owner ruling Aug 11, 2026.
export const CHAI_PACKS: readonly ChaiPack[] = [
  {
    id: "small",
    chai: 50,
    cents: 199,
    productName: "Bolo! Chai — 50",
    description: "50 Chai for the Bolo! wallet.",
  },
  {
    id: "medium",
    chai: 150,
    cents: 499,
    productName: "Bolo! Chai — 150",
    description: "150 Chai for the Bolo! wallet.",
  },
  {
    id: "large",
    chai: 400,
    cents: 999,
    productName: "Bolo! Chai — 400",
    description: "400 Chai for the Bolo! wallet.",
  },
] as const;

export function getChaiPack(id: string | null | undefined): ChaiPack | null {
  return CHAI_PACKS.find((pack) => pack.id === id) ?? null;
}

// The ledger reason every pack credit is written under.
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
