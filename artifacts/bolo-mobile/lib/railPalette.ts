/**
 * THE RAIL PALETTE, sampled from the owner's own rail sheet on 2026-08-26
 * rather than picked, so the drawn track matches the art it was drawn from.
 * Pulled with a palette reduction over the two tiles on that sheet.
 *
 * Web twin: src/lib/rail-palette.ts. An exact-shape test on each side asserts
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
  tie: '#8A5D4A',
  /** Their underside, for the raised-bed read. */
  tieInk: '#361C0F',
  /** The two rails running over them: olive, as the sheet draws them. */
  rail: '#8E9B43',
  /** WHAT SHOWS BETWEEN THE TWO RAILS, and this is the correction. It was a
   *  wood brown under a pair of wide soft green halo passes, which washed the
   *  whole track pale green and lost the twin-rail read entirely: reported
   *  from the preview as "train tracks don't look right".
   *
   *  The sheet does not draw a halo. It draws a BRIGHT GREEN CENTRE STRIPE
   *  running down the middle of a brown sleeper ladder, and that stripe is what
   *  says "travelled". Read off a horizontal cut through the sheet's own rail:
   *  brown sleeper ends, olive rails, then this down the centre. */
  between: '#ECF584',
  /** The same centre, untravelled: plain wood, no green. */
  betweenUnlit: '#9A8A6B',
  /** A narrow glow under the lit centre only. It replaces two 28px and 18px
   *  passes that were three times the width of the track itself. */
  glow: '#ABF1A5',
} as const;

/** The halo's two passes, wide-and-soft under tight-and-bright. One gradient
 *  would be simpler and react-native-svg cannot draw one along a bezier, so
 *  both platforms draw the same two strokes instead. */
export const RAIL_GLOW_PASSES = [
  { width: 9, opacity: 0.45 },
] as const;

/** Stroke widths for the track itself, sleepers outward. */
export const RAIL_STROKE = {
  tie: 15,
  rail: 8.5,
  between: 4,
  /** The sleeper rhythm, and the dash an untravelled run is drawn with. */
  tieDash: '3 11',
  unlitDash: '9 7',
  /** THE RUN AHEAD IS FULLY OPAQUE. It was 0.55, then 0.88, and both times it
   *  still read as a ghost over a painting: "future rail segments are too
   *  transparent", twice. Alpha was never the right lever here. Real track is
   *  real track, and the state is already said twice without it: the run ahead
   *  is DASHED and it has no green down its centre. */
  unlitOpacity: 1,
} as const;
