---
name: Speech capability tiers & script-mismatch guard
description: Per-language STT capability flag (supported/degraded/unsupported) and the universal script-mismatch nocatch rule in pronunciation scoring.
---

## Rule
- `languages.speech_capability` is server-authoritative, seeded from `seedData.ts`. Verdicts (July 2026 TTS probe): ks + sat degraded; mni + brx unsupported (mni also mandated by user); rest supported. `GET /languages` exposes optional `speechCapability`; clients treat absence as supported.
- Pronunciation route short-circuits unsupported languages BEFORE STT (band nocatch, xp 0, compare-mode copy). Clients must never send evaluations for unsupported languages; the server branch is only a backstop.
- Guard ladder: `cross-script-cap` is GONE, replaced by universal `script-mismatch-nocatch` in `applyScoreGuards`: wrong-script transcript, or Latin transcript with romanized sim < 0.45 against a non-Latin target, resolves to nocatch (recognizer failure, never learner failure). Latin sim >= 0.45 stays scoreable; wrong-phrase-cap outranks it.

**Why:** probe proved the recognizer transcribes correct Manipuri as Bengali gibberish (score 2) and correct Bodo at 38; blaming the learner for recognizer failure was the bug. 0.45 (not 0.70) because sim 0.45-0.70 Latin transcripts are real partial attempts ("kem so" for "kem chho" = 0.67) that must stay scoreable.

**How to apply:** any change to scoring/guards or POST /attempts must preserve: nocatch = nothing negative anywhere (the attempts route skips Elo, FSRS, and exposure for nocatch — the row persists for analytics only). Capability changes go through seedData + migration, never ad-hoc UPDATEs. "supported" means best-case-with-TTS-audio; human-audio re-probe pending, downgrade if evidence shows worse. Degraded UX = one-time approximate-feedback notice; unsupported UX = listen-record-compare, no verdict, no XP, client never calls the eval or attempts endpoints.
