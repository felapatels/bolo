---
name: fixed-position vs animation-fill-mode
description: Why position:fixed elements scroll away inside CSS-animated page wrappers, and how to diagnose/fix it
---

# `position: fixed` breaks under persistent transforms from CSS animations

**The rule:** any ancestor with a non-`none` transform (also `filter`, `will-change: transform`, `backdrop-filter`) becomes the containing block for `fixed` descendants — the "fixed" element then scrolls with that ancestor. A CSS animation with `animation-fill-mode: both`/`forwards` whose keyframes include `transform` keeps applying a transform FOREVER after finishing, even an identity `matrix(1,0,0,1,0,0)`. Identity transforms still create containing blocks.

**Why:** an entrance animation utility (fade+rise) used `fill-mode: both` on page wrappers; every `fixed bottom-0` nav inside silently became container-relative. framer-motion was NOT the culprit — it cleans its inline transform back to `none` at rest (though it does break `fixed` transiently mid-transition).

**How to apply:**
- Entrance-only animations should use `animation-fill-mode: backwards` (covers the pre-start frame; leaves nothing applied after the end). End state is visually identical.
- Mount fixed chrome (navs, FABs) OUTSIDE any transition-wrapped/animated subtree, e.g. once in the app shell next to — not inside — the page-transition wrapper.
- Diagnose empirically in a real browser: `getBoundingClientRect().bottom` vs `innerHeight` mid-scroll, and walk `parentElement` chain checking `getComputedStyle(el).transform !== "none"`.
- Related trap found same session: a `pb-safe`-style utility class that is referenced but never defined computes to 0px silently; safe-area insets also require `viewport-fit=cover` on the viewport meta tag.
