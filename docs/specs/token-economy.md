# Token Economy Design Spec

**Status:** Draft, Build 32/33 planning  
**Scope:** REPORT ONLY. No production code changes, no schema migrations, no RevenueCat config changes, no new dependencies.  
**Currency name:** Tokens / "train fare tokens" (consistent with the Gujarat Express journey metaphor)  
**Today's date:** July 31, 2026

---

## §1, Ledger Design

### 1.1 Table: `token_ledger` (earn events)

Model directly on `xp_ledger` (`lib/db/src/schema.ts`). XP uses `(user_id, source, ref_id)` unique, tokens do the same.

```sql
CREATE TABLE token_ledger (
  id           serial PRIMARY KEY,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_code text       REFERENCES languages(code),  -- nullable: purchase/allaccess grants are cross-language
  source       text        NOT NULL,                    -- enum enforced in app code (see §1.3)
  ref_id       text        NOT NULL,                    -- idempotency key (see §1.4)
  amount       integer     NOT NULL CHECK (amount > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, ref_id)
);

CREATE INDEX token_ledger_user_created_idx ON token_ledger (user_id, created_at DESC);
```

**`source` enum** (enforced in application code, not a Postgres enum, same policy as `lesson_generations.kind` so adding sources is a code-only change):

| source | ref_id | language_code |
|---|---|---|
| `streak_day` | YYYY-MM-DD key in user's timezone (`localDayKey()`) | user's active language at award time |
| `zone_complete` | `lesson_group_progress.id` of the completed row | group's language |
| `express_stamp` | `lesson_group_progress.id` of the tested_out row | group's language |
| `quiz_pass` | `daily_quiz_completions.id` | quiz language |
| `quiz_perfect` | `daily_quiz_completions.id` with suffix `:perfect` | quiz language |
| `purchase` | RevenueCat transaction id from the NON_SUBSCRIPTION_PURCHASE event | NULL |
| `allaccess_monthly` | YYYY-MM billing cycle key (e.g. `2026-07`) | NULL |
| `voice_contribution_optin` | `users.id` of the opting-in user | NULL (cross-language grant) |

The `streak_day` ref_id uses the user's IANA-bucketed day key (same as `localDayKey()` in `progressMetrics.ts`) so it is idempotent across server restarts and retries.

### 1.2 Table: `token_spend_ledger` (spend events)

```sql
CREATE TABLE token_spend_ledger (
  id           serial PRIMARY KEY,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_code text       REFERENCES languages(code),  -- nullable for global items
  item         text        NOT NULL,                    -- 'station_pause' | 'express_multiplier' | 'testout_retry' | 'streak_repair'
  cost         integer     NOT NULL CHECK (cost > 0),
  ref_id       text        NOT NULL,                    -- idempotency key (client-generated UUID or server-derived)
  context_id   text,                                   -- e.g. lesson_group_id for station_pause; attempt day for streak_repair
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item, ref_id)
);

CREATE INDEX token_spend_ledger_user_created_idx ON token_spend_ledger (user_id, created_at DESC);
```

### 1.3 Balance Derivation

**Never store a counter.** The current balance is always:

```sql
SELECT
  COALESCE(SUM(e.amount), 0) - COALESCE(SUM(s.cost), 0) AS balance
FROM token_ledger e
FULL JOIN token_spend_ledger s USING (user_id)
WHERE user_id = $1;
```

Or, in practice, two separate SUMs joined in the route handler, the same pattern as `readLedgerXp()` in `artifacts/api-server/src/lib/xpEngine.ts` (lines 121-132). XP is `SUM(xp_ledger.xp)` per user/language; token balance is `SUM(earn) - SUM(spend)` per user globally.

This means balance reads are O(ledger size) but remain cheap at the expected scale (dozens of rows per user); an indexed user+created_at covers the hot path. Add a materialized balance column only if profiling shows this is a bottleneck in build 34+.

### 1.4 Concurrency / Atomicity for Spend

The critical invariant: a learner must never be able to double-spend on concurrent requests (e.g. rapidly double-tapping "Equip Station Pause").

Use `pg_advisory_xact_lock` (transaction-scoped, auto-released at commit), already in production use:
- `learning.ts` line 1151: `SELECT pg_advisory_xact_lock(hashtext('teaser:userId:languageCode'))` for teaser slot concurrency
- `phraseReports.ts` line 73: per-user lock for the rolling-hour report cap

Pattern for a Station Pause equip:

