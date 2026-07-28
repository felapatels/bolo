---
name: Pronunciation band derivation
description: Band is score-only server-side; passed is deprecated for UX branching.
---
Band derives from score only (Spec 0 rule 40): >=80 nailed, 55–79 close, <55 retry (nocatch is separate, set upstream). Never derive band from the LLM `passed` boolean — the LLM could assert passed at a sub-80 score and inflate the band.

**Why:** an earlier implementation used `passed ? 'nailed' : ...`, making `passed ⇔ nailed` and leaving the "close" UX (thumbsup mascot, light haptic, neutral icon) dead code, plus an LLM-trust seam.

**How to apply:** all UI branches (mascot, haptics, result icon, score colors) should key on `band`, not `passed`. `Attempt.band` is nullable for pre-banding rows — fall back to computing from score with the same 80/55 thresholds. When a test and code disagree on thresholds, check the spec before changing either.
