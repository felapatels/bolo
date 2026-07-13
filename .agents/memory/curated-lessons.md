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
- The hand-curated default language (Gujarati, `gu`) has VARIABLE phrase counts
  per topic (Numbers has ten, Feelings has seven). Do NOT enforce the exact
  8-phrase count on it — the shared validator takes an optional `exactCount`;
  pass it only for the generated lessons.
- Seeding stays idempotent by skipping any (language, category) lesson row that
  already exists; never re-insert phrases into an existing lesson.
- Regenerate content with the api-server `generate-lessons` script (add
  `-- --force` to redo all); then re-run the db `seed`.
- **Human-review status:** the frozen JSON is raw AI output EXCEPT the five
  highest-traffic languages, which have had a native-speaker pass: `hi` and `te`
  were already clean; `bn`, `mr`, `ta` had genuine fixes (e.g. Bengali "sad"
  দুঃখিত→দুঃখী, Marathi good-morning सकाळी नमस्कार→सुप्रभात, Tamil "tumbler"
  குடம்→டம்ளர்). The other 16 codes are still unreviewed.
- **Known content quirk:** the "Numbers 1-10" topic can only hold 8 phrases in
  generated languages (the exact-count cap), so titles say 1-10 but teach 8, and
  some languages list 1-7 then jump to 10 (skipping eight/nine). Gujarati is the
  only one that truly teaches all ten.
