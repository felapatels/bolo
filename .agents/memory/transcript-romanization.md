---
name: Deterministic transcript romanization
description: Library choice and verified quirks for display-only romanization of Indic STT transcripts (sanscript), incl. uncovered scripts and card-style post-processing.
---

**Rule:** Display romanization of Indic text uses `@indic-transliteration/sanscript` (api-server dep, ships own TS types), detecting the scheme from the TEXT's Unicode block, never the language code. Post-process IAST → plain ASCII (NFD strip) → schwa deletion for hi/gu/mr/pa/bn/as/mai/doi/kok/brx toward card style ("kem cho"), with a script-based fallback (Gujarati/Gurmukhi/Bengali scripts) when no language code is available.

**Why (all verified empirically, July 2026):**
- `anyascii` was rejected: npm install 404s in this workspace (tried twice).
- Tamil MUST use the `tamil_extended` scheme; plain `tamil` emits garbage ("vaṇaghgham" instead of "vaṇakkam").
- Perso-Arabic (ur/sd/ks) yields unvocalized consonant skeletons; Ol Chiki (sat) and Meetei Mayek (mni) leave unmapped glyphs. All must return "" (clients hide the line), never a mangled fragment. A >15% dropped-glyph garbage guard catches partial coverage.
- Requests without a phraseId have NO languageCode server-side, so language-keyed styling silently degrades ("kema cho") unless a script fallback exists. A route-level test caught this; the unit tests alone did not.

**How to apply:** Any new surface that needs romanized Indic display text should call `romanizeTranscript` (api-server lib) rather than re-evaluating libraries. Coverage: 17/22 app languages; ks/sd/ur/sat/mni fall back to empty.
