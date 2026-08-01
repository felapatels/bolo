---
name: Plan-filtered listings vs whole-set rollups
description: Progress rollups computed over ALL rows desync from plan-filtered detail payloads (journey tally vs practice session); keep rollups plan-aware or expect "ghost unmastered" reports.
---

# Plan-filtered listings vs whole-set rollups

**Rule:** when a detail endpoint filters rows by plan (e.g. premium phrases hidden from Free callers), every rollup/tally shown next to it must aggregate over the SAME visible set — or the UI reports progress the user can never act on.

**Why:** the "completed station starts at phrase 1 despite unmastered phrases" dev report (Aug 2026) was NOT a resume-logic bug. The journey listing's `masteredCount`/`phraseCount` count all group rows including premium, while the group-phrases endpoint filters premium for Free callers. A Free learner masters the 8 visible rows → card says "8/10 mastered", session payload is all-mastered → correct review-visit fallback to phrase 1 looks broken. Deterministic for every Free user on stations with premium rows (80% completion ratio == exactly the free-row count).

**How to apply:**
- Diagnosing "resume/skip/progress looks wrong": capture the ACTUAL network payload in a real-browser probe before touching derivation code — the client logic is usually right against what it was given.
- Building any new tally/rollup near plan-gated content: pass the caller's plan filter into the aggregation, or explicitly surface the split ("8/8 + 2 with Plus").
- The card-tally mismatch was reported and deliberately left unchanged (user ruling: loader-derivation fix only, Aug 1 2026). Do not "fix" it in passing without a ruling.
