---
name: Cross-script transcript bridge
description: Rescue-only cross-script normalization inside compareToTarget; thresholds, sibling noBridge rule, and the Perso-Arabic honest limit.
---

# Cross-script transcript bridge (pronunciation scoring)

The rule: `compareToTarget` may attempt a cross-script bridge (transliterate transcript and target into a shared comparable space) ONLY as a rescue. The final result is `max(raw, bridged)` when raw is comparable; a raw-incomparable result is rescued only when bridgedSim clears the evidence floor. The bridge can never lower a score or turn a pass into a fail.

**Why:** STT often returns the right sounds in the wrong script (e.g. Devanagari for a Gujarati target). Before the bridge those attempts were nocatch. But a symmetric bridge would also let unrelated cross-script text inflate scores, so it is rescue-only with an evidence floor.

**How to apply:**
- Trigger: raw incomparable OR raw sim < 0.93 (skip threshold). Strong raw matches never bridge.
- Raw-incomparable rescue floor: bridgedSim >= 0.45 (mirrors guard 1b), else stays incomparable.
- Sibling/other-phrase comparisons pass `{noBridge: true}` everywhere (fast path + guard loop). Bridging siblings would inflate wrong-phrase matches into false negatives.
- `normalizeForComparison` is wrapped in try/catch; on throw, keep the raw result.
- Perso-Arabic (and other unbridgeable scripts) honestly stay bridged=false; that limit is recorded verbatim in docs/CODEBASE-FACTS.md, do not "fix" it ad hoc.
- Bridge metadata lives on the internal `PhoneticComparison.bridge` field and must never leak into API responses.

Companion diagnostics: allowlisted (PILOT_CAPTURE_USER_IDS) nocatch outcomes tee a JSON sidecar to R2 `nocatch-diagnostics/<lang>/<uuid>.json`, fire-and-forget AFTER res.json, fail-open (the ENTIRE body after the allowlist check sits inside one try/catch — client acquisition included; a code review caught that getR2Client outside the try violated never-throws). Field name is `similarityValues`, never "confidence" (the pipeline has no STT confidence).

Test trap: a mock whose reset helper clears a `shouldThrow` flag must arm the flag AFTER reset, or the "rejection" test silently exercises the happy path. Have the mock record the attempt before throwing so the test can assert the rejecting call was actually reached.
