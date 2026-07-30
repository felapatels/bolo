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

**Crashed run poisons the shared DB.** When a `before` hook throws (e.g. a query hits a column the lagging dev DB lacks), that file's `after` cleanup never runs, so its unique-key rows (categories `slug`, languages `code`, users `id`) survive. Every later run then fails in `before` with `duplicate key value violates unique constraint`, and the `after` hook additionally errors reading `server.close` (server was never assigned) — a cascade of failures whose real cause is one earlier crash. Remedy: fix the underlying schema drift (apply the missing `ADD COLUMN IF NOT EXISTS`) AND purge the orphaned rows. All test identifiers are prefixed — slugs/langs `__test_%`, user ids `test_%` — so cleanup is `DELETE ... WHERE slug/code LIKE '\_\_test\_%'` / `user_id LIKE 'test\_%'`, in FK order phrases→lessons→categories→languages, plus attempts/badges/users.

## Testing the auth requirement (401) for a route
Mounting the REAL `requireAuth` behind a bare `clerkMiddleware()` in a throwaway express app works in tests: an unauthenticated request yields `getAuth(req).userId == null` → 401, with no Clerk session needed (env keys are enough). This makes "endpoint requires auth" acceptance tests genuine instead of asserting on a shim. Pattern: `routes/phraseReports.test.ts` (separate app from the x-test-user shim app used by the functional tests).
