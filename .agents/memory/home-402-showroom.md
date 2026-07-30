---
name: Home locked-language 402 showroom + no-4xx-retry
description: Web query retry policy (never auto-retry any 4xx) and home's showroom/upgrade rendering for locked-language upgrade_required; how this content was once silently lost in a rebase.
---

# Home locked-language 402 showroom + no-4xx-retry

**Rule 1 — retry policy:** `gujarati-coach/src/lib/queryClient.ts` never auto-retries ANY 4xx (`ApiError` 400–499 settles immediately); only network errors and 5xx keep TanStack's up-to-3 retries. Manual `refetch()` (e.g. the stats banner's Try again) is unaffected.

**Rule 2 — home rendering:** when `/progress/summary` settles with a 402 `upgrade_required` body (detected via `asUpgradeRequired` from `lib/entitlements`), home's stats banner renders a showroom/upgrade overlay (reason-keyed copy for `language_locked` vs `teaser_exhausted`, "Preview the journey" → `/journey`, "Unlock" → `upgradeHrefForDenial`) — NEVER the "couldn't load / Try again" error shell. Pinned by the fourth test in `src/test/home-stats-banner.test.tsx` (uses `upgradeRequiredError` from test fixtures).

**Why:** a 402 is a plan boundary, not an outage — retrying can never succeed, and error framing for a locked language reads as breakage. Before the retry-policy fix, the 402 spun through 3 retries before settling, delaying the UI.

**How to apply:** any new home/dashboard surface that queries a language-scoped endpoint must branch on `asUpgradeRequired(error)` before its generic error state. Don't loosen the 4xx retry rule for one endpoint — fix the caller instead.

**Merge-loss lesson:** this exact content was once dropped wholesale by a rebase (the commit existed only in another task environment; nothing reached any branch or dangling object here). When verifying a rebase/merge, verify by CONTENT (grep for the policy/branch), never by commit subject or SHA — and check the agreed-to test-fixture variant too (the robust choose-language fixture resolves the device timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`, not a hardcoded "UTC").
