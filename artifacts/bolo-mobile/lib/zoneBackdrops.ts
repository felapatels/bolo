/**
 * THE PAINTED ZONE BACKDROPS. One illustration per fare zone, sitting behind
 * the rail on the journey map. Asked for 2026-08-26 with a reference picture:
 * "big ux change on journey. this is what i'm imagining."
 *
 * Web twin: src/lib/zone-backdrops.ts. Keep the keys and the tones in step.
 *
 * SIX PAINTINGS, NOT 132. The six zones are fixed across all 22 languages, so
 * every line's zone 1 is the same picture. That was the owner's explicit call
 * and it is what makes painted art affordable here at all. The consequence is
 * that a LINE no longer looks different from another line in its scenery: the
 * Gujarat Express and the Bengal line share these six. Line identity moved
 * entirely to the rail colour, the line name and the zone's geographic name,
 * all of which are per-line and drawn in code.
 *
 * That is also why none of the six contains a recognisable real monument or a
 * word of text. Zone 1 is a generic town gateway rather than India Gate,
 * because zone 1 is "Ahmedabad Junction" on one line and "Howrah Junction" on
 * another and the name is drawn over the picture, not painted into it.
 *
 * KEYED BY ZONE ORDINAL, 0-BASED, matching `postcardYs[i].zoneIndex` and the
 * existing `ZoneVista`. This is the opposite of lib/stopSplash.ts, which keys
 * by category id ON PURPOSE so journey 2 falls through to no film. Here the
 * ordinal is right: journey 2 has the same six-zone shape, and a painted
 * backdrop behind its rail is better than a blank one even where the scene
 * does not match the category.
 */

/** The paintings, in fare-zone order. */
export const ZONE_BACKDROPS: readonly number[] = [
  require('../assets/journey/zone-1.jpg') as number, // gateway arch, a town waking up
  require('../assets/journey/zone-2.jpg') as number, // family lane, balconies and carrom
  require('../assets/journey/zone-3.jpg') as number, // clock tower over a market square
  require('../assets/journey/zone-4.jpg') as number, // chai stalls and food carts
  require('../assets/journey/zone-5.jpg') as number, // covered bazaar
  require('../assets/journey/zone-6.jpg') as number, // the festival palace finale
];

/**
 * The average tone of each painting's BOTTOM EDGE, sampled from the shipped
 * file rather than guessed.
 *
 * Two jobs. It is the ground a band paints before its image has decoded, so a
 * slow load never flashes light behind the rail. And it is the colour a band
 * fades into at its foot, which is how one zone hands over to the next without
 * a visible seam: all six sit in the same warm brown family, which is the only
 * reason a colour bridge works here at all.
 */
export const ZONE_FOOT_TONES: readonly string[] = [
  '#8B5C50',
  '#926F62',
  '#905B4C',
  '#7F5049',
  '#A47966',
  '#9E6346',
];

/** The painting for a fare zone, or null past the end of the set. */
export function zoneBackdrop(zoneIndex: number): number | null {
  return ZONE_BACKDROPS[zoneIndex] ?? null;
}

/**
 * WHERE THE POSTCARD'S PICTURE SIDE SITS IN THE PAINTING, per fare zone, as a
 * vertical position in the same sense as CSS `object-position: center Y%` sense: 0 is the top of the painting, 100 the
 * bottom, and the band is only about 9% of the painting's height because the
 * postcard's picture side is roughly 6.25:1 and the paintings are 1280x2276.
 *
 * Web twin: ZONE_VISTA_Y in src/lib/zone-backdrops.ts, where these numbers go
 * straight into object-position. React Native has no such property, so the
 * vista turns the same number into a pixel offset by hand. Keep them in step.
 *
 * PICKED BY LOOKING, NOT BY FORMULA. Every offset here was cut at the real
 * display size, 350x56, and compared against its neighbours as a set. A band
 * chosen on arithmetic alone lands on whatever happens to be 8% down, and what
 * is 8% down differs painting by painting.
 *
 * Four of the six sit at 8, which is the skyline: a landmark silhouette against
 * a dusk sky with fireworks over it. The two exceptions are the whole reason
 * this is a table rather than a constant.
 *
 * ZONE 4 SITS AT 0 BECAUSE IT HAS NO SKYLINE. The chai-stall street is roofed
 * by awnings and lantern strings from its very first row, so 8 lands inside an
 * arcade and reads as mush at 56px tall. Zero keeps the last sliver of dusk sky,
 * which is what makes it a member of the same set as the other five.
 *
 * ZONE 6 SITS AT 16 BECAUSE THE TERMINUS SHOULD LOOK LIKE ONE. The palace's
 * three domes only clear the band's bottom edge that far down; at 8 the
 * fireworks are lovely and the palace is a clipped hint.
 */
