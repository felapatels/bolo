# Zone unlock: the wire proposal

**GATE 3. Nothing here is built.** The owner ruled 2026-09-07 that the free tier
becomes **zone one in every language**, and that a learner then either **earns
Chai to unlock more zones** or subscribes. His words on the currency question
were "Earn chai", so it is **one currency with two uses**: earned by learning,
spent on zones **or** on wardrobe.

**Posted by India as the parent, for a ruling before any fork writes code.** One
owner ruling became four wire formats before. This exists so that cannot happen
again.

---

## WHAT THIS REPLACES

The per-fork free-LANGUAGE list. A learner arriving for their family's language
currently gets in free or hits a wall **depending on whether their grandmother's
language made an arbitrary list.** That gate goes.

---

## THE PROPOSAL, IN NAMES

**Reuse `chai` on the wire.** Ruled 2026-09-07 in `e08a57a2`: the field is an
identifier and each client renders its own word. **A fork must not introduce
`kopi_unlock` or similar.**

**Debit through the endpoint that already exists.** `POST /tokens/spend`
(`spendTokens`, `TokensSpendInput`, `TokenSpendResult`) is the current path for
losing Chai, and it already carries a `refId` for idempotency.

```
POST /tokens/spend
  kind:  "zone_unlock"                 # new value on the existing enum
  refId: "zone:{languageCode}:{categoryId}"
```

**Why not a new `/zones/{categoryId}/unlock`:** a second way to lose Chai is a
second ledger, a second idempotency story and a second place for a race. **One
debit path, one ledger.** The refId shape gives idempotency for free: the same
learner unlocking the same zone twice is a no-op rather than a double charge.

**Read the state where entitlement is already read.** Extend the existing
`/entitlements` payload with `unlockedZones`, rather than adding a parallel
endpoint a client has to reconcile against it:

```
unlockedZones: [ { languageCode: string, categoryId: integer, unlockedAt: date-time } ]
```

**Serve the price, never ship it.** Add to `TokenState`:

```
zoneUnlockCost: integer
```

**This has precedent in the same schema and the precedent is the argument.**
`allowanceAllAccessMonthly` is already served rather than hardcoded, with a
comment saying it moved once (50 to 15) and was made server-side **precisely so
no client release was needed.** The earn rate for zones has the same property
and more urgently, see the risk below.

---

## THE THREE QUESTIONS THAT ARE THE OWNER'S

**1. Per zone or per language, and how much?**
**Recommendation: per ZONE.** It is the unit the learner already sees on the
journey, it makes the first purchase small enough to feel reachable, and it
gives the tuning knob fine resolution. Per language is one big wall, which is
the thing this ruling was meant to remove. **The number itself is his.**

**2. Permanent, or does it lapse?**
**Recommendation: PERMANENT.** "You earned this and then lost it" is the worst
sentence this product could say to a child. Lapsing also needs an expiry job, a
notification, and a support answer, none of which exist. **Permanent is harder
to reverse, and that is the honest cost of the recommendation.**

**3. Subscribed, then lapsed. The case nobody designs.**
**Recommendation: an unlock BOUGHT WITH CHAI IS PERMANENT AND SURVIVES
EVERYTHING. Zones opened by a subscription close when the subscription
lapses.** So the two paths never contaminate each other, and a subscriber who
lapses is left exactly where their own earning put them, never worse.
**The trap to avoid: granting Chai-equivalent unlocks for free while subscribed.
If a subscription silently marks zones unlocked, every lapsed subscriber keeps
the whole map and the free tier stops meaning anything.**

---

## THE RISK THAT DECIDES WHETHER THIS WORKS

**The earn rate is currently tuned for HATS.** Being slow to afford a hat costs
nobody anything. **Making the same rate load-bearing for LEARNING changes it
completely: too slow and the free path is a lie, too fast and the subscription
only sells impatience.**

**That balance cannot be reasoned out and must not be compiled in.** Every
number in this design is served from `tokenEconomy.ts`, and the reason is that
it WILL be wrong on the first guess and has to move without a release, on both
phones, without waiting for a store review.

---

## SEQUENCING, AND IT IS NOT NEGOTIABLE

**India implements LAST.** It is the only fork with real users who paid under
the current rules. **Setting an economy for a fork that has never shipped is a
different act from changing one people have already paid into.** Spec first,
then the dark forks, then India.
