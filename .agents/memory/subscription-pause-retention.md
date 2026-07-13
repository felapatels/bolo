---
name: Subscription pause & retention semantics
description: How paused/canceled/retention subscription state resolves to entitlements in api-server.
---

# Subscription pause / cancel / retention

The account/subscription endpoints record management *intent* in local `users`
columns; the entitlement resolver (`resolvePlan`) turns that into access. Store
subscriptions (App/Play) have no simple server-side cancel/pause, so state lives
locally and is reconciled with the provider best-effort.

## Pause
A **paused** subscription (`subscriptionStatus="paused"` + `pauseUntil`) is
*suspended*, NOT expired: while `pauseUntil` is in the future it resolves to
`plan:"free"`, `status:"paused"`; once the window lapses it resumes to the
underlying tier (reads as `active`).

**Why:** a naive resolver would let a paused `tier:"plus"` row still inside its
paid period fall through and wrongly grant full Plus. The pause branch must run
*before* the tier/period branches.

**How to apply:** `SubscriptionState.pauseUntil` is optional (legacy literals
omit it) but `loadEntitlements` and any route building a fresh state MUST include
it from the row, or pause silently won't gate. In the pause route, check
"already paused → 409" *before* "plan is free → 400", because a paused plan
itself resolves to free.

## Cancel
`subscriptionStatus="canceled"` keeps access until `currentPeriodEnd` lapses
(resolver already honors the period). Surface `cancelAtPeriodEnd` = canceled &&
plan !== free.

## Retention
One-time 3-month discounted offer: guarded by `retentionOfferAcceptedAt` (409 if
already set). Accepting un-cancels (status→active), clears pause, and extends
`currentPeriodEnd` by 3 months from max(now, existing end). Requires a paid tier.
