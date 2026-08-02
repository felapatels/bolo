---
name: Pilot corpus label protocol
description: How the multi-speaker capture session's clips map to labels, and the storage rule for recordings.
---

**Label rule (owner-ratified 2026-08-01):** in the live capture session, each speaker recorded 4 attempts per phrase IN THIS ORDER: good, American-accented, subtle-error (single vowel), wrong-word. Protocol-semantic label names, in protocol order:

```
["native", "american_accent", "subtle_error", "wrong_attempt"]
```

Do NOT use the v2 spec's generic names (mild_accent/heavy_accent) — American IS the heavy accent and the single-vowel subtle error is the mild one; the spec order and the session order are semantically swapped in the middle two positions.

**Explicit labels (2026-08-02, capture mode):** the web practice page's ?mode=capture flow now writes the label VERBATIM into each sidecar (`label` + `captureMode: true` + `attemptOfFour` 1-4), plus `discarded: true` on redone takes. Harvest rule: prefer explicit sidecar labels; skip `discarded` sidecars; when a (user, phrase) group has duplicates for the same attemptOfFour, prefer the later timestamp.

**Harvest (fallback for clips WITHOUT explicit labels — pre-capture-mode uploads):** group clips by (userId, languageCode, phraseId) from R2 sidecars, sort by timestamp, map position→label only for exact quads; flag incomplete groups (expected: uploads before the 14:39 UTC checksum fix were lost) and >4 groups for manual review. Clips are webm bytes under .m4a keys (mobile-web MediaRecorder) — sniff EBML magic 1a45dfa3, never trust the extension.

**v2 calibration acceptance (ratified, per language):** all wrong_attempt medians < 55; no american_accent clip promotes (median < 93); native promotes >= 80%; at most 1 subtle_error below 55; per-clip 3-run spread <= 30.

**Storage rule (ratified):** recordings live in R2 only, NEVER committed to the repo; local caches gitignored.

**Why:** for pre-capture-mode clips, labels reconstruct solely from attempt order — nothing in those sidecars encodes the clip type, so this protocol fact is unrecoverable if lost. Capture-mode clips carry explicit labels and don't depend on it.

**Harvest outcome (2026-08-02, Round 1):** 237 labeled clips (197 explicit, 40 order-reconstructed), gu/hi/mr; the owner-flagged fumbled quads surfaced as 2-member groups (not the predicted 3) — match discards on (user, language, normalized romanization), not group size. Tools: `qa/harvest-pilot-corpus.mjs` → `qa/pilot-results/manifest.json` (gitignored), `qa/calibrate-promotion-gate.mjs` (resume-safe JSONL, retryable failures).
