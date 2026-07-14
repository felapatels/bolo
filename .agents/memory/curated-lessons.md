---
name: Pre-curated lessons for all languages
description: How the 22 languages get frozen, committed lesson content and how the seeder consumes it.
---

# Pre-curated lessons

All non-default languages have their beginner phrases generated offline and
frozen into a committed JSON file, so a fresh DB seeds populated lessons for
every language with no first-open AI wait. On-demand runtime generation still
exists as a safety net.

- **Source of truth for language/topic metadata** lives in one shared module in
  `lib/db` (exported via a `./seed-data` package subpath) consumed by BOTH the
  seeder and the offline generator runner — never duplicate these lists.
- **The offline runner** lives in the api-server (it needs the OpenAI
  integration + the runtime lesson generator). It is idempotent: it only fills
  (language, topic) pairs missing/invalid in the JSON, persists after each
  success so an interrupted run resumes, and skips the hand-curated default
  language.
- **The frozen JSON** is written with sorted keys for stable diffs and read by
  the seeder at seed time.

**Why:** backing the "all 22 languages" claim needs reviewed, reproducible
content, not live per-learner generation.

**How to apply:**
- **Two count tiers now exist** (see `premium-phrase-library.md`): a starter
  count (the free set, historically 8, `numbers` 10) and an extended count (the
  full starter+premium library, 24, `numbers` 10). Every curated lesson — frozen
  JSON AND hand-curated Gujarati — must hold the EXACT extended count; the
  validator's `exactCount` is passed the extendedPhraseCount for all of them.
- Gujarati (`gu`) is no longer variable-count: it was grown to the same extended
  sizes as every other language (24/topic, `numbers` 10), preserving its
  original hand-curated phrases as the first (starter) entries.
- Seeding stays idempotent by skipping any (language, category) lesson row that
  already exists; never re-insert phrases into an existing lesson. **Consequence:**
  growing a lesson's size does NOT update already-seeded lessons — those need a
  separate backfill; a fresh seed is the only path that picks up new phrases.
- The separate backfill now exists as `lib/db` script `backfill-premium-phrases`
  (`src/backfillPremiumPhrases.ts`). It adds the curated library's missing
  phrases to EXISTING lesson rows only, marking premium by the same
  starter-then-premium index rule the seeder uses; idempotent, dedups on
  nativeScript+lowercased english, never mutates existing rows. **Gotcha:** on a
  DB seeded from PRE-review content, the dedup won't match corrected starter
  phrases, so it inserts the corrected version as a new (non-premium) row and the
  lesson grows past its extended count (e.g. 25/26). That's expected drift, not a
  bug — premium count per non-numbers lesson is still exactly 16; a prod DB
  seeded from the current committed curated data stays clean at 24.
- Regenerate content with the api-server `generate-lessons` script. It PRESERVES
  the reviewed starter set and only APPENDS premium phrases (via
  generateAdditionalPhrases) up to the extended target; resumable, dedups on
  native+English. `-- --force` regenerates a pair from scratch. Then re-run seed.
- **Human-review status (STARTER phrases only):** all 21 non-Gujarati codes have
  had a review pass of their FREE STARTER set (indexes 0..starterCount). The five
  highest-traffic (`hi`,`te` clean; `bn`,`mr`,`ta` fixed) plus the remaining 16.
  This bullet is about the starter set; the premium tail is tracked separately
  below. Common raw-AI defects the review found: scrambled/wrong numerals
  in low-resource languages (Bodo & Manipuri number lessons were badly shuffled),
  Hindi words substituted for the target language (Sanskrit had दादी/दादाः for
  grandparents; corrected to पितामही/पितामहः), plain-wrong vocab (Sanskrit "spoon"
  was कटु = *bitter*), English loanwords where a native term exists (Malayalam
  "good morning/night", Urdu پلیز), digits instead of spelled-out words (Odia
  numbers showed ୧୨୩), and duplicate phrases within one lesson (two "happy").
- **Residual risk:** the Perso-Arabic (Kashmiri), Ol Chiki (Santali) and Meetei
  Mayek (Manipuri) lessons are hardest to verify without true fluency — treat
  their kinship terms and exact orthography as still needing a native check.
- **Numbers 1-10 teaches a gap-free one-through-ten in every language** (both
  curated Gujarati and the frozen generated languages); starter AND extended
  count for `numbers` is 10, enforced gap-free one..ten by a seedData test. It
  has NO premium extension — the whole topic is the free starter set. An earlier
  exact-count cap made generated languages teach only 8 (some skipping
  eight/nine); that has been fixed — do not reintroduce a cap that drops numbers.
- **Content-review status of the premium phrases:** ALL 22 languages' premium
  (Plus-only) tails have now had a fluent-review pass. Six highest-traffic first —
  Gujarati (`gu`, in `seedData.ts`) plus `hi`, `bn`, `te`, `mr`, `ta` (in
  `curatedLessons.json`) — then the remaining 16 (`as`,`brx`,`doi`,`kn`,`kok`,
  `ks`,`mai`,`ml`,`mni`,`ne`,`or`,`pa`,`sa`,`sat`,`sd`,`ur`). Same defect classes
  found and fixed throughout: wrong vocab, LANGUAGE BLEED (a Hindi/English word for
  a genuine native term), off-topic phrases (Urdu FOOD had "urine"/"sample";
  Sanskrit food "mortar" was actually "mallet"), broken script/orthography, wrong
  glosses, and duplicates.
- **Gotcha (learned this pass):** a vocab/loanword fix can silently create a NEW
  duplicate against a starter or premium row (correcting a loanword to the
  standard native "sorry"/"thank you" collides with the existing one). After
  applying corrections ALWAYS re-run a full per-lesson dup scan on BOTH
  nativeScript and lowercased english, and get distinct on-topic replacements for
  any collision.
- **Still-open caveat:** the hard scripts (Kashmiri Perso-Arabic, Santali Ol
  Chiki, Manipuri Meetei Mayek) got the same pass, but true native verification of
  exact orthography would still add confidence.
- **One pre-existing STARTER defect left untouched (out of premium scope):**
  brx/feelings idx0 & idx1 are both glossed "happy" (two different native words) —
  a real duplicate gloss in the already-"reviewed" starter set.
