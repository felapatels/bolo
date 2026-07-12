---
name: orval path+query param name collision
description: Why the api-zod barrel exports only ./generated/api (values), not ./generated/types
---

When an OpenAPI GET endpoint has BOTH a path param and a query param, orval's
zod client names the path-param schema `<Op>Params` (a value) while the TS
`types` generator names the query-param type `<Op>Params` (a type). Re-exporting
both `./generated/api` and `./generated/types` via `export *` from the api-zod
barrel then trips TS2308 ("already exported a member named GetPhraseParams").
`export type *` does NOT resolve it — a value and a type of the same name from
two different star re-exports still conflict.

**Rule:** keep `lib/api-zod/src/index.ts` exporting only `./generated/api`
(the zod value schemas). Do not re-add `export * from "./generated/types"`.

**Why:** nothing in the repo imports the TS param types from `@workspace/api-zod`
— server routes import only zod value schemas (e.g. `CreateAttemptBody`), and the
react client package (`@workspace/api-client-react`) carries its own full types.

**How to apply:** if a future GET endpoint gains a query param and codegen starts
failing typecheck:libs with TS2308 on `<Op>Params`, this is the cause — the
values-only barrel already handles it; don't "fix" it by re-adding the types export.
