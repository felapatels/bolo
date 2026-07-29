---
name: Journey map web (D1b)
description: Web journey map wiring lessons — showroom reachability gap, sentence gate authority, browser QA harness for entitlement states
---

# Journey map web (D1b v2)

## Showroom is server-ready but unreachable via web navigation
The lesson-groups showroom (teaser/exhausted map for a locked language) renders correctly when a Free caller's active language is plan-locked, but two client mechanisms prevent that state from ever occurring on web: the language context auto-reverts a plan-locked active language to the first allowed one, and the language picker routes locked-language taps straight to the paywall.
**Why:** those guards predate the showroom (M1 era) and exist so gated screens never render empty; the showroom made one route render richly for locked callers, but nothing feeds users into it.
**How to apply:** any feature that renders content for a locked language needs an explicit entry-point decision (guard exemption or navigation change) or it ships dark. To verify such states in a browser, patch `allowedLanguages` in the entitlements response at the harness level and seed `bolo.activeLang` in localStorage; all other responses stay real.

## Sentence-stage gating must be asserted per route, not per UI
A route that serves phrase rows by group id silently became a sentence-content leak for Free users on allowed languages, because the sentence 402 lived only on the category-sentences route and the journey UI's dialog gating is client-side convenience. Rule: any endpoint that can return sentence-stage rows must run the `sentences` feature denial itself.
**Why:** deep links (`?group=<id>`) bypass every client gate; found by a code-review round after E2E render checks all passed.

## Browser QA harness for entitlement states
`qa/journey-map-e2e.mjs` (committed) extends the plus-checkout pattern: Clerk sign-in-token mint, Nix chromium + playwright from /tmp/pw, per-scenario DB tier/language setup, DOM assertions + screenshots to gitignored qa/shots. Traps encountered:
- Only Clerk-real users can mint tickets; stale DB user ids 404 (list /v1/users first). Throwaway `+clerk_test@example.com` users + pre-seeded DB rows work; set `has_completed_tour=true` or the guided-tour overlay intercepts every click.
- The active language reconciles server-to-local asynchronously after hydration: assertions must wait for the expected line/language marker text, not just page load, or they assert against the default language's screen.
- `installSystemDependencies` takes `{ packages: [...] }` and rewrites replit.nix; revert the QA-only chromium entry before committing (keep ffmpeg, it is a prod dep).
