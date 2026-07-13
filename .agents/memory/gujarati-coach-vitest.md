---
name: gujarati-coach vitest setup
description: How the web artifact's component/integration tests are wired and the gotchas that bite.
---

# Component testing in artifacts/gujarati-coach

The web artifact uses **vitest + jsdom + @testing-library/react** for component/integration
tests (`src/**/*.test.tsx`, run via `pnpm --filter @workspace/gujarati-coach run test`).

## Non-obvious setup constraints
- **Use a separate `vitest.config.ts`, not `vite.config.ts`.** The dev vite config throws on
  import unless `PORT` and `BASE_PATH` env vars are set (they only exist under a workflow), so
  reusing it makes tests fail to even load. The vitest config just needs the `@` → `src` alias,
  `@vitejs/plugin-react`, `environment: 'jsdom'`, and a setup file.
- **jsdom is missing APIs Radix (Dialog) and framer-motion touch.** `src/test/setup.ts` must
  stub `matchMedia`, `ResizeObserver`, `scrollIntoView`, and the pointer-capture methods, or
  interaction tests crash on environment gaps unrelated to the assertion.
- **Keep test files out of the app typecheck.** `tsconfig.json` excludes `**/*.test.ts` and
  `src/test/**` so test-only types (vitest/jest-dom) don't couple into `pnpm typecheck`.

## Mocking pattern that works
- Drive the **real** `useEntitlements`/`asUpgradeRequired` (in `src/lib/entitlements.ts`) but mock
  their data sources: `vi.mock("@workspace/api-client-react", ...)` returning a hoisted mutable
  state object, plus `vi.mock("@clerk/react")` (useUser signed-in) and `vi.mock("@/lib/language-context")`.
  This tests the actual gating logic, not a reimplementation.
- Use `vi.hoisted(() => ({...}))` for the mutable state so each test sets the exact server
  snapshot / query result before rendering; reset it in `beforeEach`.
- For routing assertions use wouter's `memoryLocation({ path, record: true })` and pass its `hook`
  to `<Router hook={...}>`; `<Link href>` renders a plain `/upgrade` href, and programmatic
  `setLocation` shows up in the returned `history` array.
- Pages read route params via wouter `useParams()`; rendered **without** a matching `<Route>` it
  returns `{}`, so `categoryId` parses to `0` — make fixture ids match (id `0`) or wrap in a Route.

**Why:** the whole Free-vs-Plus "locked but visible → /upgrade" UX is server-driven off the
`GET /api/entitlements` snapshot and shared 402 `upgrade_required` bodies; these tests lock in that
contract so a regression can't silently lock out payers or leak Plus to Free.