```typescript
await db.transaction(async (tx) => {
  // Serialize all spend attempts for this user.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`token_spend:${userId}`}))`);

  // Read balance inside the lock.
  const balance = await readTokenBalance(userId, tx);
  if (balance < STATION_PAUSE_COST) throw new InsufficientTokensError();

  // Check daily Station Pause cap (≤2 active).
  const activeCount = await countActiveStationPauses(userId, tx);
  if (activeCount >= 2) throw new StationPauseLimitError();

  // Write spend row, idempotent via ON CONFLICT DO NOTHING + check rows affected.
  await tx.insert(tokenSpendLedgerTable).values({ userId, item: 'station_pause', cost: STATION_PAUSE_COST, refId: clientRef }).onConflictDoNothing();
});
```

The `(user_id, item, ref_id)` unique constraint provides a secondary safety net against duplicate inserts.

### 1.5 Idempotency for Purchase Credits

RevenueCat `NON_SUBSCRIPTION_PURCHASE` events carry a `transaction_id` field (the App Store / Play Store transaction identifier). This becomes the `ref_id` for the `purchase` earn row. The `UNIQUE (user_id, source, ref_id)` constraint ensures the same App Store transaction can never credit tokens twice even if the webhook fires more than once (RevenueCat does retry on 5xx). Insert with `ON CONFLICT DO NOTHING` and always return `200` to RevenueCat.

---

## §2, Earn-Rate Table & Economy Tuning

### 2.1 XP Anchors (from `artifacts/api-server/src/lib/xpEngine.ts`)

| Activity | XP earned |
|---|---|
| Pronunciation attempt, full credit (perfect/great), diff 1 | 10 XP |
| Pronunciation attempt, full credit, diff 2 | 15 XP |
| Pronunciation attempt, full credit, diff 3 | 20 XP |
| Pronunciation attempt, half credit (good/almost), diff 1 | 5 XP |
| Word-match / listen-and-pick game session | 15 XP base |
| Phrase-builder game session | 20 XP base |
| Speed-round game session | 25 XP + 10 accuracy bonus |
| Daily quiz, correct answer | 10 XP per correct |
| Daily quiz, perfect (5/5) | +20 XP bonus (max 70 XP total) |
| Script Trace chapter | 30 XP flat |

A typical free learner who does 3-5 pronunciation attempts at difficulty 1-2 earns **40-70 XP per day**. A daily quiz (Plus-only) can add up to 70 XP on top. The daily quiz XP is disproportionately large relative to practice; see §2.5 for the implication.

### 2.2 Proposed Token Earn Rates

| Source | Tokens | Trigger | Notes |
|---|---|---|---|
| `streak_day` | **2** | First qualifying attempt (passing band) each calendar day | Bucketed by `localDayKey()` in user's IANA timezone, same as streak math. Fired from `POST /attempts` response path when the day-bucket is new. |
| `zone_complete` | **5** | `deriveAndLatchUnlock` writes a `completed` latch for the first time | Same server moment as the zone-complete confetti. A zone is 7 phrases; this is a meaningful milestone. |
| `express_stamp` | **10** | Test-out verdict passes: `lesson_group_progress.status = 'tested_out'` | Hard to earn; worth the equivalent of 5 streak-days. |
| `quiz_pass` | **2** | Daily quiz score >= 3/5 | Plus-only surface. Same as a streak-day earn. |
| `quiz_perfect` | **3** | Daily quiz score 5/5 (additive to quiz_pass; ref_id suffixed `:perfect`) | Total 5 tokens for a perfect quiz, matches a zone completion. |
| `purchase` | varies | RevenueCat `NON_SUBSCRIPTION_PURCHASE` webhook | Tier-dependent; see §3.2. |
| `allaccess_monthly` | **40** | Monthly All-Access grant; see §2.6 | On-read via cron or account load. |
| `voice_contribution_optin` | **10** | One-time grant when learner enables the voice contribution toggle for the first time (`PATCH /account/preferences` sets `voiceContributionEnabled = true`) | One-time only; idempotent via `ref_id = users.id`. Cross-language (language_code NULL). See `docs/specs/voice-data-program.md` §9 Finding 6. |

### 2.3 Station Pause: "5-7 Days for a Free User" Math

Station Pause price: **10 tokens**.

A consistent free learner:
- Day 1: 1 streak-day earn = 2 tokens. Running: 2.
- Day 2: 2 tokens. Running: 4.
- Day 3: 2 tokens. Running: 6. (Optionally completes a zone = +5 → 11 tokens, enough already.)
- Day 4: 2 tokens. Running: 8.
- Day 5: 2 tokens. Running: 10. **Threshold reached.**

So without zone completions: exactly 5 days. With one zone completion along the way (likely in the first week): 3-4 days. The "5-7 days" framing accounts for learners who miss a day or two in the window.

This cadence means a free learner who is consistently engaged can protect one streak freeze per week, exactly the "occasional safety net" framing rather than a persistent shield.

### 2.4 Express Multiplier Pricing Rationale

Express Multiplier price: **25 tokens** (2.5x Station Pause).

Reasoning:
- A free learner earns ~14 tokens/week (7 days × 2 tokens) plus zone completions.
- At 25 tokens, the Multiplier costs roughly 10-12 days of streak-only earn.
- It is a deliberate occasional treat, not a routine purchase. A learner who buys it every week would need to complete zones or purchase tokens.
- 15-30 minute window: during the window, XP from all pronunciation attempts is doubled. At 10-20 XP per attempt × 2, a focused session can earn 200-400 bonus XP.
- Positioning: "make this learning session count double" rather than "grind XP."

### 2.5 Streak Repair Pricing

Streak Repair price: **30 tokens** (~3x Station Pause).

Reasoning:
- Repairs a streak broken within the past 48 hours (one missed day).
- 48-hour window: tight enough to stay meaningful, long enough to cover a busy travel day or illness.
- 30 tokens = 15 streak-days of earn without other sources, makes casual repair feel slightly out of reach but achievable for committed learners.
- Price is intentionally above Station Pause to reflect asymmetry: Station Pause is prevention (forward-looking), Streak Repair is restoration (backward-looking, higher emotional value).

**Important flag:** The daily quiz earns up to 5 tokens per day (Plus-only, pass + perfect bonus). A Plus learner who plays the quiz daily earns 35-40 tokens/week vs. a free learner's 14 tokens/week. This does not create a fairness problem because Plus learners also pay for the service. However, if the quiz is the sole optimization target for a Plus learner, they could accumulate Station Pauses faster than intended (~5-6 per month from quiz alone). Consider a soft cap: at most 1 streak_day earn per day (already guaranteed by the ref_id) and at most 1 quiz_pass + 1 quiz_perfect per day (already guaranteed since the daily quiz fires exactly once per `quiz_date`). No additional cap needed.

**Script Trace token earn:** Script Trace is deliberately excluded from the earn table above. Script Trace XP is 30 per chapter (large), and it is not a daily-cadence activity. Adding a token earn here would create a farming vector for learners who grind chapters. If Script Trace earn is added in a future build, it should be once-per-character (not once-per-chapter-per-day) and should be small (1-2 tokens).

### 2.6 All-Access Monthly Token Allowance

All-Access subscribers receive **40 tokens on the first login of each billing month**.

Reasoning:
- 40 tokens = 4× Station Pauses, covering one streak-save per week.
- Relative to free earn: a free learner earns ~14/week from streaks (without zones), so 40 tokens is ~3 weeks of free-learner earn, a meaningful bonus.
- "Permanent small XP bonus" (the approved plan decision) is a separate concern handled by the XP multiplier chain in `xpEngine.ts` and is out of scope for build 32.

Grant mechanism (build 33): lazy grant on `GET /entitlements` (the account reconcile endpoint), check whether the current billing month's `allaccess_monthly` row exists for the user; if not, insert it inside a transaction. This avoids a standalone cron and keeps the grant tied to an authenticated request. The billing month key is `YYYY-MM` in UTC (same as RevenueCat's `current_period_end` month). Do not grant if the user's subscription is expired or canceled.

---

## §3, RevenueCat + App Store Groundwork

### 3.1 Consumables vs. Entitlements in RevenueCat

RevenueCat entitlements (like `plus`, `family`) are attached to subscription products. When a subscriber's entitlement is active, RevenueCat sends lifecycle events (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`) that `applyFromEvent` in `revenuecatSync.ts` translates into subscription columns on the user row.

