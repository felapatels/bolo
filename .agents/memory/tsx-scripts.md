---
name: Running one-off tsx scripts
description: How to execute a TypeScript script (e.g. a DB seed) in this pnpm monorepo when tsx isn't directly runnable
---

Running an ad-hoc `.ts` script (e.g. `lib/db/src/seed.ts`) is awkward here:

- `pnpm exec tsx ...` and `pnpm --filter <pkg> exec tsx ...` fail with
  "Command 'tsx' not found" — tsx is a transitive dep, not exposed as a package bin.
- `node --import tsx ...` fails with ERR_MODULE_NOT_FOUND (tsx not resolvable from root).
- The api-server builds with esbuild (`node build.mjs`), so it has no `tsx` dev script to reuse.

**What works (most reliable):** run tsx's ESM cli entry directly with node:
`node "$(ls node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs | head -1)" <script.ts>`
The `.bin/tsx` symlink is NOT guaranteed to exist under the tsx virtual-store dir
(e.g. `node_modules/.pnpm/tsx@4.23.0/node_modules/.bin/tsx` was missing), so prefer
the `dist/cli.mjs` path over hunting for a `.bin/tsx`.

**Why:** pnpm's strict node_modules layout keeps transitive bins in the virtual
store rather than the workspace-root `.bin`, so the usual runners can't find them.

**How to apply:** for DB seeds / migrations / any one-off TS script, run the
virtual-store bin path above. Make seed scripts idempotent (skip if already seeded).
