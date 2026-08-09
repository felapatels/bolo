---
name: Animated pose observability
description: Keep an animation's END POSE in a plain style and animate only the delta into it — so the pose survives reduced motion and is assertable in tests.
---

When a UI state is expressed as a *pose* (rotated, flipped, offset) rather than
as continuous motion, put the pose itself in a **plain style** (RN
`StyleSheet` entry / CSS class) and let the animated value carry only the
**delta into it** — e.g. a static `rotate: '180deg'` plus an animated
`(progress - 1) * 180` that cancels it until the spring lands.

**Why:**
- Under reduced motion both platforms collapse the animation to its end value
  (Reanimated 3 defaults configs to `ReduceMotion.System`; the web
  reduce-motion CSS reset zeroes transitions). If the pose lives in the
  animation, the state still arrives — but if the animation is instead skipped
  or never commits, the surface reads as "nothing happened".
- Tests cannot see animated values at all: the mobile jest reanimated stub
  returns `{}` from `useAnimatedStyle`, and framer applies nothing synchronously
  in jsdom. A plain style is the only observable form of the pose.
- A pose that only exists inside a worklet also can't be reasoned about from a
  style dump when debugging a layout complaint.

**How to apply:** any "state pose" — hanging/flipped mascots, rotated chevrons,
slid-in panels that must persist. Two extras that go with it:
- A pose with no movement can read as *frozen*. Under reduced motion pair it
  with a non-movement beat (slow opacity breathe). On Reanimated that beat must
  pass `reduceMotion: ReduceMotion.Never` explicitly or it snaps to its end
  value and the surface stays stuck at the dimmed extreme.
- Keep the pose wrapper IN FLOW in percentage-height chains; an absolutely
  positioned one collapses the zone.
- The delta multiplies for scale poses the way it offsets for rotation poses: a
  plain `scale: S` plus an animated factor that starts at `1 / S` (full size,
  cancelling the shrink) and springs to 1 reads as a zoom OUT; leaving the
  state, the plain style is already gone, so the same factor runs `S -> 1` and
  reads as a zoom back IN. On Reanimated, set that factor with
  `withSequence(withTiming(start, { duration: 0 }), withSpring(1))` rather than
  writing the shared value twice in one tick, so the spring is guaranteed to
  start from the intended value. On web the wrapper's `transition-transform`
  already animates adding and dropping the class, so no delta value is needed.

The mobile jest reanimated stub is hand-rolled and only exports what has been
needed so far — a config option referencing a missing export (`ReduceMotion`)
throws at render, not at an assertion. Add the export to the stub rather than
weakening the component.
