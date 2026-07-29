---
name: C1 generated sentence content
description: How batch-generated sentence content is frozen, provenance-marked, seeded, and grouped; traps for growing the library.
---
- Generated sentence top-ups live in a committed JSON keyed by category with `origin:"generated_c1"` per entry; the seeder copies origin into `phrases.source`. Rows predating the column stay NULL, so only `source='generated_c1'` is a reliable filter — never treat NULL as runtime-generated.
- All Gujarati seed/backfill consumers must use `gujaratiLessonsWithC1()` (merged view), never the raw curated constant, because sentence validation enforces EXACT counts and `sentenceCount` is language-aware.
- **Why:** back-translation QA must target generated rows precisely; a blanket seeder stamp defeats it.
- Seed inserts are chunked (50/batch) so a grown library can't blow the publish promote health-check window on first boot.
- Lesson-group backfill skips already-grouped pairs, so new seeded sentences need the append-only sentence top-up pass (new groups after max position; existing groups untouched — completed is latched). Batches ≤ merge threshold wait rather than form tiny groups.
- Offline generation cost is negligible at this scale; batches of ≤12 with an accumulated avoid-list keep dedup rejects to a few percent.
- The ghost-apply migrate trap fired again on the source-column migration: migrate logged success, column absent; verify via information_schema and apply DDL via psql.
