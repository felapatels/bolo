---
name: Subscription cancel/manage must be provider-authoritative
description: Web All-Access is Stripe; the /account/subscription/* endpoints are DB-only, so Stripe subscribers must manage/cancel via the Stripe portal, not those endpoints.
---

# Cancel/manage must match the billing provider

**Rule:** `POST /account/subscription/{cancel,pause,retention}` only mutate local DB columns (subscriptionStatus/pauseUntil/currentPeriodEnd/retentionOfferAcceptedAt) — they do NOT call any provider. So they are only safe for RevenueCat/dev-override subscribers. **Stripe** subscribers (web All-Access, `provider === "stripe"`) must cancel and manage billing through the Stripe hosted portal (`cancelPlus()` → `/api/stripe/portal`), which syncs back via webhook.

**Why:** Using the DB-only endpoints for a Stripe subscription desyncs app state from Stripe — the learner sees "canceled/paused" in-app while Stripe keeps charging/renewing. A completion review rejected exactly this regression.

**How to apply:** In any subscription-management UI, branch on `SubscriptionDetails.provider`. For Stripe, route cancel + "manage payment & billing" to the portal and do NOT offer the in-app retention discount/pause (those hit the DB-only endpoints). For non-Stripe, the in-app retention flow is fine. `buildSubscriptionDetails` only enriches `paymentMethod`/`managementUrl` from RevenueCat, so Stripe users usually have a null managementUrl — always give them a dedicated portal button rather than gating on that URL.
