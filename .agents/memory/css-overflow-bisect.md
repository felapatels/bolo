---
name: Page-level horizontal overflow debugging
description: How to find and fix mobile "content runs off screen" bugs — min-content propagation vs truncate, and the hide-bisect probe.
---

**Rule:** `truncate` (nowrap) text inside a grid/flex item cannot stop page-level horizontal overflow by itself — the item's `min-width: auto` makes the track honor the content's *min-content* (full nowrap text width + fixed-width siblings). Put `min-w-0` on the grid/flex ITEM (every ancestor level that is a flex/grid child), not just near the text.

**Why:** the Bolo home boarding pass pushed the whole page to 417px on a 390px phone: the nowrap "Next stop: …" line + train SVG + ticket stub summed past the viewport, and the home `grid` track honored that min-content because the `lg:col-span-2` child lacked `min-w-0`. Every section on the page then stretched and looked "moved off screen."

**How to apply:** don't reason about which element overflows — measure. `qa/home-overflow-probe.mjs` signs in the QA user, loads any route at 390px (`E2E_PATHS=/app,/journey`), reports `scrollWidth` vs viewport, lists *unclipped* offenders (skips ones under overflow-hidden ancestors — those can't cause scroll), and recursively hide-bisects children to the exact culprit leaf. Needs chromium (system dep, wiped on restart) + playwright at /tmp/pw.
