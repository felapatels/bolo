---
name: framer-motion SVG rigs need transform ATTRIBUTES
description: Why motion.g transform/originX props fail for SVG character rigs, and the working TG/setAttribute pattern used by the Bolo web rig.
---

# framer-motion SVG rigs: write the `transform` attribute yourself

Two failure modes hit when building a layered SVG character rig (the web Bolo
mascot) with framer-motion:

1. **`originX`/`originY` fractions on `motion.g` resolve wrong pivots.** Parts
   rotate around unpredictable points (wings pivoting over the face). Fractional
   origins are computed against the measured bounding box, not viewBox
   coordinates, and are unreliable for nested SVG groups.
2. **The `transform` prop on `motion.g` is silently swallowed.** framer-motion
   manages transforms itself, so passing a MotionValue string template (e.g.
   `useMotionTemplate\`rotate(${deg} 57 110)\``) as `transform` never reaches the
   DOM — every part renders untransformed and all poses look identical.

**Working pattern:** keep MotionValues + `animate()` springs for the numbers,
build attribute strings with `useMotionTemplate`, and write them to a plain
`<g>` via a tiny subscriber component:

```tsx
function TG({ tpl, children }) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    ref.current?.setAttribute("transform", tpl.get());
    return tpl.on("change", (v) => ref.current?.setAttribute("transform", v));
  }, [tpl]);
  return <g ref={ref}>{children}</g>;
}
```

This gives exact viewBox-coordinate pivots (`rotate(deg cx cy)`,
translate-scale-translate sandwiches) with spring animation intact.

**How to apply:** any SVG rig work in this repo (web `bolo-rig.tsx`, future
mobile port). Related gotchas learned on the same rig:

- SVG rotation is clockwise (y-down): for a wing drawn hanging *below* its
  shoulder pivot, **positive** rotate raises it outward/up; negative sweeps it
  inward across the chest (that inward sweep is exactly the wing-to-chin
  "thinking" gesture).
- `ease` strings inside option objects passed to `animate()` need `as const`;
  `getByteTimeDomainData` wants `Uint8Array<ArrayBuffer>` typing.
- Beak-sync amplitude: `HTMLMediaElement.captureStream()` + AnalyserNode is
  analysis-only and never reroutes playback, but Safari lacks captureStream —
  the rig falls back to a synthetic sine talk level there.
