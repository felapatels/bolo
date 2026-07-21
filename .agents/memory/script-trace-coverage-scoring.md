---
name: Script Trace coverage scoring
description: Why and how Script Trace switched from Chamfer distance to interior-coverage scoring
---

## Rule
Script Trace uses interior *coverage* scoring, not Chamfer distance against the glyph outline.

**Why:** Font outlines are the *perimeter* of a filled shape. A stroke drawn correctly through the centre of a letter has large geometric distance to all outline points → old Chamfer score was always low even for correct traces.

Coverage asks: what fraction of the glyph's *filled interior* did the user's strokes reach within a 9-unit tolerance? Drawing through the middle scores well; random scribbles outside score poorly.

**Pass threshold:** 40% interior coverage (was 70 with Chamfer — much lower because a well-drawn stroke naturally covers ~60–70% of the interior).

**How to apply:**
- `getInteriorPoints(svgPathD, gridN=16)` — winding-number test against parsed subpath polylines, returns grid of interior points in 0-100 space.
- `getTextInteriorPoints(char)` / `getTextReferencePoints()` — web uses offscreen canvas pixel test; mobile uses a centre-region grid (x: 10–90%, y: 18–76%).
- `scoreCoverage(strokes, referencePoints)` — fraction of reference points reached by any stroke point within `COVERAGE_TOLERANCE = 9`.
- Text-mode characters now use coverage scoring too — no more auto-pass on first lift.
- Live coverage updates throttled to 150ms during drag; final score sets `liveCoverage` state.
- Failed attempt: uncovered reference points become amber dots overlay (`failedPoints` state / ref).

**Animation (pen-stroke skeleton):** never animate the glyph *outline* — it is the perimeter of a filled shape, so tracing it draws around the outside of the letter, not how it is written. The demo extracts real pen strokes by skeletonizing the glyph (Tegaki-style pipeline): rasterize interior to a 64×64 bitmap → Zhang-Suen thinning → trace 1-px skeleton into polylines split at junctions → **merge collinear segments across junctions BEFORE spur-pruning** (the tiny junction fragments are the bridges; pruning first leaves gaps too wide to merge) → prune spurs → RDP simplify → orient strokes top-left-first → greedy nearest-next ordering. Result: ~3 natural strokes for simple glyphs (headline, stem, curve). Web draws them progressively on canvas; mobile uses per-stroke SVG dasharray/dashoffset with a pen-tip dot at `pointAtLength`. Strokes memoized per character (`extractStrokes` ~20ms/glyph). The green start dot = first point of the first pen stroke. Rejected approaches: outline dashoffset, scanline sweeps, boustrophedon interior dot — all rejected by user as "not how you write".
