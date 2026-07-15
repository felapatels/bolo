---
name: Premium (Plus-only) phrase library
description: How the extended phrase library is split free vs Plus, and how the tier boundary is derived and exposed.
---

# Premium phrase library (Free starter vs Plus extended)

Each topic teaches a small free **starter** set and a larger **extended**
library; everything past the starter is Bolo! Plus content.

- **Tier boundary is a `phrases.premium` boolean** (default `false`, so all
  pre-existing/Free rows stay accessible). It is DERIVED BY INDEX at seed time,
  not stored per-phrase in the curated sources: the seeder marks the first
  `starterPhraseCount(slug)` phrases of a lesson non-premium and the rest
  premium. The committed `curatedLessons.json` and `GUJARATI_LESSONS` literals
  carry NO per-phrase premium field — keep them premium-agnostic; change the
  boundary only via `starterPhraseCount`.
- **`numbers` is a fixed gloss sequence, not open vocabulary** — free starter is
  the 1..10 sequence; the premium extension is the fixed continuation 11..20.
  `NUMBER_WORDS` in seedData is the single canonical sequence shared by the
  offline generator and the seed test, and the frozen lessons must carry it in
  exact order.
- **Library growth reaches existing DBs via the startup seeder itself**: an
  existing lesson is topped up in place (insert-only, deduped on native+english,
  curated index = sortOrder, premium derived from the starter boundary). Never
  bump `starterPhraseCount` when growing the library — it would shift the
  free/premium boundary for already-seeded rows; grow only the extended counts.
- **Runtime-generated phrases** (cache-miss / user-added) are non-premium, which
  is correct — only the pre-seeded library carries premium depth.

**Feature flag:** `extendedLibrary` in `PlanFeatures` (Plus/trial true;
one_language/free false). Any router gating premium must run behind the
entitlements loader (see `entitlement-gating.md`).

## Response-shape decision (backward-compatible)

**Do NOT change `/categories/:id/phrases/:lang` into an object.** It stays a JSON
array; for non-Plus callers it is simply FILTERED to accessible (non-premium)
phrases. The per-topic locked count is exposed elsewhere:

- `/categories` listing gained a REQUIRED `lockedPhraseCount` field, and its
  `phraseCount` counts only ACCESSIBLE phrases for the caller's tier.
- **Why:** both category detail pages already load the categories listing, so
  downstream upsell UI reads `lockedPhraseCount` without a phrases-endpoint shape
  change — avoids breaking every existing phrases consumer.
- `/phrases/:id` blocks a premium phrase for non-Plus with a 402
  `upgrade_required` / `reason: feature_locked` / `feature: extendedLibrary`.

Review and analytics endpoints are Plus-only already, so premium leakage there
is moot (they see all phrases correctly).
