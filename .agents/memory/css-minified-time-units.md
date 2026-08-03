---
name: CSS minifier time-unit trap
description: Prod CSS minification rewrites ms values as s; unit-blind parseFloat of computed timing vars becomes a prod-only bug.
---

The rule: any JS that reads a stylesheet timing custom property (`getComputedStyle(...).getPropertyValue("--foo")`) must parse it unit-aware — in gujarati-coach, always via `cssTimeMs` in `src/lib/utils.ts` (pinned by `src/test/css-time.test.ts`). Never bare `parseFloat`.

**Why:** The production build's CSS minifier rewrites `8000ms` as `8s` and `1500ms` as `1.5s` for byte savings. `parseFloat("8s")` is 8, so code treating the result as milliseconds turned the splash max-hold failsafe into 8ms — the overlay unmounted before its first paint (prod-only blackout: asset requests fired, nothing ever showed). The tear-nav and tear-cleanup delays collapsed the same way (500ms→0.5ms, 900ms→0.9ms).

**How to apply:** The bug class is invisible in dev (unminified CSS serves the source `ms` form) and in jsdom (getComputedStyle returns "" so fallbacks win), so tests and dev preview prove nothing — grep for `parseFloat` near `getPropertyValue` when reviewing, and verify by grepping the built `dist` CSS for the var (`--foo: 8s;`). A "MUST be in ms" comment on the CSS var is not a real constraint: the minifier rewrites it anyway.
