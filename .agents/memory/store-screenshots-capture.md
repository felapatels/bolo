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

## Crisp (2x DPR) captures
Raw sources are now **824×1648** (412×824 CSS at deviceScaleFactor 2) so the
framed store sets have no upscaling blur. The Screenshot tool can't set DPR;
use Nix chromium headless + CDP (`Emulation.setDeviceMetricsOverride
{width:412,height:824,deviceScaleFactor:2,mobile:true}` + `Page.captureScreenshot`)
via Node's built-in WebSocket. Traps: chromium headless clamps `--window-size`
below ~500 DIP (cropped layout) so CLI `--screenshot` can't do this; the app's
Noto webfonts stay `unloaded` in headless — force `document.fonts.forEach(f=>f.load())`
and wait before capturing; tofu in native text = demo Language rows must use the
exact backend `fontFamily` strings ("Noto Sans Devanagari" etc., see
constants/fonts.ts SCRIPT_FONTS); `pkill -f <chromium pattern>` matches the
ShellExec wrapper's own cmdline (self-kill), and a live background chromium
holds the shell's pipes open — kill by PID before the command exits.

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
