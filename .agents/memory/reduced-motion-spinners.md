---
name: reduced-motion spinners
description: The global prefers-reduced-motion CSS in gujarati-coach must exclude loader spins, or loaders freeze.
---

# Reduced-motion must not neutralize loaders

The gujarati-coach web app has a global `@media (prefers-reduced-motion: reduce)` block
in `src/index.css` that near-zeroes all `animation`/`transition` durations to respect
users who opt out of motion. It **explicitly excludes** the spinner utility
(`.animate-spin`) so loading indicators keep rotating.

**Why:** A blanket reduced-motion reset also kills `animate-spin`, leaving loaders
looking frozen/broken. Purposeful, non-decorative motion (spinners, progress) must be
allow-listed out of the reset.

**How to apply:** When adding new always-on functional animation (spinners, indeterminate
progress), add it to the exclusion list in the reduced-motion block. Decorative/celebratory
motion (mascot idle bob, entrance springs, confetti) should stay inside the reset — the
`Mascot` component and framer-motion animations use `useReducedMotion()` to opt out at the
component level too.

**Expo Go entrance animations (bolo-mobile):** reanimated `entering` animations can silently never run in Expo Go, stranding whole screens at opacity 0 ("app doesn't load" — only tab bar visible). Every `entering={...}` callsite must go through `appear()` in `lib/entrance.ts`, which no-ops in Expo Go (executionEnvironment 'storeClient') and passes through in dev/prod builds. jest mocks expo-constants as 'standalone' so tests exercise the animated path. Also: bolo-mobile web preview screenshots show blank white until Clerk's JS loads — retry the screenshot before suspecting a render break (Clerk dev-keys warning in browser logs = rendered).
