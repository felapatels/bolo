---
name: M1 language teaser gating
description: Three/four-state locked-language access model (allowed/teaser/exhausted/locked) and its traps
---

Locked-language access is resolved by `getLanguageAccess` (api-server lib/gating.ts) into: allowed, teaser (<3 distinct teaser phrases attempted), exhausted (>=3, lifetime, reason `teaser_exhausted`), and **locked** (language has no teaser set: no Greetings group 1; payload must stay byte-identical to pre-M1, no `teaser` field).

**Why the `locked` state exists:** test-fixture languages have no lesson groups; without it they fell into "exhausted" and broke every pre-existing gating test asserting `language_locked`.

Rules:
- Teaser set = first 3 stage='phrase' phrases of the first Greetings group, cached per language in lib/teaser.ts; consumption DERIVED from attempts (count DISTINCT phrase_id in set) — no table, so "lifetime" survives anything.
- `denyLockedLanguage` is async; phrase-scoped routes must pass `opts.teaserPhraseId` (id-aware exception).
- Attempts consume per DISTINCT phrase regardless of score; recount AFTER insert for the response.
- All new API fields (`teaser` on UpgradeRequired/Phrase/AttemptResult, reason `teaser_exhausted`) are optional/additive for Expo back-compat.
- Trap: test files that `mock.module("@workspace/db")` enumerate namedExports; any new table import in the route chain (e.g. lessonGroupsTable) breaks them with "does not provide an export" — add the stub table to each mock.
- Known gap (facts doc debt row): pronunciation/TTS routes never language-gate; if closed later, honor the teaser exception.
- Teaser taste sets are INERT to start-position/resume logic on every platform: the fixed free set always plays from the top (skipping an attempted phrase shortens taste → upsell). Client signal: teaser-state responses carry per-phrase `teaser` progress — check `phrases.some(p => p.teaser)` before any resume/skip logic.
