---
name: Signal wave persistence & LIKE-fed refs
description: Rules for the signal_waves surface — grammar-pin any user string that feeds a LIKE scan; envelope pins and parallel-suite flakes it exposed.
---

**Rule.** Any user-controlled string that is stored and later feeds a SQL `LIKE` prefix scan must be grammar-pinned at the write boundary (strict zod regex), because `%` and `_` are wildcards. The signal-wave POST pins `languageCode` to `/^[a-z]{2,3}$/` and `gap` to 1-999 for exactly this reason; it also 404s unknown language/category so junk refs never persist.

**Why:** Code review caught that a permissive `z.string().min(1)` languageCode let a caller store a ref like `%`, which would then match every user-scoped prefix scan in the lesson-groups signals derivation. Escaping at read time is the fragile alternative; rejecting at write time is authoritative.

**How to apply:** When adding any endpoint whose body ends up in a column scanned with `like(col, prefix + '%')`, pin the grammar in zod AND mirror the pattern into openapi. Add explicit rejection tests for `%`, `_`, and mixed strings.

**Adjacent traps this task hit:**
- The lesson-groups showroom tests pin the response envelope with exact-key `deepEqual(Object.keys(json).sort(), [...])` in TWO places (teaser + allowed contract tests). Any new field on the lesson-groups response fails both; update the pins as part of the contract change, not as an afterthought.
- Waves are display-only, per-user rows (no Chai rides them); entitlement gating on the POST was reviewed as a gap but deliberately not added — locked-language waves only affect the caller's own map display. If waves ever earn anything, gate first.
