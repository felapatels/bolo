// Handles POST /api/stripe/webhook. Mounted directly on `app` (not the router)
// BEFORE express.json() — Stripe signature verification needs the raw request
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
