---
name: Transliterated-loanword seed guard
description: How the seed content loanword blocklist works, its false-positive classes, and its blind spot
---

The seed-content guard flags phrases whose English gloss is on a blocklist AND whose romanization phonetically resembles that English word (full-form or consonant-skeleton Levenshtein). It scans both the frozen curated JSON and the in-code Gujarati lessons.

**False-positive classes to allowlist, not "fix":**
- Indo-European cognates: Punjabi "ਭਰਾ"/bharaa (brother), Sanskrit "सूनुः"/sūnuḥ (son) legitimately sound like their English glosses via shared PIE roots.
- Coincidental native skeletons: Bodo "बिरागो"/birago (bored) follows a native adjectival pattern.

**Blind spot:** the guard only fires when the gloss matches — a loanword with a *wrong* English label (Bodo "सोरि"/sori labeled "thanks") sails past. Found one such case by manual review.

**Why:** naturalized loanwords learners really say (plate, glass, menu) are kept off the blocklist by design, so no allowlisting churn for them.

**How to apply:** when lessons are regenerated or the blocklist grows, run a probe over the data first (replicate the phonetic match) to see hits before editing, then fix with real native words or allowlist with a linguistic comment.
