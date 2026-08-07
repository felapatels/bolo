---
name: Chai stop unlocks
description: How a soft-currency purchase of a single stop in a plan-locked language is modelled, capped and made replay/reinstall safe.
---

**The model.** A stop unlock is a token ledger spend and nothing else. The refId encodes the resource (`stop:<lang>:<groupId>`) and is minted server-side; ownership is a read of that row. No unlock table, no client state, no reinstall problem.

**Why:** the ledger already has a unique `(user, reason, ref)` index, so idempotency, receipts and history come free. Every entitlement that can be expressed as "did this refId ever get written" should ride the ledger instead of growing a table.

**How to apply:** derive the refId from server-side data only (the group row supplies the language), never from request fields; return `charged: false` on a replay rather than an error.

---

**Uniqueness dedups a replay, NOT a budget.** Two purchases of *different* refIds are two different rows, so a read-then-decrement balance check lets both succeed and drives the balance negative.

**Why:** discovered in review of the first stop-unlock implementation; the same read-then-decrement shape exists in the older single-item spend path, which is only safe because its other invariants (max equipped, active-until) happen to block a second concurrent buy.

**How to apply:** in any spend transaction, take `SELECT ... FOR UPDATE` on the user's token-state row before reading the balance you spend against, and compute `balanceAfter` from the locked read.

---

**Split the refusal registers.** A cap violation and an empty wallet are different answers: out-of-cap returns the standard 402 upgrade envelope (it is a paywall boundary), an empty wallet returns the wallet's existing 409 `insufficient_tokens` with `{balance, cost}`.

**Why:** clients route 402 to the upgrade screen. Answering "not enough Chai" with 402 would push a learner who needs 10 more Chai into a subscription flow.

---

**One predicate for the offer and the sale.** The listing flag that renders the buy button and the eligibility check the purchase route runs must be the same three conditions, or the UI offers stops the server then refuses (and hides stops it would happily sell).

**How to apply:** when adding a filter to one, add it to the other in the same edit; the stage filter (phrase-only) was initially missing from the listing and would have offered sentence-stage stops the route refuses.
