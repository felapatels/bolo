---
name: Script Trace glyph guides
description: Constraints for the font-outline trace guides and why the scorer must be direction- and contour-aware
---

Script Trace guides are exact glyph outlines generated from the committed Noto fonts by a script in the scripts package — regenerate, never hand-edit the guide strings, and keep the web and mobile data files identical.

**Rules:**
- The in-game path parser only understands absolute M/L/Q/C; the generator must emit only those (Z becomes an explicit close line — emit it UNCONDITIONALLY, even when the contour already ends on its start point).
- Curve samplers must hit t=1 exactly: iterate an integer counter (`k/20`), never `t += 0.05`. **Why:** float accumulation overshoots 1 and skips the endpoint, so a contour whose last command is a curve stays unclosed → the winding-number inside test leaks → phantom skeleton geometry at the bitmap edge (x≈0) plus uncoverable interior points that silently drag coverage scores down.
- Scoring must be direction- and order-independent. **Why:** guides are closed multi-contour outlines with no canonical stroke order; an order/window-based comparison made scribbles outscore honest traces at every threshold. (Current mechanism: interior-coverage scoring — see script-trace-coverage-scoring.md; the older symmetric-Chamfer approach is retired.)
- Guide sampling must respect subpath (M) boundaries — never interpolate across them. **Why:** otherwise phantom "connector" segments between contours are scored as real geometry.
- Guide display must render the raw path data (Path2D / SVG d), not the sampled polyline, or contours get joined by visible straight lines.

**How to apply:** any change to guide data, the parser, or the scorer must keep these invariants; the web test suite has a scoring regression test covering them (property tests over all 620 items). Test-side gotcha: when a property test estimates an outline bbox, sample densely (~1600 points) — the default 80 spread over up-to-60-contour sentences underestimates true extremes and false-flags valid strokes. Known limit: dense space-filling scribbles can still pass — accepted.
