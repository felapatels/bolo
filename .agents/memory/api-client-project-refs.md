---
name: api-client-react stale declarations via TS project references
description: Why typechecks see an outdated API contract, and how to refresh it
---

Artifacts consume `@workspace/api-client-react` two different ways at type-check
time. Its `package.json` `exports` points at `./src/index.ts`, but consumers
that use **TypeScript project references** (e.g. the Expo mobile artifact lists
it under `references` in tsconfig.json) resolve types from the package's built
declaration output in `dist/`, NOT from `src`.

**The rule:** after the OpenAPI spec is regenerated / codegen changes the
generated hooks or schemas, you MUST rebuild the declaration output or
referencing projects type-check against a stale contract:

    pnpm --filter @workspace/api-client-react exec tsc --build --force

**Why:** the symptom is confusing — `src/generated/api.ts` shows the current
signatures (e.g. query hooks taking a `{ lang }` param, `Category.titleNative`,
`Phrase.nativeScript`) while the consumer reports those props/params "do not
exist". That is the stale `dist/*.d.ts` talking, not the real contract. A stale
`dist` is also a likely root cause of repo-wide "broken type checks".

**How to apply:** trust `lib/api-client-react/src/generated/*` as the source of
truth for the contract; if a referencing artifact disagrees, rebuild dist before
changing any app code.
