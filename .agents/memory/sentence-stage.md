---
name: Plus-only sentence stage
description: How the "full sentences" final step is modeled and gated across DB, API, and clients.
---

Sentences live in the same `phrases` table as a second stage (`stage='sentence'`, always `premium=true`, sortOrder restarts per stage), served ONLY by `GET /categories/:id/sentences/:lang` behind the Plus-only `sentences` plan feature (402 `feature_locked`).

**Why:** reusing the phrase row shape keeps the pronunciation/attempt/mastery pipeline untouched; a separate endpoint keeps the gate server-authoritative (no sentence text reaches free clients).

**How to apply:** every phrase-reading query (lesson loads, /categories counts, add-phrases dedupe, /progress/summary) must filter `stage='phrase'` or counts silently inflate; new stages would need the same sweep. Clients gate fetching on the server-reported `sentencesLocked` from /categories, and practice screens reuse the same flow via a `stage=sentences` param. Curated JSON requires 8 valid, quality-gated sentences per lesson for ALL languages; backfill dedupes per-stage (sentences may reuse phrase vocabulary).
