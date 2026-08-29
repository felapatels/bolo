/**
 * THE ONE-PAGER MAP'S POSTER (build 20).
 *
 * One painted poster per language, generated to a fixed brief (the line
 * name, the six cities in the language's own script, the six zones, no
 * numbers anywhere but the zone badges), served from the web app's public
 * folder rather than bundled: twenty-two posters would weigh more than the
 * rest of the app's art together, and a language's poster can be replaced
 * without a build. The phone loads it by URL and falls back to a drawn
 * placeholder when the file is not there yet. Web twin: lib/journey-map.ts.
 *
 * THE COUNTS ARE NEVER IN THE ART. Stops per zone differ per language and
 * grow as the replenisher opens groups (owner, 2026-08-29), so the legend
 * under the poster draws them live from the same payloads the journey uses.
 */
export const JOURNEY_MAP_POSTER_ORIGIN = 'https://bolo-india.app';

/** Width over height. The brief asks for 9:16 portrait. */
export const JOURNEY_MAP_POSTER_ASPECT = 9 / 16;

export function journeyMapPosterUrl(languageCode: string): string {
  return `${JOURNEY_MAP_POSTER_ORIGIN}/journey/maps/${encodeURIComponent(languageCode)}.jpg`;
}
