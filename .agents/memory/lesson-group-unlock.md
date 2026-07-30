---
name: Lesson group unlock model
description: Slice 2 unlock derivation, completion latch vs replenishment dilution, test-out shape
---

Rule: lesson-group `completed` must be LATCHED (persisted in lesson_group_progress on first observation by the read endpoint), never purely re-derived.

**Why:** the replenisher appends fresh phrases to the last under-cap phrase group, growing the denominator; a purely derived >=80%-mastered ratio can fall back below threshold and re-lock the successor group. Caught by architect review.

**How to apply:** any new consumer of unlock state must pass BOTH the persisted completed set and tested_out set to `deriveGroupStatuses`; never compute completion from live ratio alone. Entitlement deny* gates always run before unlock computation. Test-out validates server-signed evaluationTokens (user/phrase/in-group/distinct/exact sample), logs every submission in lesson_group_testouts (no throttle yet). Replenisher: append to last phrase group under cap 14, else new group with two-phase sign-flip sentence shift; unique-violation retry then NULL-group fallback. Test cleanups for anything calling replenishPhrases must delete lesson_groups and lesson_generations rows.

## Server-side serving guard (July 30, 2026)

Unlock state now gates SERVING, not just the journey listing. Shared guard
`artifacts/api-server/src/lib/lessonGroupAccess.ts`:
- `getUnlockedGroupIds(userId, categoryId, languageCode, {stats?})` — pass the
  route's in-hand attempt stats to skip the duplicate attempts query.
- Derivation + completion latch live in the guard, so phrase routes latch
  completions too (idempotent). Showroom/teaser callers must NEVER reach the
  guard (latch would write for an unowned language) — entitlements run first.
- Per-phrase rule: unlocked group ∨ lessonGroupId NULL ∨ prior attempt
  (retake exemption; Retake deep-links resolve against the category list, so
  the exemption lives in the list filter, not a single-phrase endpoint).
- Locked direct group request → 403 `{error:"lesson_group_locked",groupId,status:"locked"}`.
  **Why not 402:** upgrading doesn't unlock a journey group, and the web
  client renders EVERY 402 as a Plus upsell.
- Deliberately unfiltered: test-out (exists to sample locked groups), review
  (attempted-only by construction), chat seed words, daily-quiz sampling,
  and `/categories` listing counts (whole-category semantics — mobile b26
  progress % may trail what's practicable; cosmetic, accepted).

**How to apply:** any NEW route that serves phrase/sentence content must call
the guard after its entitlement gates; never re-implement the derivation.
