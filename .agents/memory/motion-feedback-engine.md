---
name: Motion & Feedback Engine (Spec 1)
description: Durable rules for band-driven feedback motion/sound across web + mobile practice/review screens.
---

- nocatch band is a system miss, never a learner error: mascot pose 'thinking', NO wrong cue, no negative haptic, no shake. Retry band gets wrong cue + warning haptic + ≤8px transform-only shake.
- Session-end confetti gating everywhere: `good(nailed|close) * 2 >= total`; session_complete cue plays regardless.
- Summary glyph confetti uses `glyphsForLanguage(activeLang)` (derived from alphabet-stage chapters); per-phrase confetti stays shapes.
- Count-up XP chips: mobile uses the ReText pattern (Reanimated animated TextInput). **Why:** `text` is a valid native prop but absent from TS props (cast needed), and RNTL `getByText` can't see it — tests must assert via `getByLabelText` (accessibilityLabel carries the final value).
- Delayed XP-arc launches (measure-then-setState after ~250ms) must store the timeout in a ref and clear it on unmount, or late callbacks fire after navigation.
- New web summary motion must be gated with framer `useReducedMotion` (`initial={reduceMotion ? false : ...}` + zero-duration transition); Reanimated entering animations respect system reduce-motion by default.
