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
  tie: '#966F53',
  /** Their underside, for the raised-bed read. */
  tieInk: '#361C0F',
  /** The two rails running over them. */
  rail: '#CCB191',
  /** What shows BETWEEN the two rails: more sleeper, not the page.
   *  It used to be the theme background, which was invisible over a flat theme
   *  and PUNCHES A THEMED HOLE THROUGH A PAINTED BACKDROP: a strip of page
   *  colour running the length of the map, straight down the middle of every
   *  painting. Web carried exactly that hole until 2026-08-26. */
  between: '#7A5B43',
  /** The lit halo. Two passes fake a falloff without a gradient. */
  glow: '#ABF1A5',
} as const;

/** The halo's two passes, wide-and-soft under tight-and-bright. One gradient
 *  would be simpler and react-native-svg cannot draw one along a bezier, so
 *  both platforms draw the same two strokes instead. */
export const RAIL_GLOW_PASSES = [
  { width: 28, opacity: 0.2 },
  { width: 18, opacity: 0.32 },
] as const;

/** Stroke widths for the track itself, sleepers outward. */
export const RAIL_STROKE = {
  tie: 15,
  rail: 8.5,
  between: 4,
  /** The sleeper rhythm, and the dash an untravelled run is drawn with. */
  tieDash: '3 11',
  unlitDash: '9 7',
  /** How far an untravelled run is knocked back. */
  unlitOpacity: 0.55,
} as const;
