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
  // DARKER PLANKS (build 22, owner: "make the wood planks on the track
  // larger and darker"). Was #8A5D4A over #361C0F.
  tie: '#6B4130',
  /** Their underside, for the raised-bed read. */
  tieInk: '#22110A',
  /** The two rails running over them: olive, as the sheet draws them. */
  // VIOLET RAILS ON BOTH RUNS from build 17. Owner: "The track ahead should
  // have the two parallel purple lines." The rail stroke is the pair of
  // rails (the wider stroke under the centre one); ahead, the centre is
  // transparent so the sleepers show between two violet lines, and the run
  // is no longer dashed. Travelled, the centre is a brighter violet with the
  // halo under it. State is said by the light down the middle, not by a dash.
  rail: '#8B5CF6',
  /** WHAT SHOWS BETWEEN THE TWO RAILS, and this is the correction. It was a
   *  wood brown under a pair of wide soft green halo passes, which washed the
   *  whole track pale green and lost the twin-rail read entirely: reported
   *  from the preview as "train tracks don't look right".
   *
   *  The sheet does not draw a halo. It draws a BRIGHT GREEN CENTRE STRIPE
   *  running down the middle of a brown sleeper ladder, and that stripe is what
   *  says "travelled". Read off a horizontal cut through the sheet's own rail:
   *  brown sleeper ends, olive rails, then this down the centre. */
  // PURPLE FROM BUILD 17 (owner's journey mockup: "incorporate the modern
  // look and the rustic look"). The travelled run's centre stripe and its
  // halo take the app's violet; the wood ladder and the olive rails stay, so
  // the track is still a painted railway with a modern light down it.
  // Owner, on the first shot: "completed track should have green center and
  // two purple lines. future track should be only 2 purple lines, not
  // filled." So the travelled centre is the sheet's green again, the halo
  // green with it, and ahead there is nothing between the rails at all.
  between: '#84CC16', // the owner's lime, sent as a swatch: not the mint #4ADE80
  /** The same centre, untravelled: plain wood, no green. */
  /** A narrow glow under the lit centre only. It replaces two 28px and 18px
   *  passes that were three times the width of the track itself. */
  glow: '#BEF264',
} as const;

/** The halo's two passes, wide-and-soft under tight-and-bright. One gradient
 *  would be simpler and react-native-svg cannot draw one along a bezier, so
 *  both platforms draw the same two strokes instead. */
export const RAIL_GLOW_PASSES = [
  { width: 16, opacity: 0.5 },
] as const;

/** Stroke widths for the track itself, sleepers outward. */
/** HEAVIER, ALL FOUR NUMBERS (chat 11): "the train tracks arent heavy enough
 *  or they are too transparent." Opacity was already 1 everywhere, so weight
 *  was the honest lever: fatter sleepers on a denser rhythm, wider rails, a
 *  centre stripe half again as bold, to match the chunky ladder the reference
 *  draws. */
/** HEAVIER AND A BIT WIDER AGAIN (build 22, owner, on the journey notes:
 *  "Our current tracks can stay but need to be much heavier and a bit wider,
 *  they are the centerpoint of the journey."). The shape is unchanged; every
 *  number grew: sleepers 18 to 26 on a 7 11 rhythm, rails 12 to 16 over a 9
 *  centre, the run ahead 3.5 lines 12.5 apart so the outer edges still span
 *  the 16, the glow 16 under it. */
export const RAIL_STROKE = {
  // Planks 32 wide on a 10 12 rhythm (build 22, "larger"); 26 on 7 11
  // before that, 18 on 5 9 before build 22.
  tie: 32,
  // 16 over 9 from build 22 (12 over 7 from build 17, 9.5 over 6.5 before):
  // each rail is 3.5 wide now.
  rail: 16,
  between: 9,
  /** THE RUN AHEAD (build 17): two thin strokes a gauge apart, no mask.
   *  3.5 wide each, centres 12.5 apart, so their outer edges match the 16
   *  the travelled run's rail stroke spans. */
  line: 3.5,
  gauge: 12.5,
  /** The sleeper rhythm. The untravelled run is not dashed any more (build
   *  17): it is two violet lines with the wood showing between them. */
  tieDash: '10 12',
  /** THE RUN AHEAD IS FULLY OPAQUE. It was 0.55, then 0.88, and both times it
   *  still read as a ghost over a painting: "future rail segments are too
   *  transparent", twice. Alpha was never the right lever here. Real track is
   *  real track, and the state is already said twice without it: the run ahead
   *  is DASHED and it has no green down its centre. */
  unlitOpacity: 1,
} as const;
