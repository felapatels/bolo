---
name: Web paywall checkout bridge
description: How the gujarati-coach web paywall starts/cancels Plus via real Stripe checkout, and the redirect-away flow it uses.
---

# Web paywall checkout (gujarati-coach)

The web upgrade flow (`/upgrade`) shows a **three-tier chooser** (Free / One-Language / All-Access). Only **All-Access (Plus)** is real: `beginAllAccessCheckout` → real Stripe. The middle **One-Language** tier is NOT sold via Stripe on web — `beginOneLanguageCheckout` drives the non-production dev-override placeholder (it stays RevenueCat/mobile-only), so in production it 404s with a clear "not available" message. Stripe's "Bolo! Plus" product is the **All-Access** price ($9.99/mo, $71.99/yr) — keep `seedStripeProducts.ts` in sync with the `plus` row of `TIER_PRICING` in upgrade.tsx, NOT the one_language row.

**Flow:** `src/lib/billing.ts` `beginCheckout` POSTs `/api/stripe/checkout` (`{interval, withTrial, basePath}`) → gets `{url}` → `window.location.href = url` (full-page redirect to Stripe Checkout; never resolves on success). `cancelPlus` POSTs `/api/stripe/portal` → redirects to Stripe's billing portal. Stripe returns to `/upgrade?checkout=success|cancel`; `upgrade.tsx` `useEffect` detects the param, calls `refreshAfterBilling` (`queryClient.invalidateQueries()`), and strips the param via `history.replaceState`.

**Base-path gotcha:** the app is served under an artifact base path (e.g. `/gujarati-coach/`), but calls `/api` at root. Stripe return URLs must include the base path, so the client sends `import.meta.env.BASE_URL` as `basePath` and the server (`returnUrl()` in `routes/stripe.ts`) validates it's a same-origin relative path and prepends the Replit origin. Never build return URLs from the request Host (open-redirect).

**Tier write path:** the `customer.subscription.*` webhook (metadata.userId set at checkout) is the only thing that flips a user to Plus — `stripeSync.ts` (pure translation) → `stripeApply.ts` (DB write, tags `subscriptionProvider:"stripe"`, clears `chosenLanguage`). resolvePlan downgrades automatically once `currentPeriodEnd` lapses, so cancel-at-period-end / past_due still read Plus until then.

**How to apply:** for production, create a second Stripe webhook endpoint pointing at the deployed `.replit.app` URL (or update the dev one) and set that endpoint's `whsec_` as `STRIPE_WEBHOOK_SECRET`. Price ids live in `STRIPE_PLUS_MONTHLY_PRICE_ID`/`STRIPE_PLUS_ANNUAL_PRICE_ID` (re-run `pnpm --filter @workspace/api-server run seed-stripe-products` against a new Stripe account).

## Client tier rule (reinforces entitlement-gating.md)
The web client never decides tiers. `useEntitlements()` (`src/lib/entitlements.ts`) wraps `useGetEntitlements` (server snapshot) and exposes `isPlus`, `features`, `dailyNewLessons`, `isLanguageAllowed`. Locked surfaces route to `/upgrade` instead of erroring; server 402 `upgrade_required` bodies are turned into upgrade UI via `asUpgradeRequired(err)` (matches `err.status===402 && err.data.upgradeRequired`).
