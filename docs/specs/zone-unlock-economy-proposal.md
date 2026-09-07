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


---

# UPDATE, same day: the daily allowance, and the one thing that must not be removed

**The owner refined it to a DAILY allowance rather than open grinding:** "they
can earn chai daily and unlock certain things every day, or you can just
subscribe." Plus: **every game free for its first three plays.** The whole model
is now one sentence with no footnote:

> **Zone one free in every language. Every game free for three plays. Earn chai
> daily to unlock more, or subscribe and skip the waiting.**

**This SHRINKS the build, because most of the earning already exists.**
`lib/daily-gift` is written, tested and shipped in India and has never been
ported to any fork. Read it before designing anything: `giftChaiForStreakDay`,
`giftTierForStreakDay`, `giftRefId`, `dailyGiftFor`, with `GIFT_LADDER_CAP` and
`GIFT_DAY_ONE_CHAI` as the tuning constants. **`giftClosedCopy` and
`giftOpenedCopy` return English display copy naming Chai and are REGION: a port
must re-author them, never carry them.**

## THE REMOVAL RISK, AND IT IS NOT ABOUT PAYMENTS

The ruling retires the free-language list, and the sequencing argument offered
for it was that nobody has paid yet. **Verified against India's own contract,
that argument does not cover the actual risk.**

```
openapi.yaml   freeLanguage: { type: string }        REQUIRED at line 5819
api-zod        zod.string()                          not optional, not nullable
api-client-react  freeLanguage: string               in the shipped types
```

**`freeLanguage` is a REQUIRED, non-nullable field on `/entitlements`, and the
validation is compiled into binaries that are live in both stores (1.0.15).**
The endpoint it sits on is the one that decides what a learner may access.

**So the exposure is SHIPPED CLIENTS, not subscribers.** A learner who has never
paid a penny, on the current App Store build, breaks the same way as a paying one
if the server stops sending it. **Zero paying subscribers does not make the
removal safe and no database count can.**

**The migration that is actually safe, and it is boring on purpose:**

1. **Add** the new fields. Nothing breaks; older clients ignore what they do not
   read.
2. **Keep sending `freeLanguage`** with a truthful value for as long as any store
   build requires it. Mark it deprecated in the spec, not absent.
3. **Remove it only when the binaries that require it are out of circulation**,
   which is a store-analytics question and months away.

**A removal from a required field in a live contract is not a spec edit, it is a
client migration.** That is the reason to be careful here, and it survives the
owner's point about payments rather than being answered by it.

## THE THREE NEW QUESTIONS THE DAILY MODEL RAISES

**1. One ceiling or two?** "Certain things every day" could cap the EARNING or
the UNLOCKING. **Recommendation: cap the earning only.** One number to tune, and
a learner who has saved up is never told they may not spend their own Chai
today, which is the more insulting of the two refusals.

**2. Does unspent Chai accumulate?** **Recommendation: yes, indefinitely.** A
patient learner reaching everything eventually is the free tier working, not a
leak. Expiry is a harsher product, it needs an expiry job and a notification
nobody has built, and it punishes exactly the learner the app wants.

**3. Does the game taste share the ledger?** **Recommendation: no.** Three free
plays is a COUNT, not a currency, and mixing them means a learner can spend
their zone savings on a game replay by accident. Absorb X6's shape
(`GET /games/taste`, `taste_over` as a 402) into this one contract change, and
note the owner said **ALL games**, where some forks scoped their taste to a
subset. All and the-free-ones are different implementations and the difference
is invisible until somebody hits the game nobody freed.

---

# THE STREAK CURVE, MEASURED RATHER THAN DESCRIBED

The daily gift already scales with a streak, so the earn rate is a curve and it
already exists. **Read from `lib/daily-gift/src/index.ts` rather than summarised:**

```
giftChaiForStreakDay(n) = clamp(floor(n), GIFT_DAY_ONE_CHAI, GIFT_LADDER_CAP)
                        = clamp(floor(n), 1, 7)

day 1 -> 1 chai     day 3 -> 3     day 5 -> 5     day 7 and after -> 7
```

**Two facts fall out, and one of them answers a question that was about to be
asked of the owner.**

**THERE IS ALREADY A FLOOR, AND IT IS 1 CHAI A DAY.** The clamp guarantees it,
whatever the streak. So "does a broken streak leave the free path open" is
already yes in code: **the free path never closes, it slows.** Nobody needs to
rule on that; somebody needs to decide whether 1 is enough.

**THE RATIO IS 7 TO 1, AND THAT IS THE NUMBER THE RULING TURNS ON.** Today a
broken streak costs a hat arriving later. Under this ruling **it costs a
sevenfold slowdown in reaching your family's language**, and it lands on adults
returning to a heritage language after life got in the way, not on competitive
players. **That compounding runs against exactly the learner this product is
for.**

## THE OWNER'S CALL, AS ONE GROUP

1. **Does the streak multiplier apply to the UNLOCK currency, or only to the
   cosmetic surplus?** Splitting them keeps the reward and removes the
   punishment, and it may be the whole answer.
2. **Is 1 chai a day an acceptable floor** for someone who missed a week? It is
   already the floor; the question is only whether it is high enough now that it
   gates content rather than hats.
3. **Does a broken streak reset to zero or step down?** A step-down is forgiving
   and it is a config value, not an architecture.

**None of these is a spec question and none should be decided by an agent.**
They decide what the product says to somebody who missed a week, and that is a
sentence the owner should choose.
