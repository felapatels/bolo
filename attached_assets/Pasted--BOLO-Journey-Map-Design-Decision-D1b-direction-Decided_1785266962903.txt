# BOLO Journey Map — Design Decision (D1b direction)

Decided July 28, 2026, from three mockups built in `artifacts/mockup-sandbox` (task #794). Screenshots of all three are in the mockup sandbox; this file records the decision and rationale so D1b's spec can be written against it.

## Decision

**The Gujarat Express** (Mockup C) is the base structure, merged with elements from B and A:

- **From C (base):** vertical rail-line layout. Stations = lessons, fare zones = regions/categories. Boarding-pass header showing route ("Ahmedabad → Dwarka"), station count ("12/27 stations"), and streak as ticket validity. Native-script accents (e.g., "બોલો રેલ" / Bolo Rail).
- **From B:** postcard checkpoints at fare-zone completion ("Greetings from Ahmedabad!" with chapter summary and Collected state). Postcards are the collectible layer.
- **From A:** small scenic markers as station-adjacent garnish (chai stall, Uttarayan kites, Sidi Saiyyed Jali) — decoration, not navigation.

## Why C won

1. A rail line is an honest list: scales to 27+ nodes, scrolls naturally, cheap to render on mid-tier Android — no winding-path layout math.
2. The metaphor is culturally native, not costume: the railway is the shared travel experience of India. Route + station count tells a story a progress bar cannot.
3. It extends for free: festival events = special trains; test-out = express service skipping stations; streak = ticket validity; per-language journeys = different routes/lines.
4. Boarding pass header is a personality moment no competitor has.

## Why not A (winding path)

Duolingo homage; every language app has it. Horizontal meandering wastes phone width; rendering and hit-testing cost grows with node count. Its scenic markers were the only element worth keeping.

## Rejected/deferred notes

- B alone was safe but generic (a chapter list). Its postcard execution was the best single element across all three and survives in the merge.
- All mockups assume the ~27-lesson chunking (lessons of ~10 phrases within categories) — that lesson-grouping data model remains the D1a prerequisite before any of this ships.

## Dependencies for D1b spec (when written)

1. D1a: lesson grouping + sequence/unlock model + test-out (per earlier decision: full sequential gating with test-out, both together or neither).
2. Postcard artwork per region (placeholder pattern as with mascot until illustrated).
3. Fare-zone naming per language (Gujarat route exists conceptually; other languages need their own routes — content work).