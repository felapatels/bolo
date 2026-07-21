---
name: Script Trace glyph guides
description: Constraints for the font-outline trace guides and why the scorer must be direction- and contour-aware
---

Script Trace guides are exact glyph outlines generated from the committed Noto fonts by a script in the scripts package — regenerate, never hand-edit the guide strings, and keep the web and mobile data files identical.

**Rules:**
- The in-game path parser only understands absolute M/L/Q/C; the generator must emit only those (Z becomes an explicit close line).
- Scoring must be direction- and order-independent. **Why:** guides are closed multi-contour outlines with no canonical stroke order; an order/window-based comparison made scribbles outscore honest traces at every threshold. (Current mechanism: interior-coverage scoring — see script-trace-coverage-scoring.md; the older symmetric-Chamfer approach is retired.)
- Guide sampling must respect subpath (M) boundaries — never interpolate across them. **Why:** otherwise phantom "connector" segments between contours are scored as real geometry.
- Guide display must render the raw path data (Path2D / SVG d), not the sampled polyline, or contours get joined by visible straight lines.

**How to apply:** any change to guide data, the parser, or the scorer must keep these invariants; the web test suite has a scoring regression test covering them. Known limit: dense space-filling scribbles can still pass — accepted.
