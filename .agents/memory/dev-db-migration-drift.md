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

Recurs with every new migration: the account/subscription + learner-preference
columns (`avatar_url`, `pause_until`, `retention_offer_accepted_at`,
`daily_reminder_*`, `active_language`, `daily_goal`, `theme` — migration `0004`)
were likewise absent from the dev DB after that feature merged, which broke the
**entire** api-server test suite (every `users` insert 42703'd), not just the new
feature's tests. Applying the migration's `ADD COLUMN IF NOT EXISTS` by hand fixed
it. Watch for this after any task that merges a new `users`/schema migration.

`drizzle-kit migrate` cannot heal this cleanly: migration `0001` has a bare
`CREATE TABLE "lesson_generations"` (no IF NOT EXISTS), but `lesson_generations`
already exists in the dev DB because `entitlementsGating.test.ts` creates it with
`CREATE TABLE IF NOT EXISTS` at runtime. So `migrate` aborts with
"relation already exists".

**How to apply:** the api-server test script now self-heals before running:
`pnpm --filter @workspace/db run sync-schema` replays every committed migration
statement-by-statement against DATABASE_URL, skipping duplicate-object errors
(42P07/42701/42710/...). It never drops anything and doesn't touch
`__drizzle_migrations`. So a newly merged migration can no longer silently break
the whole suite. For non-test drift (e.g. the running dev API 500ing), run
`sync-schema` manually instead of hand-writing ALTERs. Do **not** try to force
`drizzle-kit migrate`/`push` against the drifted dev DB.

## Blast radius: a lagging `users` column 500s the WHOLE authed API

`ensureLocalUser` upserts **every** column of the `users` schema, and
`requireAuth` runs it first on every request. So if the dev DB is missing ANY
`users` column that the committed schema/migration has, the upsert 42703s and
**every authenticated endpoint 500s** (entitlements, friends, lessons — not just
the feature that added the column). The symptom looks like "auth/Clerk is broken";
the cause is a lagging column. Fix by hand-applying that migration's `ALTER TABLE
users ADD COLUMN IF NOT EXISTS ...`.

Note: committed migrations live under **`lib/db/drizzle/`** (not
`lib/db/migrations/`). Don't conclude "there's no migration" from grepping the
wrong path — e.g. `0005` correctly adds `users.stripe_customer_id`; the dev DB
just hadn't applied it. Fresh DBs (incl. production via post-merge `setup`) get
the column; `pnpm --filter @workspace/db run check-migrations` proves migrations
apply cleanly to a throwaway DB.
