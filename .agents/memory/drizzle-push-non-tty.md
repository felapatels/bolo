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

**Drastically-drifted DB (many ambiguous diffs at once):** An isolated task env
can hand you a DB whose schema is far behind the ORM (e.g. old single-language
tables, missing whole tables). Rather than hand-writing a big migration, if the
data is disposable (dev/task env, users are JIT-provisioned), `DROP TABLE ...
CASCADE` every app table, then `push` against the now-empty DB — all-creates has
no rename/column ambiguity, so it applies with no TTY prompt. Then repopulate
reference data with the seed script (`lib/db/src/seed.ts`) run via the tsx
cli.mjs path (see tsx-scripts.md). Do NOT do this against production.
