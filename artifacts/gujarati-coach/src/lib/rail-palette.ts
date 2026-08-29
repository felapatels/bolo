/**
 * THE RAIL PALETTE, sampled from the owner's own rail sheet on 2026-08-26
 * rather than picked, so the drawn track matches the art it was drawn from.
 * Pulled with a palette reduction over the two tiles on that sheet.
 *
 * Mobile twin: lib/railPalette.ts. An exact-shape test on each side asserts
 * the WHOLE object, so a value changed on one platform fails on the other.
 * That is the same guard STALL_PLACEMENT carries, and it is here because the
 * rail shipped to mobile alone on 2026-08-26 while the commit message said
 * both. A constant with a twin needs a test that can tell.
 *
 * TWO STATES, AND THEY MEAN PROGRESS, NOT BRAND. Behind the learner the track
 * is plain wood; ahead of them it is the same wood under a green halo. The
 * owner's sheet drew it exactly that way and chose it over a line-coloured
 * rail: "ship the green rail, it looks better".
 *
 * THE LINE ACCENT IS DELIBERATELY NOT HERE. It used to colour the rail itself,
 * and with six paintings now shared across all 22 lines that made the rail the
 * last place a line looked like itself. It is not the right place:
 * green-means-done is a STATUS and a status should read the same on every line.
 * The accent still carries the station markers, the fare-zone postcards and the
 * comet sweep, all of which are identity rather than state.
 */
export const RAIL = {
  /** The sleeper planks. */
  tie: "#8A5D4A",
  /** Their underside, for the raised-bed read. */
  tieInk: "#361C0F",
  /** The two rails running over them. */
  // VIOLET RAILS ON BOTH RUNS from build 17 (mobile) and build 18 (web).
  // Owner: "The track ahead should have the two parallel purple lines." The
  // rail stroke is the pair of rails (the wider stroke under the centre one);
  // ahead, there is nothing between them so the sleepers show between two
  // violet lines, and the run is no longer dashed. Travelled, the centre is
  // the sheet's green with the halo under it. State is said by the light down
  // the middle, not by a dash.
  rail: "#8B5CF6",
  /** WHAT SHOWS BETWEEN THE TWO RAILS, and this is the correction. It was a
   *  wood brown under a pair of wide soft green halo passes, which washed the
   *  whole track pale green and lost the twin-rail read entirely: reported
   *  from the preview as "train tracks don't look right".
   *
   *  The sheet does not draw a halo. It draws a BRIGHT GREEN CENTRE STRIPE
   *  running down the middle of a brown sleeper ladder, and that stripe is what
   *  says "travelled". Read off a horizontal cut through the sheet's own rail:
   *  brown sleeper ends, olive rails, then this down the centre. */
  // Owner, on the first build-17 shot: "completed track should have green
  // center and two purple lines. future track should be only 2 purple lines,
  // not filled", then "that looks yellow, not green" of #ECF584. The lime was
  // sent as a swatch; #4ADE80 was mint and went too.
  between: "#84CC16",
  /** A narrow glow under the lit centre only. It replaces two 28px and 18px
   *  passes that were three times the width of the track itself. */
  glow: "#BEF264",
} as const;

/** The halo's two passes, wide-and-soft under tight-and-bright. One gradient
 *  would be simpler and react-native-svg cannot draw one along a bezier, so
 *  both platforms draw the same two strokes instead. */
export const RAIL_GLOW_PASSES = [
  { width: 12, opacity: 0.5 },
] as const;

/** Stroke widths for the track itself, sleepers outward. */
/** HEAVIER, ALL FOUR NUMBERS (mobile chat 11, web build 18): "the train
 *  tracks arent heavy enough or they are too transparent." Opacity was
 *  already 1 everywhere, so weight was the honest lever: fatter sleepers on
 *  a denser rhythm, wider rails, a centre stripe half again as bold, to match
 *  the chunky ladder the reference draws. */
export const RAIL_STROKE = {
  tie: 18,
  // 12 over 7 from build 17, was 9.5 over 6.5: each rail is 2.5 wide now,
  // enough to read as two lines ahead rather than one band.
  rail: 12,
  between: 7,
  /** THE RUN AHEAD (build 17): two thin strokes a gauge apart, no mask.
   *  2.5 wide each, centres 9.5 apart, so their outer edges match the 12
   *  the travelled run's rail stroke spans. */
  line: 2.5,
  gauge: 9.5,
  /** The sleeper rhythm. The untravelled run is not dashed any more (build
   *  17): it is two violet lines with the wood showing between them. */
  tieDash: "5 9",
  /** THE RUN AHEAD IS FULLY OPAQUE. It was 0.55, then 0.88, and both times it
   *  still read as a ghost over a painting: "future rail segments are too
   *  transparent", twice. Alpha was never the right lever here. Real track is
   *  real track, and the state is already said without it: the run ahead has
   *  nothing between its rails. */
  unlitOpacity: 1,
} as const;
