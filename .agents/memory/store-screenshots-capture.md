---
name: Store screenshot capture for the Expo app
description: Durable decisions for capturing auth-gated mobile store screenshots and the traps around committing/typechecking them.
---

# Capturing store screenshots for Bolo! Mobile

**Decision:** capture the auth-gated feature screens (topics, practice,
progress, badges) from the app's **Expo web build** plus a *temporary,
fully-reverted* "screenshot mode" harness, not from a device.

**Why:** react-native-web renders the same production component tree, and there
is no device/emulator in the environment. The screens sit behind Clerk auth and
need populated data, so a plain non-interactive screenshot can't reach them.
Playwright + real Clerk login + DB seeding was considered and rejected as far
more fragile.

**How to apply:** the harness = a web-only `fetch` shim returning demo JSON for
the read-only endpoints + bypassing the auth redirects; must pass Clerk traffic
(`/api/__clerk`) through untouched, and must include the default active language
or the home language pill renders empty. Size captures to **412×824** (exactly
2:1 — the steepest ratio Play allows; each side must be 320–3840). Delete the
whole harness after capture — it is dev-only. Public screens (`/sign-in`,
`/sign-up`) must be captured *after* reverting, or the harness redirects away
from them.

## Traps that block committing/reviewing these assets
- **gitignore:** the Expo `.gitignore` rule `android/` (for the generated native
  project) ALSO silently matches `assets/store/android/`, so store assets are
  never committed. Keep a negation for that path and verify with
  `git check-ignore <file>`.
- **screenshot tool reuses the browser session per URL path:** capturing two
  different demo values (e.g. `?shotLang=gu` then `?shotLang=bn`) on the *same*
  path (`/`) returns the first one's cached SPA state. Give each capture a
  distinct route path (home `/`, practice `/practice/1`, topic `/category/1`) so
  each is a fresh page load that re-reads the param and refetches.
- **stale api-client dist:** the mobile app typechecks against the *built dist*
  of `@workspace/api-client-react`, which is gitignored. Any commit that
  regenerates the client / changes its schema (e.g. paywall work) must rebuild
  it (`tsc -b lib/api-client-react --force`) or mobile typecheck fails on
  missing members — even on unrelated branches that merely include those commits.
