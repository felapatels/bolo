---
name: Dev DB drifts from committed migrations
description: The shared dev Postgres is not fully migrated; drizzle-kit migrate can't heal it because a test creates a table out-of-band.
---

# Dev DB drift vs committed migrations

The shared dev Postgres (the one the api-server tests use via `DATABASE_URL`)
does **not** necessarily match the committed drizzle migrations under
`lib/db/drizzle/`.

Observed: the `users` subscription columns
(`subscription_status`/`trial_ends_at`/`current_period_end`/
`subscription_provider`/`subscription_provider_id`) existed in the Drizzle schema
and in migration `0001` but were **absent from the dev DB** (only migration
`0000` was recorded in `drizzle.__drizzle_migrations`).

`drizzle-kit migrate` cannot heal this cleanly: migration `0001` has a bare
`CREATE TABLE "lesson_generations"` (no IF NOT EXISTS), but `lesson_generations`
already exists in the dev DB because `entitlementsGating.test.ts` creates it with
`CREATE TABLE IF NOT EXISTS` at runtime. So `migrate` aborts with
"relation already exists".

**How to apply:** to unblock feature work that needs a missing column, apply the
specific `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` from the migration by
hand (psql). Do **not** try to force `drizzle-kit migrate`/`push` to fix the
whole thing — reconciling migration state with the drifted dev DB is its own task
(the "prove committed migrations build a working DB from scratch" work), not
something to bolt onto a feature task.
