---
name: api-server test setup
description: How automated tests run in the api-server package and what they must assume about the database
---

The api-server uses Node's built-in test runner via tsx: `node --import tsx --test 'src/**/*.test.ts'` (script `test`). `tsx` is a direct devDependency of the package so its bin resolves for the script (a bare transitive tsx does not — see tsx-scripts note).

**Why node:test + tsx:** the package has no bundler-based test path (it ships via esbuild), and node:test avoids adding a heavier runner. tsx transpiles the TS + resolves `@workspace/db` (whose `exports["."]` points straight at `./src/index.ts`, so tests hit live source, not the stale `dist`).

**Tests share the real Postgres** at `DATABASE_URL` — there is no separate test DB. So DB-touching tests must:
- scope every row to throwaway ids / test-only keys and clean up in `after`;
- be idempotent (safe to re-run) — e.g. `CREATE TABLE IF NOT EXISTS`, `onConflictDoNothing`.

**How to apply:** in task environments the DB can lag the code schema (e.g. missing the multi-language/badges tables). A test that needs a table the migration hasn't created should self-provision it (DDL mirroring the drizzle schema) in a `before` hook rather than assuming it exists.
