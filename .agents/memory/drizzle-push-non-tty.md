---
name: drizzle-kit push in non-interactive shell
description: Why `drizzle-kit push` can hang/fail here and how to apply schema changes instead
---

# Preferred: committed migrations (generate + migrate), not push

`lib/db` now has committed versioned migrations in `lib/db/drizzle/` and scripts:
`generate` (drizzle-kit generate — author a migration after editing schema),
`migrate` (drizzle-kit migrate — apply pending migrations, non-interactive/TTY-free),
`seed` (reference data), and `setup` (migrate + seed, the full fresh-env apply path).
`scripts/post-merge.sh` runs `setup`. After ANY change to `lib/db/src/schema/*`,
run `pnpm --filter @workspace/db run generate` and commit the new SQL, or fresh
environments drift. `drizzle.config.ts` `out` must be a RELATIVE path ("./drizzle");
an absolute `path.join(__dirname,...)` makes drizzle-kit check/generate read a
doubled `.//abs/path` and throw ENOENT.

# drizzle-kit push fails on rename/ambiguous diffs in this environment (legacy)

`pnpm --filter @workspace/db run push` (and `push-force`) run `drizzle-kit push`,
which throws `Interactive prompts require a TTY terminal` whenever the diff is
ambiguous — most commonly when a table is dropped and another is created and
drizzle asks "is this a rename?" (e.g. dropping `profiles` while adding `users`).
The tool tools have no TTY here, so it aborts before touching the DB.

**How to apply:** For a clean add/create with no ambiguity, `push` works. For
ambiguous diffs (table rename vs drop+create, column rename), don't fight the
prompt — apply the DDL explicitly instead. Run the `CREATE TABLE` /
`ALTER TABLE ... ADD/DROP COLUMN` / `ADD CONSTRAINT` / `DROP TABLE` statements
directly against the DB (the `executeSql` code-exec callback accepts DDL). Use
`IF EXISTS` / `IF NOT EXISTS` and add FK constraints by name so the result
matches what drizzle would have produced. Clear dependent rows first if you're
adding a NOT NULL column to a populated table.

**Why:** Keeps migrations deterministic and non-interactive; the drizzle schema
files stay the source of truth for types, the manual DDL just realizes them.

**The project now uses migration files, not `push`, for setup.** The db `setup`
script is `drizzle-kit migrate && seed` (migrations committed under the drizzle
`out` dir; post-merge runs this). `migrate` is deterministic and non-interactive,
so it's the right tool — but it tracks applied migrations in a journal table
(`drizzle.__drizzle_migrations`). If tables were created out-of-band (e.g. an
earlier manual DDL fix or a `push`) the journal stays EMPTY, so `migrate` tries to
apply `0000` from scratch, hits "relation already exists", and exits 1 (this is
what breaks post-merge setup after a hand-applied schema). Fix for a disposable
dev DB: DROP all app tables + `DROP TABLE drizzle.__drizzle_migrations`, then run
the migrate-based `setup` so the migration applies cleanly AND records its journal.
Do NOT hand-apply DDL anymore — generate a migration (`drizzle-kit generate`) so
the journal stays consistent. Never reset production this way.

**Drastically-drifted DB (many ambiguous diffs at once):** An isolated task env
can hand you a DB whose schema is far behind the ORM (e.g. old single-language
tables, missing whole tables). Rather than hand-writing a big migration, if the
data is disposable (dev/task env, users are JIT-provisioned), `DROP TABLE ...
CASCADE` every app table, then `push` against the now-empty DB — all-creates has
no rename/column ambiguity, so it applies with no TTY prompt. Then repopulate
reference data with the seed script (`lib/db/src/seed.ts`) run via the tsx
cli.mjs path (see tsx-scripts.md). Do NOT do this against production.
