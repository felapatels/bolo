---
name: Stripe connector unreliable here — use a direct secret key
description: The Replit Stripe connector's credential-listing and request proxy both fail in this repl; use user-provided STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET directly.
---

# Stripe uses a direct secret key, not the connector

**Decision:** Web Stripe billing in this repl instantiates `new Stripe(secretKey)` from a user-provided `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`), bypassing the Replit Stripe connector entirely. `stripe-replit-sync` was intentionally dropped — nothing in-app reads its `stripe.*` Postgres mirror; the webhook writes tier state directly.

**Why:** The connector shows status `added` but does not work here — credential listing (`/api/v2/connection?include_secrets=true`) returns empty items for *any* connector, and `connectors.proxy("stripe", …)` misroutes (404s, never reaches api.stripe.com). Both reproduce after disconnect/reconnect.

**How to apply:** Don't route Stripe (or similar) through the connector credential-fetch or `connectors.proxy()` here even when the UI says "added" — if credential fetch returns empty items or the proxy 404s a valid path, fall back to a user-provided secret via the environment-secrets skill. Keep Stripe billing provider-authoritative: cancel/manage via the hosted portal (`/api/stripe/portal`) + webhook sync, never DB-only mutations.
