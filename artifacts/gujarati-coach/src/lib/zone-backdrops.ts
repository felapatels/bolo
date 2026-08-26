/**
 * THE PAINTED ZONE BACKDROPS. One illustration per fare zone, sitting behind
 * the rail on the journey map. Asked for 2026-08-26 with a reference picture:
 * "big ux change on journey. this is what i'm imagining."
 *
 * Mobile twin: lib/zoneBackdrops.ts. Keep the keys and the tones in step.
 *
 * SIX PAINTINGS, NOT 132. The six zones are fixed across all 22 languages, so
 * every line's zone 1 is the same picture. That was the owner's explicit call
 * and it is what makes painted art affordable here at all. The consequence is
 * that a LINE no longer differs from another line in its scenery: the Gujarat
 * Express and the Bengal line share these six. Line identity moved entirely to
 * the rail colour, the line name and the zone's geographic name, all of which
 * are per-line and drawn in code.
 *
 * That is also why none of the six contains a recognisable real monument or a
 * word of text. Zone 1 is a generic town gateway rather than India Gate,
 * because zone 1 is "Ahmedabad Junction" on one line and "Howrah Junction" on
 * another and the name is drawn over the picture, not painted into it.
 */

/** The paintings, in fare-zone order, keyed by 0-based zone ordinal. */
export const ZONE_BACKDROPS: readonly string[] = [
  `${import.meta.env.BASE_URL}journey/zone-1.jpg`, // gateway arch, a town waking up
  `${import.meta.env.BASE_URL}journey/zone-2.jpg`, // family lane, balconies and carrom
  `${import.meta.env.BASE_URL}journey/zone-3.jpg`, // clock tower over a market square
  `${import.meta.env.BASE_URL}journey/zone-4.jpg`, // chai stalls and food carts
  `${import.meta.env.BASE_URL}journey/zone-5.jpg`, // covered bazaar
  `${import.meta.env.BASE_URL}journey/zone-6.jpg`, // the festival palace finale
];

/**
 * The average tone of each painting's BOTTOM EDGE, sampled from the shipped
 * file rather than guessed.
 *
 * Two jobs. It is the ground a band paints before its image has loaded, so a
 * slow fetch never flashes light behind the rail. And it is the colour a band
 * fades into at its foot, which is how one zone hands over to the next without
 * a visible seam: all six sit in the same warm brown family, which is the only
 * reason a colour bridge works here at all.
 */
export const ZONE_FOOT_TONES: readonly string[] = [
  "#8B5C50",
  "#926F62",
  "#905B4C",
  "#7F5049",
  "#A47966",
  "#9E6346",
];

/** The painting for a fare zone, or null past the end of the set. */
export function zoneBackdrop(zoneIndex: number): string | null {
  return ZONE_BACKDROPS[zoneIndex] ?? null;
}

/** The foot tone for a fare zone, falling back to the splash ground. */
export function zoneFootTone(zoneIndex: number): string {
  return ZONE_FOOT_TONES[zoneIndex] ?? "#89695B";
}

/**
 * How far the backdrop is dimmed under the rail and the cards.
 *
 * The paintings are busy on purpose and the cards are opaque paper, but the
 * rail, the stop markers and the zone signage all sit directly on the art.
 * A flat scrim at this alpha is what keeps them legible without washing the
 * picture out; it is a single value shared with mobile so the two cannot drift.
 */
export const ZONE_BACKDROP_SCRIM = 0.28;
