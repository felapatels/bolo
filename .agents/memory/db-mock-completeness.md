---
name: "@workspace/db mock completeness"
description: Tests that mock @workspace/db with a static namedExports list break at ESM link time when the schema gains a table the mock doesn't declare.
---

## Rule
Any test using `mock.module("@workspace/db", { namedExports: { ... } })` must declare every name the dynamically-imported module's import line references — the mock must track the schema barrel.

**Why:** With `--experimental-test-module-mocks`, the mock replaces the real module at ESM link time; a missing named binding fails with `SyntaxError: The requested module '@workspace/db' does not provide an export named '...'` before any test runs. This has bitten tests whose mocks were written against an older schema.

**How to apply:** When adding a table export to `@workspace/db` (or adding a table to a route's import line), grep the api-server tests for `mock.module("@workspace/db"` and add the new name to each mock's namedExports. The durable fix is a shared mock factory so there is one place to update; until it exists, expect stale mocks to fail the whole file at link time, not at an assertion.
