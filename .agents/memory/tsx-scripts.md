---
name: Running one-off tsx scripts
description: How to execute a TypeScript script (e.g. a DB seed) in this pnpm monorepo when tsx isn't directly runnable
---

Running an ad-hoc `.ts` script (e.g. `lib/db/src/seed.ts`) is awkward here:

- `pnpm exec tsx ...` and `pnpm --filter <pkg> exec tsx ...` fail with
  "Command 'tsx' not found" — tsx is a transitive dep, not exposed as a package bin.
- `node --import tsx ...` fails with ERR_MODULE_NOT_FOUND (tsx not resolvable from root).
- The api-server builds with esbuild (`node build.mjs`), so it has no `tsx` dev script to reuse.

**What works:** invoke the tsx binary directly from the pnpm virtual store:
`./node_modules/.pnpm/node_modules/.bin/tsx <script.ts>`
(There are also per-artifact copies like `artifacts/<app>/node_modules/.bin/tsx`.)

**Why:** pnpm's strict node_modules layout keeps transitive bins in the virtual
store rather than the workspace-root `.bin`, so the usual runners can't find them.

**How to apply:** for DB seeds / migrations / any one-off TS script, run the
virtual-store bin path above. Make seed scripts idempotent (skip if already seeded).
