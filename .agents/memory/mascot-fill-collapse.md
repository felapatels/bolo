---
name: Mascot fill collapse & full-bird hit target
description: Why the practice bird collapsed to ~10px (absolute img in an indefinite %-height chain), the in-flow + popLayout fix, and the full-bird touchable rule.
---

## The collapse

The web practice screen sizes the mascot with `fill` through a chain of `h-full` wrappers, but no ancestor has a definite height (`app-surface` uses only `min-h-[100dvh]`), so every `height: 100%` resolves to 0/auto. An absolutely-positioned `<img>` (`absolute inset-0`) contributes nothing in-flow → the whole parrot zone collapses to ~10px while the image "loads fine" (200, opacity 1, no console errors).

**Rule:** inside a percentage-height fill chain, the CURRENT crossfade image must stay IN-FLOW (`h-full w-full object-contain`) so a replaced element's intrinsic-size fallback keeps the chain open. Use `AnimatePresence mode="popLayout"` — framer pops only the EXITING element to absolute, so the crossfade still overlaps in place.

**Why:** the canonical-PNG revert switched the img to `absolute inset-0` and shipped an invisible record button; fixed-`size` placements masked it because only practice uses `fill`.

**How to apply:** any crossfade/stacked media inside `Mascot` or similar fill-sized components. Screenshot-tool checks don't catch it — only a real browser measuring `getBoundingClientRect()` does (`qa/practice-mascot-probe.mjs` pins bbox floors across idle/recording/evaluating/result at mobile+desktop, plus badge-overlay dismissal before measuring the compact state).

## Full-bird hit target (web practice)

The hold-to-speak touchable must cover the FULL rendered bird (head to feet), not a belly-only inner box. Owner decision July 30, 2026. Implementation: plain un-rounded `absolute inset-0` button — the container box tracks the in-flow img exactly, and border-radius also clips pointer hit-testing, so no `rounded-*`. Probe asserts touchable bounds ⊇ img bounds (16px slack for idle bob/rotation bbox inflation) and that a head press starts recording.

Mobile practice has no bird hit target at all (separate 88px circular mic Pressable); pattern divergence noted in CODEBASE-FACTS §8 for a future mobile pass.

## Probe gotchas

- Idle whole-image motion (float rotate ±1.5°, breathe scale 1.03) inflates axis-aligned bboxes ~2–3% — compare sizes with tolerance, never exact px.
- A fresh test user's first attempt pops the "First Words" badge overlay whose own 128px cheer mascot pollutes "biggest mascot img" measurements — dismiss it (tap anywhere) before measuring the compact result parrot.
- An oscillator-tone getUserMedia shim drives the full record→evaluate→result loop headlessly; the result is the nocatch/"Didn't catch that" panel, which still exercises the compact 110px band.
