---
name: Stripe connector broken in this environment
description: The Replit Stripe connector's credential-listing and request proxy both fail here; use a directly-provided secret key instead.
---

# Stripe (and connector-credential extraction) is unreliable in this repl

The Replit **Stripe connector** shows status `added` but does **not** actually work for API calls in this environment. Two independent failures, both reproducible after disconnect/reconnect:

1. **Credential listing returns nothing.** `GET https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true&connector_names=stripe` (with a correct `X_REPLIT_TOKEN`/`X-Replit-Token`) returns `{"items":[],"total":0}` — for *any* connector name (stripe, revenuecat, openai), not just Stripe. So the documented raw-secret-fetch template (skill's `stripeClient.ts`) always throws "not connected or missing secret key."
2. **The request proxy misroutes.** `ReplitConnectors.proxy("stripe", "/v1/products", ...)` reaches a Stripe host but not `api.stripe.com` — it returns `404 "Unrecognized request URL"` (a Next.js/dashboard-style 404 with `vary: next-router-state-tree` headers), whereas real `api.stripe.com/v1/products` with no key returns `401 "You did not provide an API key"`. Confirmed by curling real api.stripe.com for comparison.

**Resolution used:** bypass the connector entirely. Ask the user for `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` via `requestSecrets` and instantiate `new Stripe(secretKey)` directly. Works immediately. `stripe-replit-sync` was dropped (it needs the raw key+webhook secret for its own Postgres `stripe.*` mirror, which nothing in-app reads; our webhook writes tier state directly).

**Why this matters going forward:** any future integration that relies on extracting raw credentials via the `/api/v2/connection` pattern, OR on `connectors.proxy()`, may silently fail here even when the integration UI says "added". The RevenueCat reconcile path is gated off (`REVENUECAT_PROJECT_ID` unset), so it never exercised the proxy — don't assume proxy works just because a connector is listed.

**How to apply:** when a connector's credential fetch returns empty items or its proxy 404s on a known-valid path, stop debugging the connector and fall back to a user-provided secret via the environment-secrets skill (after confirming with the user).
