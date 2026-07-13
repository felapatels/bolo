---
name: framer-motion vs the global reduced-motion CSS reset
description: Why gujarati-coach's global prefers-reduced-motion CSS rule does NOT stop framer-motion animations, and how to gate them.
---

# framer-motion is not covered by the global reduced-motion CSS reset

gujarati-coach's `src/index.css` has a `@media (prefers-reduced-motion: reduce)`
block that zeroes out `animation-duration`/`transition-duration` app-wide. That
only affects **CSS** animations/transitions. framer-motion drives its `animate`
props via JS (Web Animations API / rAF), so those keep playing at full strength
even when a user opts out of motion — e.g. the `Confetti` particles flying
across the screen, or spring `scale`/`y` "pop" entrances.

**Why:** there is no `<MotionConfig reducedMotion="user">` at the app root, so
framer-motion defaults to `reducedMotion: "never"`.

**How to apply:** any component with meaningful framer-motion motion must call
`useReducedMotion()` and branch itself (the established pattern in `mascot.tsx`
and `speaking-demo.tsx`). For decorative effects like confetti, return null when
reduced; for entrances, drop the spring/scale/`y` and use a short opacity fade.
Don't assume the global CSS rule handles it. A project-wide fix would be to add
`<MotionConfig reducedMotion="user">` at the root instead of per-component gating.
