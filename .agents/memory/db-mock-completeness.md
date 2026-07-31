---
name: "@workspace/db mock completeness"
description: Tests that mock @workspace/db with a static namedExports list break at ESM link time when the schema gains a table the mock doesn't declare.
---

## Rule
Any test using `mock.module("@workspace/db", { namedExports: { ... } })` must declare every name the dynamically-imported module's import line references — the mock must track the schema barrel.

**Why:** With `--experimental-test-module-mocks`, the mock replaces the real module at ESM link time; a missing named binding fails with `SyntaxError: The requested module '@workspace/db' does not provide an export named '...'` before any test runs. This has bitten tests whose mocks were written against an older schema.

**How to apply:** The shared factory now exists: `artifacts/api-server/src/test/dbMock.ts` → `createDbMockExports(overrides)`. Always mock via the factory, never a hand-rolled namedExports list. Completeness is typecheck-enforced with `satisfies { [K in keyof typeof Db]: unknown }` over a TYPE-ONLY import (the real module never executes, so no pg Pool is created) — schema additions/removals fail typecheck in that one file. Its default `db` is a throwing proxy, so tests must pass their own `db` stub in overrides. Don't add drizzle-helper stubs (`eq`, `inArray`…) — the barrel never exported them.
