/**
 * THE ONE-PAGER MAP'S POSTER (build 20).
 *
 * One painted poster per language, generated to a fixed brief (the line
 * name, the six cities in the language's own script, the six zones, no
 * numbers anywhere but the zone badges), served from this app's public
 * folder at journey/maps/<code>.jpg. The phone loads the same file by URL.
 * Mobile twin: lib/journeyMap.ts.
 *
 * THE COUNTS ARE NEVER IN THE ART. Stops per zone differ per language and
 * grow as the replenisher opens groups (owner, 2026-08-29), so the legend
 * under the poster draws them live from the same payloads the journey uses.
 */

/** Width over height. The brief asks for 9:16 portrait. */
export const JOURNEY_MAP_POSTER_ASPECT = 9 / 16;

export function journeyMapPosterUrl(languageCode: string): string {
  return `${import.meta.env.BASE_URL}journey/maps/${encodeURIComponent(languageCode)}.jpg`;
}
