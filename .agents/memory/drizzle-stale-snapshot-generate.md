---
name: drizzle-kit generate from stale snapshots
description: drizzle-kit generate can re-emit already-applied DDL into a new migration; repair by hand-writing the migration + snapshot + journal, then validate with db-drift and db-migrations.
---

**Rule:** After running `drizzle-kit generate`, read the emitted SQL before trusting it. If it contains DDL for tables/columns that already exist in committed migrations, the snapshot chain is stale and the file is corrupt — do not commit it as-is.

**Why:** During Spec D2, `generate` for a single ADD COLUMN re-emitted all of the scoring-core DDL (as `0020_stiff_tarot`) because the meta snapshots lagged the committed migrations.

**How to apply:** Hand-repair: write the migration file with ONLY the intended DDL, rename/fix the `meta/NNNN_snapshot.json`, and fix `_journal.json` (idx + tag). Then validate with the `db-drift` (drizzle-kit check + no uncommitted drift) and `db-migrations` (apply all migrations to a throwaway DB) workflows — both must pass before moving on.
