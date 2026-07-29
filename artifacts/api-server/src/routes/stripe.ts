import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { getPlusPriceId, getFamilyPriceId, type PlusInterval } from "../lib/stripePricing";
import { applyFromStripeSubscription } from "../lib/stripeSync";
import { applyStripeState } from "../lib/stripeApply";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// The origin real learners are browsing from — used to build the checkout /
// portal return URLs. Prefers the production custom domain(s), then the dev
// domain; both are Replit-managed and never user-controlled input, so this is
// safe to use unauthenticated-request-adjacent (it's never taken from the
// request itself, avoiding an open-redirect via a spoofed Host header).
function frontendOrigin(req: Request): string {
  const domains = [
    ...new Set(
      [
        ...(process.env.REPLIT_DOMAINS ?? "").split(","),
        process.env.REPLIT_DEV_DOMAIN ?? "",
      ]
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (domains.length === 0) {
    throw new Error("No REPLIT_DOMAINS/REPLIT_DEV_DOMAIN configured");
  }
  // Prefer the domain the learner is actually browsing from — otherwise Stripe
  // returns them to a sibling domain (e.g. the *.replit.app twin of a custom
  // domain) where their auth session cookie doesn't exist and they land
  // signed-out. Only honored when it matches our own Replit-managed domain
  // list, so a spoofed Origin/Referer can't create an open redirect.
  const requestHost = (() => {
    for (const header of [req.headers.origin, req.headers.referer]) {
      if (typeof header !== "string") continue;
      try {
        return new URL(header).hostname;
      } catch {
        /* malformed header — ignore */
      }
    }
    return undefined;
  })();
  const domain =
    (requestHost && domains.find((d) => d === requestHost)) || domains[0];
  return `https://${domain}`;
}

// The web app is served under an artifact base path (e.g. "/gujarati-coach/"),
// so Stripe's return URLs must include it. The client sends its own
// `import.meta.env.BASE_URL`; we only ever accept a same-origin relative path
// segment (never a full URL), which closes any open-redirect via a spoofed
// value — the origin is always our own Replit domain.
function returnUrl(req: Request, rawBasePath: unknown, pathAndQuery: string): string {
  let base = typeof rawBasePath === "string" ? rawBasePath.trim() : "/";
  // Reject anything that isn't a simple absolute path segment.
  if (!/^\/[A-Za-z0-9._~\/-]*$/.test(base)) {
    base = "/";
  }
  if (!base.endsWith("/")) base += "/";
  return `${frontendOrigin(req)}${base}${pathAndQuery.replace(/^\//, "")}`;
}

// POST /stripe/checkout — starts real Bolo! Plus checkout. Creates (and
// persists) a Stripe customer for the caller on first use, then a Checkout
// Session for the requested interval. `withTrial` begins the 7-day free
// trial; otherwise the subscription activates (and charges) immediately.
// Returns `{ url }` for the client to redirect the browser to Stripe's hosted
// checkout page.
router.post(
  "/stripe/checkout",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req as AuthedRequest;
    const interval: PlusInterval = req.body?.interval === "monthly"
      ? "monthly"
      : "annual";
    // "family" buys the Family plan (4 seats, monthly or annual); anything
    // else is regular all-access Plus.
    const plan: "plus" | "family" =
      req.body?.plan === "family" ? "family" : "plus";
    const withTrial = plan === "plus" && Boolean(req.body?.withTrial);

    const priceId =
      plan === "family" ? getFamilyPriceId(interval) : getPlusPriceId(interval);
    if (!priceId) {
      res.status(503).json({
        error:
          plan === "family"
            ? "Family pricing isn't configured yet. Run the seedStripeProducts script."
            : "Plus pricing isn't configured yet. Run the seedStripeProducts script.",
      });
      return;
    }

    try {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, userId),
      });

      const stripe = await getUncachableStripeClient();

      // Plus → Family upgrade for an existing Stripe subscriber: swap the
      // price on the SAME subscription (with proration) instead of creating a
      // second one — the learner must never be double-billed. Applied locally
      // right away from Stripe's response; the "updated" webhook confirms.
      if (
        plan === "family" &&
        user?.subscriptionProvider === "stripe" &&
        user.subscriptionProviderId &&
        (user.tier === "plus" || user.tier === "family")
      ) {
        if (user.tier === "family") {
          res.status(409).json({ error: "You're already on the Family plan." });
          return;
        }
        const current = await stripe.subscriptions.retrieve(
          user.subscriptionProviderId,
        );
        // A delinquent-but-live subscription (past_due/unpaid/incomplete/
        // paused) must never fall through to Checkout — that would create a
        // SECOND subscription. The learner has to fix billing in the Stripe
        // portal first.
        if (
          current.status === "past_due" ||
          current.status === "unpaid" ||
          current.status === "incomplete" ||
          current.status === "paused"
        ) {
          res.status(409).json({
            error:
              "There's a payment issue on your current subscription. Fix it in the billing portal, then upgrade to the Family plan.",
          });
          return;
        }
        if (current.status === "active" || current.status === "trialing") {
          const updated = await stripe.subscriptions.update(current.id, {
            items: [{ id: current.items.data[0].id, price: priceId }],
            proration_behavior: "always_invoice",
            // An in-trial upgrade starts the paid Family plan immediately.
            trial_end: "now",
            metadata: { userId, plan: "family" },
            cancel_at_period_end: false,
          });
          const apply = applyFromStripeSubscription(updated);
          if (apply) await applyStripeState(apply);
          res.json({ upgraded: true });
          return;
        }
      }

      let customerId = user?.stripeCustomerId ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user?.email ?? undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await db
          .insert(usersTable)
          .values({ id: userId, stripeCustomerId: customerId })
          .onConflictDoUpdate({
            target: usersTable.id,
            set: { stripeCustomerId: customerId },
          });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        // Tag the subscription with the Clerk user id so every subsequent
        // webhook event (created/updated/deleted) is directly attributable —
        // see stripeSync.ts.
        subscription_data: {
          // `plan` lets the webhook distinguish Family from Plus (stripeSync).
          metadata: { userId, plan },
          ...(withTrial ? { trial_period_days: 7 } : {}),
        },
        allow_promotion_codes: true,
        success_url: returnUrl(req, req.body?.basePath, "upgrade?checkout=success"),
        cancel_url: returnUrl(req, req.body?.basePath, "upgrade?checkout=cancel"),
      });

      if (!session.url) {
        res.status(502).json({ error: "Stripe did not return a checkout URL." });
        return;
      }
      res.json({ url: session.url });
    } catch (err) {
      logger.error({ err }, "Failed to create Stripe checkout session");
      res.status(502).json({ error: "Checkout is temporarily unavailable." });
    }
  },
);

// POST /stripe/portal — opens Stripe's hosted billing portal so a subscriber
// can manage or cancel their real subscription. Requires a prior checkout
// (there is no customer to manage otherwise).
router.post(
  "/stripe/portal",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req as AuthedRequest;
    try {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, userId),
      });
      if (!user?.stripeCustomerId) {
        res
          .status(404)
          .json({ error: "No billing account found for this user yet." });
        return;
      }

      const stripe = await getUncachableStripeClient();
      const portal = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: returnUrl(req, req.body?.basePath, "upgrade"),
      });
      res.json({ url: portal.url });
    } catch (err) {
      logger.error({ err }, "Failed to create Stripe billing portal session");
      res.status(502).json({ error: "Billing portal is temporarily unavailable." });
    }
  },
);

export default router;