export const ZONE_VISTA_Y: readonly number[] = [8, 8, 8, 0, 8, 16];

/** The postcard's picture side, and the fallback when a zone has no painting. */
export const ZONE_VISTA = {
  height: 56,
  /** How far a locked showroom zone's vista is drained. */
  grayedOpacity: 0.55,
  /** The paintings' intrinsic size, all six identical. Web never needs these,
   *  because object-fit works it out; mobile does, because it has to scale the
   *  picture to the postcard's width by hand before it can offset it. */
  artW: 860,
  artH: 1359,
} as const;

/** The vista's vertical position for a fare zone, defaulting to the skyline. */
export function zoneVistaY(zoneIndex: number): number {
  return ZONE_VISTA_Y[zoneIndex] ?? 8;
}

/**
 * Where to put the painting inside the postcard's picture side, given how wide
 * that postcard turned out to be.
 *
 * THIS IS WEB'S `object-position: center Y%`, WORKED OUT BY HAND, and it is a
 * function rather than three lines inside the component because it is the only
 * arithmetic in the vista and arithmetic is the part worth asserting. CSS reads
 * the percentage as "line up Y% of the picture with Y% of the frame", which for
 * a picture taller than its frame comes out as Y% of the overflow. Mobile has
 * no such property, so it scales the painting to the postcard's width and
 * slides it up by exactly that.
 */
export function zoneVistaOffset(
  zoneIndex: number,
  width: number,
): { width: number; height: number; top: number } {
  const height = width * (ZONE_VISTA.artH / ZONE_VISTA.artW);
  const slack = Math.max(0, height - ZONE_VISTA.height);
  return { width, height, top: -(zoneVistaY(zoneIndex) / 100) * slack };
}

/** The foot tone for a fare zone, falling back to the splash ground. */
export function zoneFootTone(zoneIndex: number): string {
  return ZONE_FOOT_TONES[zoneIndex] ?? '#89695B';
}

/**
 * How far the backdrop is dimmed under the rail and the cards.
 *
 * The paintings are busy on purpose and the cards are opaque paper, but the
 * rail, the stop markers and the zone signage all sit directly on the art.
 * A flat scrim at this alpha is what keeps them legible without washing the
 * picture out; it is a single value here so both platforms cannot drift.
 */
/**
 * THE PAINTINGS ARE VERTICALLY TILEABLE AND ARE DRAWN AT THE BAND'S FULL
 * WIDTH, which is the fix for "the background images zoomed in too" and "I'm
 * only seeing the top left corner of the background image".
 *
 * They used to be drawn with `cover` across a band as tall as its whole zone.
 * An eleven-stop zone is about 390 by 1200, and against a 1280x2276 painting
 * `cover` scales to fill the HEIGHT and throws away 42% OF THE WIDTH. The
 * learner saw a slice of a street, blown up, and never the street.
 *
 * Fitting to the width instead shows the whole painting and leaves the height
 * to be filled by repeating, so each file cross-fades its own bottom 170 rows
 * into its top: the road carries through the join rather than meeting sky at a
 * hard line. Same cut as the wide desktop bazaar, same reason.
 *
 * IT ALSO MADE THE BUNDLE SMALLER. Fitting to width means the art never needs
 * to be taller than a phone is wide times its aspect, so 860x1359 replaces
 * 1280x2276: 1.9MB for the six against 4.4MB.
 */
