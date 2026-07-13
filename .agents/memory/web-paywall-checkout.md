---
name: Web paywall checkout bridge
description: How the gujarati-coach web paywall starts/cancels Plus, and why it uses dev-override instead of a real provider.
---

# Web paywall checkout (gujarati-coach)

The web upgrade flow (`/upgrade`) has **no real provider web-checkout endpoint** — Stripe/RevenueCat web checkout is owned by a separate payments task and was out of scope for the paywall UX work.

**Bridge:** `src/lib/billing.ts` drives the server's non-production `POST /api/entitlements/dev-override` (body `{plan:"free"|"plus"|"trial"}`) to start/cancel Plus, then `queryClient.invalidateQueries()` (all) so the app unlocks/re-locks without a manual refresh. In production dev-override 404s, so `beginCheckout` surfaces "Checkout isn't available in this environment yet."

**Why:** it's the backbone's intended mechanism for exercising the two-tier model end-to-end (Free → upgrade → unlocked → lapse → re-locked) before a provider is wired.

**How to apply:** when real payments land, swap only `beginCheckout` (redirect to hosted checkout) — the unlock-via-entitlements-refetch and all gating UI stay the same.

## Client tier rule (reinforces entitlement-gating.md)
The web client never decides tiers. `useEntitlements()` (`src/lib/entitlements.ts`) wraps `useGetEntitlements` (server snapshot) and exposes `isPlus`, `features`, `dailyNewLessons`, `isLanguageAllowed`. Locked surfaces route to `/upgrade` instead of erroring; server 402 `upgrade_required` bodies are turned into upgrade UI via `asUpgradeRequired(err)` (matches `err.status===402 && err.data.upgradeRequired`).
