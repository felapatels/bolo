---
name: Journey map web (D1b)
description: Web journey map wiring lessons — showroom reachability gap, sentence gate authority, browser QA harness for entitlement states
---

# Journey map web (D1b v2)

## Showroom entry point (resolved July 29, 2026)
The picker now feeds locked-language taps into the showroom: set the locked language active locally, close, navigate to `/journey`. The language context PERMITS plan-locked active languages — the allowedLanguages auto-revert branch (M1 era) was removed outright, along with the provider's entitlements query; only the unsupported-code fallback remains. Server PATCH preferences only checks the language exists, so locked codes sync cross-device.
**Why:** the auto-revert existed so gated screens never render empty, but every gated surface now has its own upgrade/degrade state (verified live: home + chat upright with a locked active language), so the guard only served to make the showroom unreachable.
**How to apply:** any feature rendering content for a locked language must budget a blast-radius check of the main surfaces with that language active, not reintroduce a global revert. The harness `picker` scenario covers the real navigation path with zero shims; the old harness shims (entitlements patch + localStorage seed) remain only for the direct-URL scenarios.

## Sentence-stage gating must be asserted per route, not per UI
A route that serves phrase rows by group id silently became a sentence-content leak for Free users on allowed languages, because the sentence 402 lived only on the category-sentences route and the journey UI's dialog gating is client-side convenience. Rule: any endpoint that can return sentence-stage rows must run the `sentences` feature denial itself.
**Why:** deep links (`?group=<id>`) bypass every client gate; found by a code-review round after E2E render checks all passed.

## Browser QA harness for entitlement states
`qa/journey-map-e2e.mjs` (committed) extends the plus-checkout pattern: Clerk sign-in-token mint, Nix chromium + playwright from /tmp/pw, per-scenario DB tier/language setup, DOM assertions + screenshots to gitignored qa/shots. Traps encountered:
- Only Clerk-real users can mint tickets; stale DB user ids 404 (list /v1/users first). Throwaway `+clerk_test@example.com` users + pre-seeded DB rows work; set `has_completed_tour=true` or the guided-tour overlay intercepts every click. A reusable Free-tier fixture exists: `user_3HBoFoWBTvYDbTJdkgc0DSrsipI` (qa-paywall-c1@example.com, tour done, active lang hi).
- The `picker` scenario (added July 29, 2026) is the shim-free real-navigation path: locked picker tap → showroom → home/chat blast radius. Home renders TWO picker triggers (one hidden); click via `getByTitle(...).locator("visible=true").first()`.
- The active language reconciles server-to-local asynchronously after hydration: assertions must wait for the expected line/language marker text, not just page load, or they assert against the default language's screen.
- `installSystemDependencies` takes `{ packages: [...] }` and rewrites replit.nix; revert the QA-only chromium entry before committing (keep ffmpeg, it is a prod dep).

## Mobile port (D1b-M)

- The mobile `LanguageContext` had the SAME auto-revert bug the web shipped D1b without: a plan-guard effect flipped any supported-but-locked activeLanguage back to the first allowed language, silently killing showroom adoptions from the picker (map kept rendering the old line). Removed the plan branch; kept the unsupported-code fallback.
- **Why:** showroom = intentionally parking a free account on a locked language. Any global "correct the locked language" guard is incompatible with it, on every platform. Per-route 402/403 handling is the guard instead.
- **How to apply:** if a showroom/preview flow "silently shows the old language", grep for effects keyed on `allowedLanguages`/`isPlus` before debugging navigation. Mobile home still lacks a dedicated locked-language state (summary/attempts 402 → degraded stats) — follow-up proposed.