export const ZONE_TILE_ASPECT = 860 / 1359;

/**
 * THE WASH OVER THE PAINTING, and it is LIGHT now, not dark (chat 11). The
 * 0.28 near-black scrim knocked the whole bazaar into dusk, and the owner's
 * reference is bright daylight: "add a lighter layer behind the image to
 * brighten the image up a little bit." A warm paper tone rather than white,
 * so the painting lifts without going grey. Web twin holds the same pair.
 */
/** 0.22 read as faded ("too light, it looks faded now"); 0.10 lifts the dusk
 *  without washing the pigment out. */
export const ZONE_BACKDROP_SCRIM = 0.1;
export const ZONE_BACKDROP_SCRIM_COLOR = '#FFF3DE';

/**
 * THE CARVED STATION BOARD, the zone header. Asked for on 2026-08-26: "even
 * the zone header should be like what i generated."
 *
 * Web twin: ZONE_BOARD in src/lib/zone-backdrops.ts.
 *
 * THREE SLICES, NOT ONE IMAGE, and Android is the reason again. The board is a
 * carved pediment over a cream panel, and only the panel may stretch: scaling
 * the whole PNG to a taller box would stretch the rosettes and the arch with
 * it. Nine-slice would express that in one file and React Native's is iOS only
 * (`capInsets` does nothing on Android), so the sheet is cut into a fixed top,
 * a one-band middle that stretches vertically, and a fixed bottom. Three
 * stacked images behave identically on both platforms. The seams are invisible
 * because the middle band is cut from flat panel.
 *
 * IT FITS INSIDE THE 184px THE MAP ALREADY RESERVES (PC_H), and that is a hard
 * constraint rather than a preference. The serpentine constants are shared with
 * the scenery placement tests, and the stops, halts and every scenery position
 * hang off them, so a taller header would be a re-plumb of the map's geometry
 * rather than a paint pass. The panel is therefore given the remainder and
 * clips, so the board can never push into the first station row whatever copy
 * lands in it.
 *
 * THE VISTA BAND CAME OFF THE BOARD to make that budget, and the reference is
 * why rather than the arithmetic: the owner's board carries a nameplate and a
 * fact, not a picture. The picture was never adding anything the page did not
 * already have, since the whole map now sits on that same painting.
 */
