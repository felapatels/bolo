import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  applyFromEvent,
  downgradesFromTransfer,
  transferRecipients,
  type RevenueCatWebhookBody,
} from "../lib/revenuecatSync";
import {
  applyRevenueCatState,
  reconcileFromRevenueCat,
} from "../lib/revenuecatReconcile";
import {
  chaiPackCreditFromStoreEvent,
  CHAI_PACKS,
  isConsumablePurchaseEvent,
  creditChaiPackFromStore,
} from "../lib/chaiPacks";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Constant-time comparison so the shared secret can't be probed by timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// POST /revenuecat/webhook, RevenueCat calls this whenever a subscription is
// purchased, renewed, trialed, canceled, refunded, transferred, or expires. We
// translate the event into the user's subscription columns so the server's
// entitlement state always mirrors real billing, the server, not the client,
// decides who is Plus.
//
// This route is intentionally public (RevenueCat is not a Clerk user) and is
// instead authenticated by a shared secret sent in the Authorization header,
// configured verbatim in the RevenueCat dashboard and stored as the
// REVENUECAT_WEBHOOK_AUTH secret here.
router.post(
  "/revenuecat/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected) {
      // Fail closed: without a configured secret we can't trust any caller.
      logger.error("REVENUECAT_WEBHOOK_AUTH is not set; rejecting webhook");
      res.status(503).json({ error: "Webhook not configured" });
      return;
    }

    const provided = req.header("authorization") ?? "";
    if (!secretMatches(provided, expected)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as RevenueCatWebhookBody;
    const event = body.event;
    if (!event || typeof event.type !== "string") {
      res.status(400).json({ error: "Missing event" });
      return;
    }

    // EVERY event, named, before any branching.
    //
    // A real purchase on 2026-08-19 answered 200 in two milliseconds and logged
    // nothing at all: it credited no Chai and it did not trip the
    // could-not-be-credited error either, which means it never reached the
    // consumable branch and the type was something nobody had guessed. Two
    // rounds of diagnosis went into learning that, and both would have been one
    // round with this line.
    //
    // At info, not debug: a webhook is rare, the volume is nothing, and the one
    // time it matters the log is already there rather than one deploy away.
    logger.info(
      {
        type: event.type,
        productId: event.product_id ?? null,
        appUserId: event.app_user_id ?? null,
        environment: (event as { environment?: string }).environment ?? null,
      },
      "RevenueCat webhook received",
    );

    try {
      // Consumables (Chai packs) first, and they RETURN. A consumable is not a
      // subscription: it grants Chai and must not reach any subscription write
      // on any path. Recognition is by product id against the server catalog,
      // so an event type alone can never move money.
      const chaiCredit = chaiPackCreditFromStoreEvent(event);
      if (chaiCredit) {
        const { granted } = await creditChaiPackFromStore(chaiCredit);
        logger.info(
          {
            userId: chaiCredit.userId,
            packId: chaiCredit.pack.id,
            refId: chaiCredit.refId,
            granted,
          },
          granted
            ? "Credited Chai pack from App Store purchase"
            : "Chai pack purchase already credited (replay)",
        );
        res.status(200).json({ received: true });
        return;
      }

      // MONEY TAKEN, NOTHING GRANTED. A purchase event that reaches here failed
      // one of the four gates in chaiPackCreditFromStoreEvent, and until
      // 2026-08-19 it fell through this file without a word: RevenueCat saw a
      // 200, the app showed "chai is on your way", and the balance never moved.
      // A learner paid and got nothing, and nothing anywhere said so.
      //
      // Logged at ERROR with the two fields that name the cause. Almost always
      // product_id (a store product whose identifier does not match the server
      // catalog) or app_user_id (an anonymous RevenueCat id, meaning the SDK
      // was never told who the learner is).
      if (isConsumablePurchaseEvent(event.type)) {
        logger.error(
          {
            productId: event.product_id ?? null,
            appUserId: event.app_user_id ?? null,
            transactionId: event.transaction_id ?? null,
            eventType: event.type,
            knownProductIds: CHAI_PACKS.map((p) => p.appleProductId),
          },
          "Consumable purchase could not be credited: no matching Chai pack",
        );
      }

      if (event.type === "TRANSFER") {
        // Downgrade the ids that lost the subscription, and pull fresh state for
        // the ids that gained it (the event doesn't carry their entitlement).
        for (const apply of downgradesFromTransfer(event)) {
          await applyRevenueCatState(apply);
        }
        for (const recipient of transferRecipients(event)) {
          await reconcileFromRevenueCat(recipient);
        }
      } else {
        const apply = applyFromEvent(event);
        // A null apply is a deliberately ignored event (unrelated entitlement,
        // non-state event), acknowledge so RevenueCat stops retrying.
        if (apply) await applyRevenueCatState(apply);
      }
    } catch (err) {
      // A 5xx makes RevenueCat retry with backoff, which is what we want on a
      // transient DB error.
      logger.error({ err, type: event.type }, "RevenueCat webhook sync failed");
      res.status(500).json({ error: "Sync failed" });
      return;
    }

    res.status(200).json({ received: true });
  },
);

export default router;
