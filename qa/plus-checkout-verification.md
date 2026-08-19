# Plus checkout journey — manual QA verification

Reproducible verification of the gujarati-coach (`Bolo!`) web **Plus checkout
journey** end-to-end in a real browser. This is a QA artifact: it changes no
product code. The script `plus-checkout-e2e.mjs` in this folder automates a real
Chromium session against the running dev app.

## Flows covered

1. **Trial checkout (happy path)** — a signed-in Free learner taps
   "Start 7-day free trial", completes Stripe test checkout, and is returned to
   `/upgrade?checkout=success` with **Plus unlocked without a manual refresh**.
2. **Cancel** — backing out of Stripe checkout returns to
   `/upgrade?checkout=cancel` with a "cancelled — you haven't been charged"
   notice and the learner still on **Free**.
3. **Billing portal** — "Manage subscription" opens the Stripe billing portal
   (`billing.stripe.com`); returning refreshes entitlements.

## Prerequisites

- The `gujarati-coach` and `api-server` workflows are running.
- Test-mode Stripe keys are set (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- `CLERK_SECRET_KEY` is set (used to mint a single-use `__clerk_ticket` sign-in
  token, avoiding the Clerk dev sign-in UI which Cloudflare blocks in automation).
- A test Clerk user id (`E2E_USER_ID`). The DB `users` row for that id should be
  on `tier=free` before running the happy/cancel path (reset with
  `UPDATE users SET tier='free', subscription_status=NULL WHERE id='<id>';`).
- Chromium: the browser Playwright bundles fails to launch on NixOS
  (`libglib-2.0.so.0`). Install the Nix `chromium` package and point Playwright at
  it via `CHROME_BIN` (see the script header).
- The dev Stripe **webhook endpoint** URL must point at the *current* dev domain,
  or the DB→Plus flip won't happen (webhooks are the only tier-write path). The
  prod endpoint is separate and unaffected.

## Run

```bash
# from repo root; CHROME_BIN must point at a working chromium binary
CHROME_BIN=$(which chromium) \
E2E_USER_ID=<clerk_user_id> \
E2E_MODE=success \        # or: cancel
node qa/plus-checkout-e2e.mjs
```

The portal flow is asserted inside the `success` run (after Plus is active).
Screenshots are written to `qa/shots/` (gitignored).

## Expected results (last verified 2026-07-13)

| Flow            | Result |
| --------------- | ------ |
| Happy path      | ✅ Returned to `/upgrade?checkout=success`; Plus unlocked in ~2s with no manual refresh; persists after reload; zero console errors. DB row: `tier=plus, status=trialing` with real Stripe sub/customer ids (proves the webhook verified and wrote the tier). |
| Cancel          | ✅ Returned to `/upgrade`; "Checkout was cancelled — you haven't been charged." shown; Free remains the current plan. (Benign `402`s from probing Plus-gated endpoints are expected for Free users.) |
| Billing portal  | ✅ "Manage subscription" redirects to a `billing.stripe.com` test portal session; no console errors. |

## Cleanup after a run

- Cancel/delete any Stripe test subscription + customer created by the run.
- Reset the test user's DB row to `tier=free`.
- Restore the dev webhook endpoint URL if it was repointed.
