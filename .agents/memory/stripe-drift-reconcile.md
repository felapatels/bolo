---
name: Stripe drift reconcile sweep
description: Background sweep that self-heals users.tier when Stripe webhooks are missed
---

The api-server runs a periodic sweep (boot + every 6h, pg advisory-locked across instances) that lists ALL Stripe subscriptions (`status: "all"` — canceled subs are how a missed deletion is learned), picks one authoritative sub per `metadata.userId` (alive statuses outrank ended; ties → newest `created`), translates through the same pure `applyFromStripeSubscription` layer the webhook uses, and writes only on drift via `applyStripeState`. Repairs log at WARN.

**Why:** the webhook is the only immediate Stripe tier-write path; endpoint drift / secret rotation / outages silently desync Plus status. The very first live sweep found and repaired a real drifted user.

**How to apply:** guard rules matter — a downgrade-to-free is only applied when `subscriptionProvider === "stripe"`, so old canceled Stripe subs can never clobber RevenueCat-managed or dev-override rows. Any new Stripe state field must be added to both the webhook path and the sweep's `unchanged` comparison or the sweep will rewrite (or miss) it forever.
