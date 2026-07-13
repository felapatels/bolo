---
name: orval query options require queryKey
description: Passing { query: { enabled } } to an orval-generated hook fails typecheck unless queryKey is also supplied
---

When you pass a `query` options object to an orval-generated react-query hook
(e.g. `useListCategoryPhrases(id, lang, { query: { enabled: false } })`), the
option type is `UseQueryOptions<...>` which marks `queryKey` as **required**, so
TypeScript errors with "Property 'queryKey' is missing" even though the hook
computes a default key internally.

**Why:** orval types the caller-supplied `query` object as the full
`UseQueryOptions`, not a Partial, so any override object must also carry
`queryKey`.

**How to apply:** supply the matching key helper alongside your override, e.g.
`{ query: { enabled: isReview, queryKey: getListReviewPhrasesQueryKey({ lang }) } }`.
This is the idiomatic pattern for conditionally enabling one of two hooks (call
both, enable only the active one) to satisfy the rules-of-hooks constraint.
