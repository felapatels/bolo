---
name: orval path+query param name collision
description: Why a GET endpoint must not have BOTH a path param and a query param in this repo
---

When an OpenAPI GET endpoint has BOTH a path param and a query param, orval's
zod client names the path-param schema `<Op>Params` (a VALUE, in
`lib/api-zod/src/generated/api.ts`) while orval's TS `types` generator names the
QUERY-param type `<Op>Params` (a TYPE, in `.../generated/types`). The api-zod
workspace barrel (`lib/api-zod/src/index.ts`) re-exports both generated files
via `export *`, so the value and the type collide → TS2308
("already exported a member named `<Op>Params`").

Query-ONLY endpoints are fine: zod names them `<Op>QueryParams` (note the infix),
types names them `<Op>Params` → different names, no clash. Path-ONLY endpoints
are fine too: zod emits `<Op>Params`, types emits no query-params type.

**Rule:** never give a single GET endpoint both a path param and a query param.
Put the discriminator in the path (e.g. `/categories/{id}/phrases/{lang}`
instead of `/categories/{id}/phrases?lang=`), or keep everything in the query
with no path params.

**Why:** orval runs in `workspace` output mode and REWRITES/ensures the barrel
`export * from './generated/api'` AND `export * from './generated/types'` on
every codegen run. So you cannot durably "fix" this by editing the barrel to
values-only — orval re-adds the types export next codegen. Removing the
collision at the spec level (no path+query on one op) is the only fix that
survives regeneration.

**How to apply:** if codegen fails `typecheck:libs` with TS2308 on `<Op>Params`,
find the GET op that has both a path and query param and move the query param
into the path.

## Same collision, second cause: INLINE request bodies (`<Op>Body`)

An endpoint whose `requestBody` schema is an INLINE `type: object` (not a `$ref`)
makes orval-zod emit a VALUE `<Op>Body` in `api.ts` while orval-types emits a
TYPE `<Op>Body` in `.../generated/types` → the barrel re-exports both → TS2308
("already exported a member named `<Op>Body`").

**Rule:** never inline a request-body object. Define a named component schema
(e.g. `SetChosenLanguageInput` under `components.schemas`) and `$ref` it. Then
zod keeps the operation name `<Op>Body` (value) while the type takes the schema
name (e.g. `SetChosenLanguageInput`) → different names, no clash. This matches
how every other body in the spec is written.
