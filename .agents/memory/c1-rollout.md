---
name: C1 21-language sentence rollout
description: Outcome, invariants, and low-resource-language lesson from extending the C1 generated-sentence stage beyond Gujarati.
---

# C1 sentence rollout (shipped July 2026)

**Outcome:** 16 of 21 non-Gujarati languages shipped 43 generated sentences per category (rollout JSON keyed lang → category, `origin:"generated_c1"`). 5 withdrawn to the 8-sentence curated base: **kok, ks, sat, brx, mni**.

## The low-resource wall
- The withdrawn 5 failed two-check QA at 51-99 percent major rates, dominated by `grammatical:true` + `meaningEquivalent:false` — the stored gloss does not match the sentence. Cannot tell whether generation or the blind translator hallucinates; either way the pipeline cannot VALIDATE content.
- **Full-size model does not fix it:** a one-category experiment (full-size generation AND full-size judging) still failed at 67-100 percent. Do not re-roll these languages with LLMs; their path is Bhashini probe + native-speaker validation.
- The failed cluster overlaps the degraded/unsupported STT tier almost exactly (plus Konkani). Model capability in a language is end-to-end: if STT is degraded, expect generation/judging to be too.
- **Why:** re-attempting LLM generation for these languages wastes spend and risks shipping wrong glosses to learners.

## Invariants
- ALL seed/validation consumers of the curated-lessons file must go through `curatedLessonsWithC1()` (mirrors `gujaratiLessonsWithC1`); `sentenceCount(slug, lang)` derives from the rollout file's actual lengths, so pruning below 43 stays consistent.
- QA judge prompt for multi-language runs: keep grammar attention GENERIC (case/agreement/particles/word order) — naming a specific construction makes the judge over-flag correct sentences (pilot-confirmed).
- Healthy-language pipeline: generate → QA all → prune majors (scoped lang+category+nativeScript, also drop their verdicts from the report) → regenerate once → re-QA replacements → accept ok+minor. Elevated initial rates (30-41 percent) converged to 1-19 percent residual after ONE round.
- Rollout scripts accept `--langs/--model/--out/--categories` (gen) and `--langs/--model/--in/--out` (QA) so experiments never touch shipped files.
- Dev-DB quirk: pre-pilot runtime-replenished sentence rows (source NULL) can text-collide with later seed JSON entries; append-only dedup skips them, so `generated_c1` DB counts can undercount the JSON. Not an error.
