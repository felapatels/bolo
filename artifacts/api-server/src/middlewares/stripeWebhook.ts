// Handles POST /api/stripe/webhook. Mounted directly on `app` (not the router)
// BEFORE express.json(), Stripe signature verification needs the raw request
// body, exactly like the Clerk proxy earlier in the chain.
//
// This route is public (Stripe is not a Clerk user) and authenticates itself
// via the managed webhook's signing secret, verified per-request with
// `stripe.webhooks.constructEvent`.

import type { NextFunction, Request, Response } from "express";
import type Stripe from "stripe";
import {
  getStripeWebhookSecret,
  getUncachableStripeClient,
} from "../lib/stripeClient";
import {
  applyFromStripeDeletion,
  applyFromStripeSubscription,
} from "../lib/stripeSync";
import { applyStripeState } from "../lib/stripeApply";
import { chaiPackCreditFromSession, creditChaiPack } from "../lib/chaiPacks";
import { logger } from "../lib/logger";

export async function stripeWebhookHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const signature = req.header("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    // Would mean express.json() ran first (route ordering regression).
    logger.error("Stripe webhook body is not a raw Buffer; check route order");
    res.status(500).json({ error: "Webhook misconfigured" });
    return;
  }

  let event: Stripe.Event;
  try {
    const [stripe, webhookSecret] = await Promise.all([
      getUncachableStripeClient(),
      getStripeWebhookSecret(),
    ]);
    if (!webhookSecret) {
      logger.error("Stripe webhook signing secret unavailable; rejecting");
      res.status(503).json({ error: "Webhook not configured" });
      return;
    }
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const apply = applyFromStripeSubscription(
          event.data.object as Stripe.Subscription,
        );
        if (apply) await applyStripeState(apply);
        break;
      }
      // One-time Chai pack (web). THE ONLY path that credits bought Chai: the
      // client never mints any. Idempotent by Stripe transaction id, so a
      // replay, a retry after the 500 below, or an out-of-order delivery all
      // credit exactly once, and a learner who closed the tab mid-purchase is
      // credited anyway, because nothing here needs the browser.
      // ...and the second delivery for a slow payment method. A session can
      // COMPLETE unpaid (bank debits and some wallets settle afterwards);
      // Stripe then raises this once the money actually lands. Both events
      // carry the same PaymentIntent, so handling both credits exactly once, and omitting this one would charge that learner and credit nothing.
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.completed": {
        const credit = chaiPackCreditFromSession(
          event.data.object as Stripe.Checkout.Session,
        );
        // Not a Chai pack (a subscription session, say), or not paid yet.
        if (!credit) break;
        const { granted } = await creditChaiPack(credit);
        logger.info(
          {
            userId: credit.userId,
            packId: credit.pack.id,
            chai: credit.pack.chai,
            transactionId: credit.transactionId,
            granted,
          },
          granted
            ? "Chai pack credited"
            : "Chai pack replay ignored (already credited)",
        );
        break;
      }
      case "customer.subscription.deleted": {
        const apply = applyFromStripeDeletion(
          event.data.object as Stripe.Subscription,
        );
        if (apply) await applyStripeState(apply);
        break;
      }
      default:
        // Every other event only matters for the synced `stripe.*` tables.
        break;
    }
  } catch (err) {
    // A 5xx makes Stripe retry with backoff, which is what we want on a
    // transient DB error.
    logger.error({ err, type: event.type }, "Stripe webhook sync failed");
    res.status(500).json({ error: "Sync failed" });
    return;
  }

  res.status(200).json({ received: true });
}
