---
name: Scoring Core v2
description: FSRS + XP ledger + Elo — schema, backfill, and startup-gate decisions
---

## What shipped (Task 1 — backend only)

Three new tables applied via raw psql (no drizzle-kit TTY issues):
- `user_item_memory` — FSRS state per (user, phrase); unique (user_id, phrase_id)
- `user_ability` — Elo theta per (user, language); PK (user_id, language_code)
- `xp_ledger` — append-only XP events; unique (user_id, source, ref_id)

Additive columns added to existing tables:
- `attempts`: latency_ms, audio_duration_ms, band, fsrs_rating, theta_delta, beta_delta, xp_awarded, flags
- `phrases`: accepted_answers (jsonb), elo_difficulty, elo_difficulty_rd, exposure_count
- `users`: tz_grace_used_on

## ts-fsrs v5 API

`fsrs.next(card, date, grade)` takes `Grade` not `Rating`.
`Grade = Exclude<Rating, Rating.Manual>` = 1|2|3|4.
Always import `type Grade` and cast: `rating as Grade`.

## Backfill safety gate

The mastered-count comparison uses `STABILITY_SEED_MIN_GOOD_ATTEMPTS = 1` (not 3).
With threshold=3, dev accounts with single-pass phrases fail the 30% gate.
With threshold=1, any phrase the learner ever passed gets stability seeded to 21 days — preserving the old `score ≥ 80` definition exactly.

**Why:** On migration day, a learner with 1 passing attempt per phrase would see their mastered count drop from N to 0 with threshold=3. The 1-attempt threshold makes the transition invisible to learners.

## Pronunciation band → XP

nailed=pass: 5 + difficulty×5 (diff1=10, diff2=15, diff3=20)
close=partial: half of nailed
retry/nocatch: 0

## Startup order

index.ts: runStartupSeed() → runBackfillScoringV2() → app.listen()
Backfill runs before any traffic. Both are advisory-locked with different keys.

## XP ledger source values

`'attempt'` (ref_id=attempt.id), `'game_session'` (ref_id=game_session.id), `'daily_quiz'` (ref_id=daily_quiz_completion.id)

## normalizeNative (Devanagari)

Logic bug fixed: nasal consonant + virama (e.g. न् in हिन्दी) survived the
non-letter strip because the consonant letter (category L) was not dropped.
Fix: `.replace(/[\u0919\u091E\u0923\u0928\u092E]\u094D/g, "")` BEFORE the
`/[^\p{L}]/gu` strip. Now हिंदी and हिन्दी reduce identically to हद.

The explicit anusvara drop (U+0902/U+0901) is technically dead code — both are
category Mn and would be stripped by the non-letter rule anyway — but kept for
clarity of intent.

Conjunct-nasal fix is Devanagari-only. Same pattern needed for Gujarati,
Bengali, Tamil, Telugu, etc. — separate task.

## latencyMs flagging

`attempts.flags = "latency_missing"` when `claims.latencyMs == null` (client
did not report). Measure adoption before making the field required.
250ms guard is in `/openai/pronunciation` — returns 400 `tap_too_fast`.

## SCORING_V2_GATE_OVERRIDE

`SCORING_V2_GATE_OVERRIDE=1` env var bypasses the mastered-count safety gate
with ERROR-level log. Use only in an emergency; the gate throws by default.

## Migration verified on fresh DB

`lib/db/drizzle/0020_scoring_core_v2.sql` + journal entry confirmed via:
`CREATE DATABASE` → full drizzle migration chain from 0 → table + column
verification → `DROP DATABASE`. All 20 migrations ran clean in sequence.

## What was NOT shipped (Task 2 — deferred)

- Removing `score` from pronunciation API response
- Band pill in UI (nailed/close/retry/nocatch)
- XP breakdown on progress screen
- Timezone row in account settings
- Typo/loanword guard UI state