Consumable IAP products are **never attached to entitlements**. They are one-shot purchases that credit a quantity and have no subscription lifecycle. RevenueCat sends a single `NON_SUBSCRIPTION_PURCHASE` event per consumable purchase.

**What `concernedEntitlement` does for consumable events (critical finding, see §Findings):**

`concernedEntitlement` in `revenuecatSync.ts` (lines 77-90) reads `event.entitlement_ids` and `event.entitlement_id`. For a consumable purchase, RevenueCat sends neither, both fields are null or absent. The current code path:

```typescript
const ids = /* both null → */ null;
if (ids === null) return "plus";  // ← WRONG for consumables
```

This means a consumable token purchase would currently be processed as a Plus subscription grant. This is a **critical bug that must be fixed in build 32 before consumable SKUs go live.** The fix: add `NON_SUBSCRIPTION_PURCHASE` to `IGNORED_EVENT_TYPES` as a temporary guard, then build the proper consumable handler branch.

> **RESOLVED, August 13, 2026.** Both halves shipped, and the fallback itself was the defect: `concernedEntitlement` now returns `null` when an event names no entitlement, so no event can grant, extend or modify a subscription without saying which one. `NON_SUBSCRIPTION_PURCHASE` is ignored for subscription purposes as well, so the guard holds by event type AND by the absence of a product match. Pinned in `artifacts/api-server/src/lib/revenuecatSync.test.ts`.

### 3.2 Proposed Token SKUs

> **SUPERSEDED, August 13, 2026, do not build against this table.** The four proposed `bolo_tokens_*` SKUs at 15/40/85/200 were never created. What shipped is three App Store consumables mapped to the existing web Chai packs, in `artifacts/api-server/src/lib/chaiPacks.ts`, the single catalog both platforms read:
>
> | Apple product id | Pack | Chai | Price |
> |---|---|---|---|
> | `bolo_chai_cutting` | small | 25 | $1.99 |
> | `bolo_chai_kulhad` | medium | 75 | $4.99 |
> | `bolo_chai_kettle` | large | 200 | $9.99 |
>
> The paragraph below is wrong in its second half and is kept only for the record: quantities are NOT carried in the webhook payload and are NOT set in the RevenueCat dashboard. The webhook resolves the pack from the product id and reads the amount from the server catalog, so a store misconfiguration cannot change what a learner is credited.

RevenueCat dashboard: create as consumable (non-subscription) products. Do NOT attach them to any entitlement.

| SKU ID | Display name | Tokens | Price | Notes |
|---|---|---|---|---|
| `bolo_tokens_starter` | Starter Pack | 15 | $0.99 | Entry point; a Station Pause + a little extra |
| `bolo_tokens_commuter` | Commuter Pack | 40 | $2.99 | A month of casual protection |
| `bolo_tokens_alldayrider` | All Day Rider | 85 | $4.99 | ~8 Station Pauses; value tier |
| `bolo_tokens_season` | Season Ticket | 200 | $9.99 | Power user; 20 Station Pauses |

Pricing anchors:
- Starter Pack is just above the "Station Pause floor" (10 tokens) so it buys one immediately with surplus.
- Commuter Pack lands near the All-Access monthly grant (40 tokens) so it is a single-month top-up equivalent.
- All Day Rider and Season Ticket follow standard 2× and 4× bulk discount ladders.

Quantities are set at time of product creation in the RevenueCat dashboard and are NOT stored in the app, the webhook payload carries the quantity (or the SKU determines the quantity via a server-side lookup table).

### 3.3 New Webhook Handler Specification

**File to change:** `artifacts/api-server/src/lib/revenuecatSync.ts` and `artifacts/api-server/src/routes/revenuecat.ts`.

Step 1: Add `NON_SUBSCRIPTION_PURCHASE` to `IGNORED_EVENT_TYPES` as a temporary guard (prevents the accidental Plus-grant bug until the handler is ready).

Step 2: In build 32, remove it from `IGNORED_EVENT_TYPES` and add a handler branch in the route (`routes/revenuecat.ts`):

```typescript
// In POST /revenuecat/webhook, after the TRANSFER branch:
if (event.type === 'NON_SUBSCRIPTION_PURCHASE') {
  const tokenCredit = creditFromConsumableEvent(event);
  if (tokenCredit) {
    await creditTokens(tokenCredit); // inserts into token_ledger with ON CONFLICT DO NOTHING
  }
} else {
  const apply = applyFromEvent(event);
  if (apply) await applyRevenueCatState(apply);
}
```

`creditFromConsumableEvent` (new pure function in `revenuecatSync.ts`) extracts:
- `app_user_id` (the Clerk user id)
- `product_id` (maps to a token quantity via the SKU table)
- `transaction_id` (becomes the `ref_id` for idempotency)

The SKU→quantity map lives in a small constant in `revenuecatSync.ts`:

```typescript
const TOKEN_SKU_QUANTITIES: Record<string, number> = {
  bolo_tokens_starter:     15,
  bolo_tokens_commuter:    40,
  bolo_tokens_alldayrider: 85,
  bolo_tokens_season:      200,
};
```

