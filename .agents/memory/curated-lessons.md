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
- **Content-review status of the premium phrases:** the premium tail was RAW AI
  output. A review pass has now corrected the SIX highest-traffic sets — Gujarati
  (`gu`, in `seedData.ts`) plus `hi`, `bn`, `te`, `mr`, `ta` (in `curatedLessons.json`)
  — for the same defect classes (wrong vocab e.g. Hindi उबला हुआ="boiled" glossed
  "annoyed"; loanwords e.g. नर्वस/बोर/আন্টি/গুড্ বై; off-topic content e.g. Tamil
  had mother/father in the FOOD lesson; broken script e.g. Marathi "च चा"→चहा;
  wrong glosses e.g. Bengali কাঁটা="spike", Gujarati ફુવા; and semantic duplicates
  where the premium tail just repeated starter emotions with new phrasing). The
  remaining ~15 lower-traffic languages' premium tails are STILL unreviewed raw
  AI output — same defect classes likely; needs a native pass (esp. the hard
  scripts: Kashmiri Perso-Arabic, Santali Ol Chiki, Manipuri Meetei Mayek).
