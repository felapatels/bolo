---
name: Stripe webhook endpoint hygiene
description: How Stripe webhook endpoints are laid out for Bolo and how to audit/fix delivery failures.
---

- The app runs entirely in **live mode**: one shared `STRIPE_SECRET_KEY` (sk_live) + one `STRIPE_WEBHOOK_SECRET` across dev and prod. Live mode has exactly ONE endpoint: `https://bolo-india.app/api/stripe/webhook` (subscription created/updated/deleted).
- `STRIPE_TEST_SECRET_KEY` (sandbox key, user-provided July 2026) exists in secrets for sandbox admin only — the live key cannot see or delete sandbox webhook endpoints.
- **Why:** Stripe "[Sandbox] webhook delivery issues" emails came from stale test-mode endpoints (one at the prod URL, one at an old dev domain) failing signature verification against the live signing secret. Both deleted July 2026.
- **How to apply:** when auditing delivery failures, list `/v1/webhook_endpoints` with BOTH keys; verify secret pairing by HMAC-signing a benign payload (unknown event type → handler 200s without side effects) and POSTing to the endpoint; check `/v1/events` `pending_webhooks` for delivery health. Don't create sandbox endpoints — dev shares the live key.