If `product_id` is not in the map, log a warning and return null (the webhook 200s, no retry needed, just a Sentry alert).

### 3.4 RevenueCat Dashboard Config Steps

1. Create four consumable products (type: Consumable/Non-Subscription) with SKU IDs above under the existing app.
2. Do **not** attach them to any entitlement, they carry no access grant.
3. In the webhook configuration (Settings > Integrations > Webhooks), confirm `NON_SUBSCRIPTION_PURCHASE` is included in the event types sent (it is on by default in RevenueCat).
4. No offering changes required, consumables are sold via direct purchase calls in the app, not through RevenueCat offerings (which are subscription-oriented).

### 3.5 App Store Review Considerations

**Restore purchases:** Apple's App Store Review Guideline 3.1.1 classifies consumables as non-restorable. The "Restore Purchases" button must be present (required by Apple) but must NOT restore consumables, it only restores subscriptions. The current `RevenueCatPaywallView` or equivalent must call `restorePurchases()` (which only syncs entitlements) rather than attempting to re-grant consumed tokens.

**Reviewer demo path:** App Store reviewers must be able to reach the token store and (if they attempt a purchase) see the correct flow. They test with Apple Sandbox accounts and will expect the token balance to update. Ensure the sandbox transaction flows through the webhook. Critically, the earn path (streaks, zone completions) must be reachable without a purchase so reviewers can evaluate the consumable in context. Per Guideline 3.1.1 commentary: reviewers have cited apps that make the paid consumable the only useful path.

**Scope of consumable:** Tokens are used solely within Bolo! (streak freeze, XP boost, retry, repair). This is well within 3.1.1 scope, in-app consumables for digital services in the same app.

**`VIRTUAL_CURRENCY_TRANSACTION` in `IGNORED_EVENT_TYPES`:** This event type is a RevenueCat-internal one (used for internal virtual currency accounting, not standard App Store consumables). It is separate from and should not be confused with `NON_SUBSCRIPTION_PURCHASE`. Leave `VIRTUAL_CURRENCY_TRANSACTION` in `IGNORED_EVENT_TYPES`. The correct event type to handle is `NON_SUBSCRIPTION_PURCHASE`.

---

## §4, Surface Map

### 4.1 Balance Display

**Constraint:** The boarding pass on web `home.tsx` is the sole progression CTA. Do not add a token-balance CTA that competes with it.

**Recommended placement:** The `StatCell` strip in `artifacts/gujarati-coach/src/pages/home.tsx` (lines 415-440). Currently it shows: Streak, Speaking Streak, Total XP, Mastered. Add Token Balance as a fifth StatCell:

```tsx
<StatCell
  icon={<Train className="w-6 h-6" fill="currentColor" />}
  value={summary?.tokenBalance ?? 0}
  label="Tokens"
  delay={0.40}
/>
```

This requires `GET /progress/summary` (learning.ts line 1422) to include a `tokenBalance` field, a single `SUM(earn) - SUM(spend)` query, additive to the existing summary response (optional field for mobile back-compat per rule in §3 of CODEBASE-FACTS.md).

**Mobile:** The equivalent stats surface is `artifacts/bolo-mobile/app/(app)/(tabs)/index.tsx` (home screen). Mirror the StatCell pattern.

**Secondary surface:** The account/subscription screen (`artifacts/bolo-mobile/app/(app)/account/subscription.tsx` and the web equivalent) shows the All-Access monthly allowance amount.

**Paywall screen:** `artifacts/bolo-mobile/app/(app)/paywall.tsx` and `artifacts/gujarati-coach/src/pages/*` paywall surfaces, can reference token purchase as a secondary action below the subscription CTA.

### 4.2 Earn Moment Toasts

All token earn events must produce a non-blocking toast using the existing `MilestoneToast` pattern in `artifacts/gujarati-coach/src/pages/practice.tsx` (line 45 import; lines 406-428 show the toast state machine). The mobile equivalent uses the same pattern in `artifacts/bolo-mobile/app/(app)/practice/[id].tsx`.

| Earn moment | Server trigger | Response field | Toast copy |
|---|---|---|---|
| Streak-day | POST /attempts, when the attempt advances the day-bucket streak | `tokensEarned: 2` on attempt response | "+2 fare tokens, keep going!" |
| Zone complete | `deriveAndLatchUnlock` in `lessonGroupAccess.ts` writes a `completed` row | `tokensEarned: 5` on the GET categories or journey listing response (same response that carries the latch status) | "+5 fare tokens, zone complete!" |
| Express stamp | POST /lesson-groups/:id/testout verdict: `status: "tested_out"` | `tokensEarned: 10` on testout response | "+10 fare tokens, Express stamp!" |
| Quiz pass | POST /games/daily-quiz/complete with score >= 3 | `tokensEarned` on quiz completion response | "+2 fare tokens" |
| Quiz perfect | POST /games/daily-quiz/complete with score 5/5 | `tokensEarned: 5` (combined pass+perfect) | "+5 fare tokens, perfect quiz!" |

The response field `tokensEarned` is a new optional integer field on each endpoint's response shape. The existing `xpAwarded` field sits alongside it, both display on the result card.

**Timing:** Earn writes happen in the same server transaction as the event (attempt write, latch write, quiz completion). The `tokensEarned` field on the response is the actual amount inserted, or 0 if none (e.g. retry band).

### 4.3 Spend Moments

