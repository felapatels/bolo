---
name: Script Trace coverage scoring
description: How Script Trace scores traces (interior coverage × precision) and why the demo animation must run on the UI thread
---

## Rule
Script Trace score = interior **coverage × precision**, not Chamfer distance against the glyph outline.

**Why:** Font outlines are the *perimeter* of a filled shape. A stroke drawn correctly through the centre of a letter has large geometric distance to all outline points → old Chamfer score was always low even for correct traces.

Coverage asks: what fraction of the glyph's *filled interior* did the user's strokes reach within a 9-unit tolerance? Drawing through the middle scores well; random scribbles outside score poorly.

**Precision term:** coverage alone let a sloppy trace (whole glyph covered + stray tails outside it) read 100% — user called this out. Precision = fraction of drawn points (subsampled ≤~400) within 1.5× tolerance of any interior point; final score = round(coverage × precision × 100). Looser 1.5× band keeps honest wobble unpunished; UI label is "% accuracy". Keep both platforms' `scoreCoverage` identical — the web vitest suite (incl. a stray-tail regression test and a pass-margin audit over all real glyphs) is the only scoring safety net.

**Pass threshold:** 40 (was 70 with Chamfer — much lower because a well-drawn stroke naturally covers ~60–70% of the interior).

**How to apply:**
- `getInteriorPoints(svgPathD, gridN=16)` — winding-number test against parsed subpath polylines, returns grid of interior points in 0-100 space.
- `getTextInteriorPoints(char)` / `getTextReferencePoints()` — web uses offscreen canvas pixel test; mobile uses a centre-region grid (x: 10–90%, y: 18–76%).
- `scoreCoverage(strokes, referencePoints)` — coverage (reference points reached within `COVERAGE_TOLERANCE = 9`) × precision (drawn points within 1.5× tolerance).
- Text-mode characters now use coverage scoring too — no more auto-pass on first lift.
- Live coverage updates throttled to 150ms during drag; final score sets `liveCoverage` state.
- Failed attempt: uncovered reference points become amber dots overlay (`failedPoints` state / ref).

**Animation (pen-stroke skeleton):** never animate the glyph *outline* — it is the perimeter of a filled shape, so tracing it draws around the outside of the letter, not how it is written. The demo extracts real pen strokes by skeletonizing the glyph (Tegaki-style pipeline): rasterize interior to a 64×64 bitmap → Zhang-Suen thinning → trace 1-px skeleton into polylines split at junctions → **merge collinear segments across junctions BEFORE spur-pruning** (the tiny junction fragments are the bridges; pruning first leaves gaps too wide to merge) → prune spurs → RDP simplify → **Chaikin corner-cut ×2** (RDP output is angular; Chaikin rounds it into hand-drawn curves, stays inside the point hull so interior tests keep passing, endpoints preserved so start dot/ordering unaffected) → orient strokes top-left-first → greedy nearest-next ordering. Result: ~3 natural strokes for simple glyphs (headline, stem, curve). Strokes memoized per character (`extractStrokes` ~20ms/glyph). The green start dot = first point of the first pen stroke. Rejected approaches: outline dashoffset, scanline sweeps, boustrophedon interior dot — all rejected by user as "not how you write".

**Mobile demo MUST animate on the UI thread:** the original rAF + `setState(progress)` driver re-rendered the whole SVG tree over the bridge every frame — user saw it as choppy. Fix: one Reanimated shared value + `withTiming`; per-stroke `useAnimatedProps` on `createAnimatedComponent(SvgPath)` animating only `strokeDashoffset`/`strokeOpacity` (opacity 0 until the stroke's window starts, else round caps paint phantom dots), pen tip = animated `SvgCircle` whose worklet walks plain-array geometry (no React state/objects captured). SVG props are safe in worklets; layout props still crash Expo Go New Arch (see reanimated-layout-props-crash.md). Completion bridges back via `runOnJS`; cancel with `cancelAnimation` on gesture start/unmount. Web canvas rAF was already smooth — only RN needed this.

**Skip:** progress-row "Skip ›" + failed-card "Skip / Skip & Finish" reuse the existing advance handler; skipped characters record nothing to the server.
