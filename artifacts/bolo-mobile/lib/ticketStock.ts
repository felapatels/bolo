/**
 * THE STOP CARD AS A PAPER TICKET, sampled from the owner's own element sheet
 * (pageelements.jpeg, 2026-08-26) rather than picked, so the drawn card matches
 * the art it was drawn from. Values read off the raw pixels of the two
 * horizontal tags on that sheet, not eyedropped by eye.
 *
 * Web twin: src/lib/ticket-stock.ts. An exact-shape test on each side asserts
 * the whole object, so a value edited on one platform fails on the other.
 *
 * WHY DRAWN AND NOT THE RASTER TAG ITSELF. The sheet's tags are one fixed size
 * and a stop card is not: it carries one to three lines plus an optional
 * progress track, and the map lays its rows out on a fixed pitch. Stretching
 * the art needs nine-slice, and REACT NATIVE'S NINE-SLICE IS iOS ONLY
 * (`capInsets` does nothing on Android, which wants a 9-patch drawable a
 * required() PNG cannot be). That would have meant three implementations of one
 * card background across two hand-maintained twins. Drawn from the sheet's own
 * palette, the same card stretches to any size on both platforms and costs no
 * bundle bytes. The sheet is still the reference, and its emblems ARE used as
 * art, because a medallion is one fixed size.
 *
 * THE STOCK IS CREAM IN BOTH THEMES, which is a deliberate break from the rest
 * of the app. A ticket lying on a painting is a physical object: the painting
 * does not have a dark mode and neither does the paper on top of it. A navy
 * card in dark mode was the old theme-token behaviour and it read as a UI panel
 * floating over the art rather than as something resting on it.
 */
export const TICKET = {
  /** The paper, top to bottom. The sheet's stock is warmer at the top. */
  stockTop: '#FAECD7',
  stockBottom: '#F2DDC2',
  /** The stock for a stop the learner cannot ride yet: the same paper, aged. */
  stockAheadTop: '#EDE3D2',
  stockAheadBottom: '#E2D6C1',
  /** The tag's border. Brown as standard, gold once the stop is behind you. */
  edge: '#7A5443',
  edgeGold: '#C9A94E',
  /** The border on a stop not yet reached: the same brown, drained. */
  edgeAhead: '#A99680',
  /** The hairline rule set in from the border, the sheet's inner frame. */
  rule: '#CBA37E',
  ruleGold: '#E0C77E',
  /** The eyelet the tag hangs by, and the hole through it. */
  eyelet: '#3A2418',
  eyeletHole: '#6B4A33',
  /** Ink on cream. The theme foreground is a cool slate and reads cold here. */
  ink: '#3B2A1E',
  inkMuted: '#7A6551',
  /** Ink on an unreached tag. */
  inkAhead: '#8A7A66',
} as const;

/** The tag's geometry, in px, shared so the two platforms cut the same shape. */
export const TICKET_SHAPE = {
  radius: 10,
  borderWidth: 2,
  /** How far the hairline rule sits inside the border. */
  ruleInset: 4,
  /** The eyelet disc on the rail-facing edge. */
  eyeletSize: 12,
  eyeletHoleSize: 5,
} as const;

/**
 * THE BADGES, RUSTIC. Asked for on 2026-08-26: "even update the badges to be
 * more rustic like my example".
 *
 * They used to take the LINE ACCENT, which made a Trace chip magenta on one
 * line and teal on another and put a flat UI pill on a painted map. The
 * reference draws them as small enamelled plates in the sheet's own colours,
 * so they now come off the element sheet: the locomotive's green for a tracing
 * stop, the medallion's wood brown for a story.
 *
 * SAME REASONING AS THE RAIL. A badge says what KIND of stop this is, and a
 * kind is not a line identity: Trace means the same thing on all 22 lines, so
 * it should look the same on all 22. Line identity stays with the rail name,
 * the postcards and the comet.
 */
export const BADGE = {
  /** The sheet's locomotive green, for a tracing stop. */
  traceBg: '#5A7A52',
  traceEdge: '#7FA180',
  /** The medallion's wood, for a story stop. */
  storyBg: '#8A5B40',
  storyEdge: '#B08863',
  /** Aged brass, for the All-Access and free-taste plates. */
  brassBg: '#A8863C',
  brassEdge: '#D9BE72',
  /** Ink on all four: the sheet's paper, so a plate reads as enamel on wood. */
  ink: '#FAECD7',
} as const;

/**
 * A SMALL GLYPH NEEDS A GROUND ON A PAINTING. Reported twice from the preview:
 * "chachaji is basically invisible" and "signals are hard to see on dark
 * background". Both are one fault. A signal post is 20px of drawn line art and
 * the backdrop is a painted bazaar at roughly its own scale and contrast, so
 * the glyph reads as more bazaar. Nothing is wrong with the glyphs; they had
 * nothing behind them.
 *
 * Two passes rather than one gradient, the same trick the rail halo uses: a
 * radial gradient wants a defs entry per use in SVG and cannot be drawn along
 * anything in react-native-svg without one either.
 */
export const MAP_GLYPH_PLATE = [
  { r: 26, opacity: 0.2 },
  { r: 17, opacity: 0.34 },
] as const;

/** The plate's colour: the ticket's own stock, so the map has one paper. */
export const MAP_GLYPH_PLATE_FILL = '#FAECD7';
