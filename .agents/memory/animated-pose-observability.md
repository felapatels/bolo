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

The mobile jest reanimated stub is hand-rolled and only exports what has been
needed so far — a config option referencing a missing export (`ReduceMotion`)
throws at render, not at an assertion. Add the export to the stub rather than
weakening the component.