export const ZONE_BOARD = {
  /** The slices, and the size they were cut at. */
  artW: 760,
  topH: 142,
  /** The panel is the rest of the file, so the two are contiguous. */
  panelH: 202,
  /** Where the nameplate and the zone plate sit inside the top slice, as a
   *  fraction of it, so the overlays scale with the board. */
  namePlate: { left: 0.17, right: 0.17, top: 0.42, height: 0.23 },
  zonePlate: { width: 0.21, top: 0.68, height: 0.24 },
  /** Ink on the carved plates: the sheet's own darkest wood. */
  /** THE PANEL'S OWN CREAM, and it is load-bearing rather than decorative.
   *  The sheet's paper is drawn with PARTIAL ALPHA, roughly 20 to 250 down the
   *  panel, so the slice alone is see-through and the painted backdrop reads
   *  straight through the board. Reported from the preview with a screenshot.
   *  This goes underneath the slice; the art then supplies the texture and the
   *  frame rather than the opacity. */
  panel: '#F9EBD5',
  /**
   * WHERE THE ART ACTUALLY IS, as fractions of the board's width, measured off
   * zone-sign-mid.png's own pixels rather than guessed.
   *
   * The slice is NOT edge to edge. Its first 28 of 760 columns are fully
   * transparent, then the dark outer frame line, then cream, then an inner
   * rule, and only at about 47/760 does the panel interior begin. So a cream
   * fill across the whole container spills into the transparent margin and
   * reads as a panel WIDER than the pediment above it, and content padded a
   * few flat pixels crosses the drawn frame. Both were reported at once: "card
   * overlaps the actual sign".
   */
  /** The outer frame line: the cream may not start before this. */
  /**
   * THE ART IS NOT CENTRED IN ITS OWN FILE, which is why these are a pair
   * rather than one number. Scanning zone-sign-panel.png for its first and last
   * opaque column gives a 3.68% margin on the left and 5.39% on the right. A
   * symmetric fill therefore poked roughly 1.7% of the width out past the right
   * frame and drew a pale strip down the outside of the board: "just caught
   * this right side spills over". Each side is now inset a hair INSIDE its own
   * margin, which the opaque outer frame line covers.
   */
  panelInsetLeft: 0.04,
  panelInsetRight: 0.057,
  /**
   * THE PANEL'S INTERIOR, ALL FOUR SIDES, measured off zone-sign-panel.png's
   * own pixels: the outer frame, two inner rules, then clear paper. The
   * horizontal pair are fractions of the board's WIDTH and the vertical pair of
   * the panel's HEIGHT, which is why the content box is positioned rather than
   * padded: a percentage padding in CSS resolves against the width on all four
   * sides, so a vertical inset written that way is wrong by however much the
   * board is wider than it is tall.
   *
   * THE VERTICAL PAIR IS THE ONE I KEPT MISSING. Three rounds of "the card
   * overlaps the sign" were fixed horizontally each time, and the title went on
   * sitting on the panel's top rule because nothing had ever inset it
   * vertically at all.
   */
  contentInset: 0.08,
  contentInsetTop: 0.119,
  contentInsetBottom: 0.149,
  ink: '#5A2C16',
  inkMuted: '#8A5B40',
} as const;

/**
 * THE BOARD, IN TWO CONTIGUOUS PIECES.
 *
 * IT WAS THREE AND THAT WAS THE BUG. A fixed pediment, a 40px band from the
 * middle of the panel, and a fixed foot: the band was cut from y 220-260 and
 * the foot from y 300, so the art between 142-220 and 260-300 was simply
 * SKIPPED. Stretching the band then butted two unrelated rows of a drawn frame
 * against each other and the join showed as a jog in the rule: "what about
 * this line sloppy".
 *
 * Two pieces cannot have that fault. The pediment keeps its aspect because its
 * rosettes and arch must not stretch, and the panel is the WHOLE remainder of
 * the file, 142 to 344, squashed to whatever height is left. Squashing a frame
 * a little is invisible; losing 78 rows out of the middle of one is not.
 */
export const ZONE_BOARD_ART = {
  top: require('../assets/journey/zone-sign-top.png') as number,
  panel: require('../assets/journey/zone-sign-panel.png') as number,
} as const;

/**
 * THE SMALLEST PANEL THE BOARD'S CONTENT CAN LIVE IN, in points.
 *
 * The panel carries a city name, a stop count and the fact strip, about 72pt of
 * copy, inside insets worth 26.8% of its height. So it needs roughly 98, and
 * the board must leave that after the pediment takes its aspect.
 *
 * THIS EXISTS BECAUSE THE BOARD SHIPPED BLANK TWICE. mobile's PC_H was 152
 * against web's 184 and I never checked, so the panel had 85pt for 98pt of
 * content and overflow hidden turned "does not fit" into "is not there". A
 * screenshot cannot tell those apart; this can.
 */
export const ZONE_BOARD_MIN_PANEL_H = 98;

/** The pediment's height at a given board width, which is pure aspect. */
export function zoneBoardPedimentH(boardWidth: number): number {
  return (boardWidth * ZONE_BOARD.topH) / ZONE_BOARD.artW;
}

/** What the panel is left with once the pediment has taken its share. */
export function zoneBoardPanelH(boardWidth: number, boardHeight: number): number {
  return boardHeight - zoneBoardPedimentH(boardWidth);
}
