---
name: TS project references read built dist, not src
description: Why artifact typechecks fail with stale types after editing a referenced lib package's schema.
---

# TS project references consume built `dist/*.d.ts`, not `src`

Artifacts (e.g. `artifacts/bolo-mobile/tsconfig.json`) list workspace libs under
`"references"` (composite project references). Under project references, tsc
resolves the referenced package via its **emitted declarations** (its `outDir`,
e.g. `lib/api-client-react/dist`), NOT the `src` that the package's `exports`
map points to. The web app (vite/tsc without a reference to that project) reads
`src` directly, so the two can disagree.

**Symptom:** after changing a schema in `lib/api-client-react/src` (e.g. adding
fields to an interface), the mobile/artifact `typecheck` fails with
`Property 'x' does not exist on type 'Y'` even though `src` clearly has it — the
stale `dist/*.d.ts` is missing the field.

**Why:** the lib has no build script and its `dist` is committed/stale; project
references only see `dist`.

**How to apply:** after editing any referenced lib's source that changes its
public types, rebuild its declarations before typechecking consumers:
`pnpm exec tsc -b lib/<pkg>/tsconfig.json`. The referenced tsconfig is
`composite: true` + `emitDeclarationOnly: true`, so `tsc -b` regenerates `dist`.
