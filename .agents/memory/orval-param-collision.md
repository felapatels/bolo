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
