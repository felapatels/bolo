---
name: RevenueCat payments (server-authoritative)
description: How Bolo! syncs RevenueCat subscription state to the users table — connector pattern, webhook vs reconcile, config gates.
---

# RevenueCat payments sync

Server (not client) decides Plus. Billing state is written to the `users`
subscription columns the entitlement backbone already reads
(`tier`/`subscriptionStatus`/`trialEndsAt`/`currentPeriodEnd` + provider cols).

## Connector is the proxy pattern, NOT the typed SDK
This repl's RevenueCat connector renders `@replit/connectors-sdk`
(`new ReplitConnectors().proxy("revenuecat", "/path", {method,body})` → raw
`Response`, call `.json()`), **not** `@replit/revenuecat-sdk` /
`getUncachableRevenueCatClient`. Don't reach for the typed SDK here.
- Reconcile-on-read uses v1 `GET /v1/subscribers/{app_user_id}` (app_user_id =
  Clerk id); read `subscriber.entitlements[<id>].expires_date` + the linked
  `subscriptions[...]` for `period_type`/`unsubscribe_detected_at`.
- Seed uses v2 `/v2/projects/{id}/...` (apps/products/entitlements/offerings/
  packages + `.../actions/attach_products`).

## Two sync paths, one apply helper
- **Webhook (push):** `POST /api/revenuecat/webhook`, mounted PUBLIC before
  `requireAuth`, shared-secret `Authorization` header (constant-time compare vs
  `REVENUECAT_WEBHOOK_AUTH`, fails closed if unset). Derives state from the event
  payload alone — no network call — so it's fully unit-testable. TRANSFER events
  carry no entitlement for the recipient: downgrade the `transferred_from` ids
  and reconcile the `transferred_to` ids from live state.
- **Reconcile-on-read (pull):** `GET /api/entitlements` best-effort, throttled
  ~5 min/user, re-resolves the plan after any write.

## Config gates (important for tests)
- Reconcile is a **hard no-op unless `REVENUECAT_PROJECT_ID` is set**
  (`fetchSubscriber` short-circuits). This keeps dev + the api-server test suite
  offline — otherwise every `GET /entitlements` would hit the connector proxy.
- `REVENUECAT_ENTITLEMENT_ID` (default `plus`) must match the entitlement the
  seed creates.

**Why:** the connector always resolves a Replit identity token, so a proxy call
is attempted even when RevenueCat isn't authorized — it would fail per-request
and slow/hang tests. Gate on the project-id env instead of try/catch alone.

## Live provisioning status (July 29, 2026 — NEW project)
The live project is now `proja487649a` (owner-created; the seeded `projad047e4e` is retired). Entitlements: `plus` + `family` — NO `one_language` (tier retired). Current `default` offering: `$rc_monthly`/`$rc_annual` → `bolo_plus_monthly`/`bolo_plus_annual` (both attached to `plus`) plus family_monthly/family_annual packages. Apps: app_store + test_store only (no play_store). Public keys `appl_xAFgoGVFBkoDdXXYrfZLpizttoZ` / `test_jIVwJWDezdlevzMAKorSHOKoRer` are set in EAS production; the workspace shared env still carries the OLD project's appl_yoQ…/test_NMS…/goog_Co… keys (dev mismatch until swapped).

## Probing gotchas
- Connector proxy paths need the `/v2` prefix (`/v2/projects/...`) — the base URL is the API root, not `/v2`; without it you get 404 code 7117.
- The CodeExecution sandbox withholds this connector's credentials (`listConnections('revenuecat')` → `[]` despite status added); run probes as a tsx script inside `artifacts/api-server` (resolves `@replit/connectors-sdk`; /tmp scripts don't).
- The owner's V1 secret key 403s on ALL v2 endpoints (that's expected, not an invalid key).
- V1 promotional grant POST 404s when the customer doesn't yet exist in the project (the "auto-creates" claim did not hold); GET `/v1/subscribers/{id}` first to auto-create, then POST.

## Connector token scopes (learned July 2026, promotional grants)
The connector token is **v2-read-mostly**: every `/v1/...` call returns 401
"Invalid API Key" (code 7225) and v2 customer WRITES 403 (missing
`customer_information:customers:read_write`). Consequences:
- **Prod reconcile-on-read silently no-ops** — `fetchSubscriber` (v1 GET via
  connector) gets 401 → null → stored state untouched. Webhooks are the only
  working sync path in production (they do work — verified live).
- Promotional grants (v1-only API) need an owner-created **V1 secret key**
  (stored as `REVENUECAT_SECRET_API_KEY`; owner may revoke). The dashboard
  cannot create customers manually, and connector can't either.
- v1 `POST .../entitlements/{id}/promotional` no longer auto-creates the
  subscriber (404 code 7259); `GET /v1/subscribers/{id}` DOES (201). Prime
  with a GET first. Tooling: `scripts/src/grantPromotionalPlus.ts`.
- Current project id is `proja487649a` (the older `projad047e4e` note below is
  stale — always read `REVENUECAT_PROJECT_ID` from env).
