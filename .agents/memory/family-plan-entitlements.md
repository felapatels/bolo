---
name: Family plan entitlements & join flow
description: How the shared family subscription derives member Plus and keeps joins/upgrades atomic with Stripe.
---

## Derived member entitlement (no per-member writes)
Members never get a tier write. `loadEntitlements` cascades: own resolved plan → if free, look up an ACTIVE family seat → resolve the owner's plan; owner resolving plus/family grants the member plus for that request. Owner lapse/pause automatically cascades members back to free with zero writes.
**Why:** any per-member tier write would need cleanup on every owner billing event (lapse, pause, cancel) and would drift.
**How to apply:** never "sync" member tiers; anything that needs a member's plan must go through the entitlements loader.

## Join must be atomic with the Stripe cancel
When a joiner has their own Stripe Plus, the cancel-with-proration runs INSIDE the seat-claim DB transaction, after the plan row is `SELECT ... FOR UPDATE`-locked and the seat is confirmed claimable. Full plan / dead invite → no cancel; Stripe failure → whole join rolls back (custom error class thrown from inside the transaction, caught outside → 502).
**Why:** cancel-before-claim stranded users (downgraded but not joined) if capacity vanished concurrently.

## In-place Plus→Family upgrade
Existing Stripe subscriber upgrades by swapping the price on the SAME subscription (`proration_behavior: always_invoice`, `trial_end: 'now'`, metadata plan=family) — never a second checkout. Delinquent states (past_due/unpaid/incomplete/paused) return 409 pointing at the billing portal; only canceled/expired fall through to a fresh checkout. Local state is applied from Stripe's response (idempotent; webhook re-confirms) so the UX is instant.

## Misc
- Seat cap counts owner + pending invites; capacity checks under the plan-row lock.
- Web subscription page: family members are redirected to /family (no billing surface); owners get a warning dialog before the Stripe portal when seats are occupied.
- All router Stripe/email effects are injected via `createFamilyRouter(deps)` so tests never touch the live key.
