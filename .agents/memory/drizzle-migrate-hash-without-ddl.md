---
name: drizzle migrate can record a hash without executing DDL (dev DB)
description: How to detect/fix when drizzle-kit migrate "succeeds" but the table never appears.
---

Observed on the shared dev Postgres: `drizzle-kit migrate` reported success and inserted a row into `drizzle.__drizzle_migrations`, but the migration's DDL never landed (`to_regclass('public.<table>')` was NULL). The same migration applied cleanly to a fresh DB via the full-chain check, so the file itself was fine — the anomaly is dev-DB-local and REPRODUCIBLE (happened on two consecutive migrations), likely fallout from this repl's previously healed journal/out-of-band history. Treat every dev-DB migrate as suspect.

**Rule:** after `drizzle-kit migrate` on the dev DB, verify the new object exists with `to_regclass()` before trusting the hash table.

**Fix pattern:** apply the committed migration SQL by hand — `psql "$DATABASE_URL" -1 -f <(sed 's/--> statement-breakpoint//g' drizzle/<file>.sql)` — never hand-edit the migration file or hash rows, then validate via the db-migrations (fresh-chain) and db-drift workflows.