**Station Pause (streak freeze):**
- Server: a new `POST /streaks/pause` endpoint that runs the advisory-lock spend transaction.
- Web trigger: when the streak-break intercept fires (the server detects that today's first attempt would reset the streak). This is currently implicit, the streak-break is visible in the StatCell the day after. In build 33, the web home screen intercepts a day-1-streak on returning after a gap and surfaces the "Equip Station Pause?" dialog.
- Mobile trigger: same, in `artifacts/bolo-mobile/app/(app)/(tabs)/index.tsx`.
- Auto-equip rule: if a learner has <= 2 active Station Pauses equipped, the server auto-equips on the first post-gap attempt (no UI prompt). If they have 0, present the "would you like to spend 10 tokens to protect your streak?" dialog.

**Express Multiplier:**
- Web: the result card in `artifacts/gujarati-coach/src/pages/practice.tsx` (around line 1231 where XP totals render). After a practice session ends, the result card offers the Multiplier if one is not already active.
- Mobile: same result card flow in `artifacts/bolo-mobile/app/(app)/practice/[id].tsx` (line 1231 area).
- Server: `POST /tokens/express-multiplier` activates a 15-30 minute window; the XP engine in `xpEngine.ts` checks for an active Multiplier before `computePronunciationXp`.

**Test-Out Retry:**
- First retry is always free (build 33). Subsequent retries within a cooldown window cost tokens.
- Server trigger: the existing test-out throttle in `learning.ts` (line 2236 comment about the 1-hour log) is the anchor for the "first free" gate.

**Streak Repair:**
- Web and mobile: account screen or a dedicated post-gap modal that fires when the streak drops from N to 0.
- 48-hour window enforced server-side by checking `attempts.created_at` of the most recent attempt before the gap.

### 4.4 All-Access Allowance Presentation

The monthly grant fires lazily on `GET /entitlements` (the account reconcile call that fires once per app load). The entitlements response already returns to account screens; add a `tokensGrantedThisMonth: boolean` field so the client can show a one-time "40 tokens added to your account" banner.

Web: `artifacts/gujarati-coach/src/pages/account` surfaces (subscription tab).  
Mobile: `artifacts/bolo-mobile/app/(app)/account/subscription.tsx`.

### 4.5 Spend Vignette: Chaiwala

Every confirmed token spend triggers a platform vignette lasting approximately 1.5 seconds before the result chip appears. The vignette is purely client-side and decorative: the spend endpoint commits the grant first, and the vignette plays after the server response. Animation failure (timeout, frame drop, reduced-motion) never blocks or delays the grant.

**Character:** Chaiwala is a new flat train-world character asset sized and styled to match the Gujarat Express world. The asset is to be drawn for this build task; it is not derived from any existing mockup. Chaiwala is used as a proper noun in code identifiers, copy, and documentation, the same convention as Bolo. Chaiwala is reused in two additional contexts:
- Chaiwala's chai stall serves as the backdrop for the Zone 1 conversation capstone (cross-reference `docs/specs/progression-completion.md`, the chai stall scenario).
- Chaiwala may appear as optional scenery on the journey map.

**Bolo in the vignette:** The canonical Bolo PNG (one of the five approved assets) appears at Chaiwala's cart using whole-image transforms only, consistent with the canonical mascot rule.

**Coin arc:** 1 to 3 coin sprites animate along an arc from the balance display toward Chaiwala. The coin count scales with spend size:

| Spend item | Coin count |
|---|---|
| Station Pause | 1 |
| Express Multiplier | 2 |
| Test-out retry | 1 |
| Streak Repair | 3 |

**Per-spend counter goods** (the good appears on Chaiwala's cart counter during the vignette):

| Spend item | Good that appears |
|---|---|
| Station Pause | Chai glass with steam |
| Express Multiplier | Two chai glasses |
| Test-out retry | A small ticket |
| Streak Repair | A mended item |

**Balance tick-down:** The displayed token balance animates downward in sync with the coin arc, reaching the new balance when the arc completes.

**Result chip:** After the arc lands, the result chip confirming the granted item pops in using the existing motion-feedback spring convention.

**Skippable:** A tap anywhere during the vignette skips to the result chip immediately. The skip path must still show the correct final balance and the result chip.

**Reduced-motion:** When the platform's reduced-motion preference is active (`prefers-reduced-motion: reduce` on web; `useReducedMotion()` on mobile via the existing framer-motion hook), the vignette is replaced by an instant receipt: the counter good appears statically, the balance jumps to its new value without animation, and the result chip appears without a spring. The grant is identical either way.

**Timing constants:** The vignette duration (1.5 s), coin arc duration (0.9 s), balance tick-down duration (0.8 s), and result chip spring parameters are named constants that join the shared motion tuning conventions alongside the existing practice result-card and confetti timing constants.

**Failure contract:** If the vignette component throws or the animation frame is unavailable, the spend result is shown as a plain static receipt. The granted item is never conditional on the vignette completing.

---

## §5, Daily Lesson Limit Recommendation

### 5.1 Current Status

The daily new-lesson cap is **fully disabled** as of July 30, 2026 (Task 849):

- `artifacts/api-server/src/lib/entitlements.ts` line 279: `dailyNewLessonLimit(_plan: Plan): number | null { return null; }`
- The constant `FREE_DAILY_NEW_LESSON_CAP = 3` (line 29) is dead code, the function that should use it ignores its `_plan` argument.
- The function comment (lines 273-278) explicitly states the cap was retired additively, with the intent to reinstate by reverting the one function.
- Two call sites exist: `learning.ts` lines 493 (lesson fetch path) and 778 (lesson generation path). Both call `dailyLessonCapDenial` which calls `dailyNewLessonLimit`, which returns `null`, so `dailyLessonCapDenial` immediately returns `null`, the 402 is never emitted.
- The `lesson_generations` table and its write/read helpers (`recordLessonGeneration`, `countLessonGenerationsToday`) remain intact and continue to record.
- No client-side gates exist that reference the daily lesson limit by name (confirmed: searching the web app and mobile app shows no `daily_lesson_limit` string in client code, only the server-side route emits that reason code in `openapi.yaml`, but since it's never sent, clients receive it only if the function is re-enabled).

### 5.2 Argument for Removal in Build 32

The daily lesson limit was designed to create monetization pressure, "you've hit your free lessons for today, upgrade for unlimited." With the Token economy:

- Token earn is the primary friction surface for free users. A learner who wants more streaks, more protection, and more multipliers grinds practice and earns tokens organically.
- The lesson limit friction competes with Token friction and undermines the "never monetize failed attempts, never monetize learning itself" principle. Limiting how many topics a free learner can open in a day is limiting learning, which is antithetical to the brand.
- The Bolo Quiz (Plus-only) and sentence-stage content (Plus-only) already make Plus valuable without a lesson cap.
- The tracking infrastructure (`lesson_generations` table, `recordLessonGeneration`, `countLessonGenerationsToday`) has ongoing write cost (one row per AI generation per user) with zero product benefit as long as the function returns null.

### 5.3 Blast Radius of Removal

Complete removal is safe and small:

**Server files to change:**
- `artifacts/api-server/src/lib/lessonLimits.ts`, delete entire file (73 lines). Remove the import and the two call sites from `artifacts/api-server/src/routes/learning.ts` (lines 81 import, 493, 778).
- `artifacts/api-server/src/lib/entitlements.ts`, delete `FREE_DAILY_NEW_LESSON_CAP` (line 29) and `dailyNewLessonLimit` function (lines 273-281).
- `lib/db/src/schema.ts`, remove `lessonGenerationsTable` definition and the `lesson_generations` table. Requires a migration.
- `lib/db/drizzle/`, add migration to `DROP TABLE lesson_generations`.
- `lib/api-spec/openapi.yaml`, remove the `daily_lesson_limit` reason from the `upgrade_required` reason enum, and remove from 402 response docs on lesson endpoints.

**Client impact:** Zero. The `daily_lesson_limit` 402 reason was never emitted after July 30, 2026. No client code shows the limit-specific UI path.

**Test impact:** Search `artifacts/api-server/src` for `dailyLessonCapDenial` and `lesson_generations` in test files. If any test asserts the unlimited state (limit=null returns null), delete those tests, they test dead behavior. There are no tests that assert the cap fires (confirmed by: cap has been disabled since before any tests were written post-July-30).

**Recommended:** Remove dead cap code in build 32 alongside Token ledger scaffolding. This is a code-health improvement that reduces the maintenance surface by ~100 lines and eliminates ongoing write I/O to a table no route reads.

---

## §6, Build 32/33 Task Breakdown

Each entry: title / files / size (S=small <1hr, M=medium 1-4hr, L=large >4hr) / slice / depends-on.

---

### Build 32

**(a) Token ledger migration + schema**

- Title: Add `token_ledger` and `token_spend_ledger` tables
- Files: `lib/db/src/schema.ts`, new migration file in `lib/db/drizzle/`
- Size: S
- Slice: 32
- Depends-on: Nothing
- Notes: Follow `xp_ledger` pattern exactly. Add Drizzle table objects. Validate via `db-drift` and `db-migrations` checks.

**(b) Token earn hooks**

- Title: Write token earn rows from attempt, quiz, and zone-complete paths
- Files: New `artifacts/api-server/src/lib/tokenEngine.ts` (mirrors `xpEngine.ts` structure); `artifacts/api-server/src/routes/learning.ts` (POST /attempts hook); `artifacts/api-server/src/routes/games.ts` (daily quiz completion hook); `artifacts/api-server/src/lib/lessonGroupAccess.ts` (`deriveAndLatchUnlock` zone-complete hook)
- Size: M
- Slice: 32
- Depends-on: (a)
- Notes: `tokensEarned` field added to attempt response and quiz completion response (optional, for mobile back-compat). Streak-day earn: in the POST /attempts response path, after the XP ledger write, check if the day-bucket is new (compare to yesterday using `localDayKey()`); if new, write `streak_day` earn row and include `tokensEarned: 2` in the response. Zone earn: `deriveAndLatchUnlock` returns `tokensEarned` alongside the existing unlock status when it writes a new `completed` row.

**(c) Station Pause spend endpoint + streak-intercept server logic**

- Title: Station Pause equip and streak-freeze enforcement
- Files: New route `POST /tokens/station-pause` in `artifacts/api-server/src/routes/tokens.ts`; `artifacts/api-server/src/lib/tokenEngine.ts` (spend helper); `lib/api-spec/openapi.yaml` (new endpoint); regenerate `lib/api-client-react` and `lib/api-zod`
- Size: M
- Slice: 32
- Depends-on: (a), (b)
- Notes: Advisory-lock pattern per §1.4. Returns 402 `insufficient_tokens` when balance < 10. Returns 422 `station_pause_limit` when 2 pauses already active. Auto-equip logic on POST /attempts: if a Station Pause is equipped and today is the first attempt after a gap day, the streak is NOT reset and the Station Pause is consumed (write to `token_spend_ledger` with the attempt's day-key as context_id).

**(d) Express Multiplier spend endpoint + XP injection**

- Title: Express Multiplier 2x XP window
- Files: New route `POST /tokens/express-multiplier` in `artifacts/api-server/src/routes/tokens.ts`; `artifacts/api-server/src/lib/xpEngine.ts` (add multiplier check); `artifacts/api-server/src/lib/tokenEngine.ts`; `lib/api-spec/openapi.yaml`; regenerate clients
- Size: M
- Slice: 32
- Depends-on: (a)
- Notes: A new `token_spend_ledger` row with `item='express_multiplier'` and `context_id=ISO8601_expiry` marks the active window. `computePronunciationXp` gains a `multiplierActive` parameter (checked against the user's active multiplier row); when active, doubles the base XP. The multiplier is NOT retroactive, only attempts during the active window get 2x.

**(e) RevenueCat `NON_SUBSCRIPTION_PURCHASE` handler**

- Title: Wire consumable token purchases through the RevenueCat webhook
- Files: `artifacts/api-server/src/lib/revenuecatSync.ts` (add `IGNORED_EVENT_TYPES` guard first, then new `creditFromConsumableEvent` function); `artifacts/api-server/src/routes/revenuecat.ts` (add NON_SUBSCRIPTION_PURCHASE branch); `artifacts/api-server/src/lib/tokenEngine.ts` (consume handler)
- Size: M
- Slice: 32
- Depends-on: (a)
- Notes: **CRITICAL:** First commit adds `NON_SUBSCRIPTION_PURCHASE` to `IGNORED_EVENT_TYPES` to prevent the accidental-Plus-grant bug (see §Findings). Second commit implements the real handler and removes it from ignored. SKU quantity map is a constant in `revenuecatSync.ts`. RevenueCat dashboard: create consumable products (no entitlement attachment) before this goes live.

**(f) Token balance on `GET /progress/summary`**

- Title: Expose token balance in the progress summary endpoint
- Files: `artifacts/api-server/src/routes/learning.ts` (summary handler, ~line 1422); `lib/api-spec/openapi.yaml`; regenerate clients
- Size: S
- Slice: 32
- Depends-on: (a)
- Notes: Add `tokenBalance: integer` (optional, default 0) to the progress summary response. Single `SUM(earn) - SUM(spend)` query. The web home StatCell and mobile home stats bar consume this field.

**(g) Remove daily lesson limit dead code**

- Title: Delete `lesson_generations` table and dead cap code
- Files: `artifacts/api-server/src/lib/lessonLimits.ts` (delete file); `artifacts/api-server/src/lib/entitlements.ts` (remove cap constant + function); `artifacts/api-server/src/routes/learning.ts` (remove 2 call sites and import); `lib/db/src/schema.ts` (remove table); new migration DROP TABLE `lesson_generations`; `lib/api-spec/openapi.yaml` (remove `daily_lesson_limit` reason)
- Size: S
- Slice: 32
- Depends-on: Nothing (independent, can be done in parallel with (a))
- Notes: No client changes. No test assertions to remove (cap was disabled before tests were written post-July-30). Confirm by grepping `lesson_generations` and `daily_lesson_limit` in test files before deleting.

**(h) Chaiwala spend vignette (client)**

- Title: Chaiwala spend vignette, coin arc, counter goods, balance tick
- Files: New `artifacts/gujarati-coach/src/components/ui/ChaiwalaVignette.tsx` (web); new `artifacts/bolo-mobile/components/ui/ChaiwalaVignette.tsx` (mobile); shared motion timing constants (co-located with existing practice result-card and confetti timing constants in each artifact); new Chaiwala flat character asset (SVG or PNG, drawn for this task, sized for train-world scale)
- Size: M
- Slice: 32
- Depends-on: (c), (d)
- Notes: Plays after the spend endpoint responds successfully; the grant is committed server-side before the vignette begins and is never blocked by it. Coin count and counter good per §4.5. Reduced-motion path must produce an instant static receipt with the correct final balance and result chip, no arc, no spring, no tick. Skippable on tap at any point. Chaiwala asset is a new flat train-world character drawn for this task (not sourced from any mockup or existing asset). Bolo rendered in the vignette must use a canonical PNG with whole-image transforms only. The vignette component catches its own errors and falls back to the static receipt. Timing constants (arc 0.9 s, tick 0.8 s, total 1.5 s, result-chip spring params) are named exports so they can be referenced by the Zone 1 capstone backdrop and journey-map scenery reuses in later tasks.

---

### Build 33

**(a) Test-out retry spend endpoint + first-free gate**

- Title: Token-gated test-out retries (first attempt always free)
- Files: `artifacts/api-server/src/routes/learning.ts` (test-out route, ~line 2140+); `artifacts/api-server/src/lib/tokenEngine.ts`; `lib/api-spec/openapi.yaml`; regenerate clients
- Size: M
- Slice: 33
- Depends-on: Build 32 (a), (e)
- Notes: The test-out throttle log (`lesson_group_testouts`) already exists. Gate: if this is the user's first attempt at this group in the current cooldown window, no token cost. Subsequent retries within the window cost 5 tokens (one-half Station Pause). Server checks and deducts inside a transaction before sampling phrases.

**(b) Streak Repair spend endpoint + 48h window enforcement**

- Title: Token-gated streak repair within 48 hours of a streak break
- Files: New route `POST /tokens/streak-repair` in `artifacts/api-server/src/routes/tokens.ts`; `artifacts/api-server/src/lib/tokenEngine.ts`; `lib/api-spec/openapi.yaml`; regenerate clients
- Size: M
- Slice: 33
- Depends-on: Build 32 (a), (b)
- Notes: The repair endpoint checks the user's attempt history to confirm a gap within 48 hours. On success, inserts a synthetic `streak_day` earn row for the missed day (making `computeStreakDays` see a continuous chain) AND a `streak_repair` spend row in `token_spend_ledger`. The earn row for the missed day uses the missed `localDayKey` as both `ref_id` and `source='streak_day'`, this re-uses the idempotency key so a double-repair is impossible.

**(c) All-Access monthly token allowance grant**

- Title: Monthly 40-token grant for All-Access subscribers
- Files: `artifacts/api-server/src/routes/learning.ts` or `entitlements.ts` (lazy grant on reconcile); `artifacts/api-server/src/lib/tokenEngine.ts`; `lib/api-spec/openapi.yaml` (add `tokensGrantedThisMonth` flag to entitlements response); regenerate clients
- Size: S
- Slice: 33
- Depends-on: Build 32 (a)
- Notes: Lazy grant on `GET /entitlements`. Check `token_ledger` for an `allaccess_monthly` row with `ref_id = YYYY-MM`. If absent and user tier is plus, insert it inside a transaction. Return `tokensGrantedThisMonth: true` so the client can show a one-time banner.

**(d) Token surfaces on web**

- Title: Token balance in stats strip, earn toasts, Station Pause intercept dialog, Multiplier offer card
- Files: `artifacts/gujarati-coach/src/pages/home.tsx` (StatCell + Station Pause intercept dialog); `artifacts/gujarati-coach/src/pages/practice.tsx` (earn toast state, Multiplier offer card on result); new `artifacts/gujarati-coach/src/components/ui/station-pause-dialog.tsx`; new `artifacts/gujarati-coach/src/components/ui/multiplier-offer-card.tsx`
- Size: L
- Slice: 33
- Depends-on: Build 32 (c), (d), (f)
- Notes: Earn toasts use the existing `MilestoneToast` pattern (already used for streak milestones at lines 406-428 of `practice.tsx`). The result card already renders `xpAwarded` (line 1301); add `tokensEarned` alongside it. The Station Pause intercept dialog fires in `home.tsx` when `summary.tokenBalance >= 10` and the user's streak would break (detect via `summary.currentStreakDays > 0` + no attempt yet today).

**(e) Token surfaces on mobile**

- Title: Mobile parity, token balance, earn toasts, Station Pause intercept, Multiplier offer
- Files: `artifacts/bolo-mobile/app/(app)/(tabs)/index.tsx` (home stats + intercept); `artifacts/bolo-mobile/app/(app)/practice/[id].tsx` (earn toast, result card, Multiplier offer); new mobile components for dialogs
- Size: L
- Slice: 33
- Depends-on: Build 32 (c), (d), (f); Build 33 (d) for reference
- Notes: Mirror the web surfaces. The mobile practice result card already shows `xpAwarded` (line 1231 area); `tokensEarned` is additive. Mobile must handle the `tokensEarned` field as an optional field on the attempt response (it is undefined for older server versions that haven't deployed build 32).

---

## Findings: Where Reality Diverged

**Finding 1 (CRITICAL), Consumable purchases would accidentally grant Plus today.**

The approved plan assumed a clean "NON_SUBSCRIPTION_PURCHASE is a no-op" until we implement the handler. Reality: `concernedEntitlement()` in `revenuecatSync.ts` lines 81-86 returns `"plus"` when `entitlement_ids` is null or empty. RevenueCat sends `NON_SUBSCRIPTION_PURCHASE` with no entitlement fields (consumables have none). Result: a consumable token purchase today would write `tier: 'plus'` to the user's row, a free Plus grant. **Build 32 task (e) must add `NON_SUBSCRIPTION_PURCHASE` to `IGNORED_EVENT_TYPES` as its first commit**, before any consumable SKUs are created in the RevenueCat dashboard.

**Finding 2, `VIRTUAL_CURRENCY_TRANSACTION` is already in `IGNORED_EVENT_TYPES` and should stay there.**

This is a separate RevenueCat-internal event type, distinct from `NON_SUBSCRIPTION_PURCHASE`. The plan's question about whether it needs removal is: no. Leave it. The correct event for consumable App Store purchases is `NON_SUBSCRIPTION_PURCHASE`.

**Finding 3, Daily lesson limit is more dead than the spec assumed.**

The plan said "confirm the cap is `FREE_DAILY_NEW_LESSON_CAP = 3`, that `dailyNewLessonLimit` returns `null` (unlimited) for all plans." Confirmed, but the code comment at lines 273-278 of `entitlements.ts` is explicit about the intent to reinstate via a one-line revert. The cap's infra is intact (table writes still happen). The §5 recommendation to remove it in build 32 is stronger than the spec anticipated: the comment implies the original developer intended it to be temporary, and the token economy makes reinstatement permanently moot.

**Finding 4, Zone-complete token earn needs care around the showroom/teaser path.**

`deriveAndLatchUnlock` in `lessonGroupAccess.ts` is called from: (a) the journey listing (which also runs for the locked-language showroom), (b) POST /attempts, and (c) category phrases GET. The showroom path explicitly does NOT write latch rows (see the code comment: "showroom branch loads context but never derives/latches"). The zone-complete token earn should be placed inside the latch-write path only, not in the showroom branch. This is naturally correct if the earn is co-located with the `INSERT INTO lesson_group_progress` upsert.

**Finding 5, Express stamp completion response has no dedicated `tokensEarned` field today.**

The POST /lesson-groups/:id/testout response (learning.ts ~line 2359) returns `status: "tested_out"` but no token field. The `tokensEarned` field needs to be added to the testout response in build 32 task (b) alongside the earn row write. It is a new optional field, safe for older clients.

**Finding 6, Advisory lock pattern for spend uses `pg_advisory_xact_lock` (transaction-scoped), not the session-scoped variant.**

The teaser path (learning.ts line 1151) and phrase-report path (phraseReports.ts line 73) both use `pg_advisory_xact_lock` which auto-releases at transaction commit, the correct pattern for the spend atomicity described in §1.4. The session-scoped `pg_advisory_lock` (used by startupSeed, phraseReplenisher, stripeReconcile) requires explicit unlock and is not appropriate here. Use `pg_advisory_xact_lock` for all token spend operations.

**Finding 7, `computeStreakDays` has no lock; concurrent requests can both claim streak-day earn.**

The streak-day earn fires when a new day-bucket is detected in the POST /attempts response path. If a learner submits two attempts nearly simultaneously (possible on flaky connections with retries), both could see the same "new day" and both could attempt to write the `streak_day` earn row. The `UNIQUE (user_id, source, ref_id)` constraint with `ON CONFLICT DO NOTHING` on `token_ledger` handles this automatically, the second insert is silently dropped. No advisory lock needed; the unique constraint is the guard.

**Finding 8, Quiz token earn requires confirming build 33 "Bolo Quiz" is Plus-only.**

From `games.ts` lines 471 and 573: both GET and POST for the daily quiz check `denyLockedFeature(req, res, "sentences", ...)`, the feature gate is `"sentences"`, which is a Plus-only feature. Token earn from the quiz (§2.2) is therefore implicitly Plus-only. This is by design and consistent with the approved plan.

**Finding 9, The `StatCell` strip on web home has four cells today; adding a fifth may require a layout change.**

From `home.tsx` lines 415-440: four StatCells (Streak, Speaking Streak, Total XP, Mastered) in a flex row. At narrow viewports (mobile web), five cells may overflow or collapse. The build 33 web surface task (d) should audit the StatCell container for min-width handling before shipping.
