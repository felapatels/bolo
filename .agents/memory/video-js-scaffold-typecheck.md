---
name: video-js artifact typecheck gaps
description: A freshly-scaffolded video-js artifact builds and previews but does not pass tsc; check it before completing a video task.
---

# video-js artifacts don't typecheck out of the box

The video-js scaffold and the design subagent that builds a video validate `vite build` and `scripts/validate-recording.sh`, but not `tsc`. The completion code review runs the per-artifact `typecheck`, so a video task can look done (preview works, build passes) yet fail review on type errors.

**Rule:** after the video is built, run the artifact's own `typecheck` yourself and resolve it before `markTaskComplete`.

**Why:** the two recurring causes are structural, not one-off bugs — a video artifact's tsconfig tends to inherit a DOM-less `lib` from the base config (so `window`/`document` and framer-motion's DOM-dependent types fail), and inline animation transition objects widen `type: 'spring'` to `string`, which is not assignable to framer-motion's transition types. The fixes mirror the react-vite scaffold: give the tsconfig a DOM-inclusive `lib`, and type shared transition constants with framer-motion's `Transition`.
