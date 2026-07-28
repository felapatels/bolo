---
name: Lesson group unlock model
description: Slice 2 unlock derivation, completion latch vs replenishment dilution, test-out shape
---

Rule: lesson-group `completed` must be LATCHED (persisted in lesson_group_progress on first observation by the read endpoint), never purely re-derived.

**Why:** the replenisher appends fresh phrases to the last under-cap phrase group, growing the denominator; a purely derived >=80%-mastered ratio can fall back below threshold and re-lock the successor group. Caught by architect review.

**How to apply:** any new consumer of unlock state must pass BOTH the persisted completed set and tested_out set to `deriveGroupStatuses`; never compute completion from live ratio alone. Entitlement deny* gates always run before unlock computation. Test-out validates server-signed evaluationTokens (user/phrase/in-group/distinct/exact sample), logs every submission in lesson_group_testouts (no throttle yet). Replenisher: append to last phrase group under cap 14, else new group with two-phase sign-flip sentence shift; unique-violation retry then NULL-group fallback. Test cleanups for anything calling replenishPhrases must delete lesson_groups and lesson_generations rows.
