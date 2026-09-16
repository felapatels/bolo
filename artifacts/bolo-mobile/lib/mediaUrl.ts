/**
 * Absolute URLs for media the phone FETCHES rather than bundles.
 *
 * WHY FETCHED AND NOT BUNDLED, decided with the owner 2026-08-24 for both the
 * storybook stills and the Emergency films. Two reasons, and the second is the
 * one that actually settles it:
 *
 *   SIZE. Six films are 12.8MB and 129 stills are about 7MB. Bundling all of it
 *   adds 20MB to a download people make on Indian mobile data.
 *
 *   THE BUILD CYCLE IS THE SLOW PART OF THIS PROJECT. Fetched art goes live the
 *   moment the web app is republished: no EAS build, no App Store review, no
 *   TestFlight round trip. New books and new films stop waiting on Apple.
 *
 * WHAT THIS COSTS, honestly: the phone needs a connection for a picture it has
 * not cached. Practice and audio already need one, so this adds no new class of
 * failure, and every caller here degrades to something readable rather than to
 * a blank screen.
 *
 * SAME PATHS THE WEB APP SERVES, which is the point of putting them in one
 * file. `emergencyFilmPath` and the still id both come from the shared
 * libraries, so a file the scanner wrote and the web app renders cannot be a
 * file the phone asks for under another name.
 */
import { emergencyFilmPath } from "@workspace/emergency";
import { storyStillPath } from "@workspace/story";

/**
 * The host the app is pointed at, set from EXPO_PUBLIC_DOMAIN the same way
 * `setBaseUrl` is in app/_layout.tsx. Media and the API are the same origin, so
 * a build pointed at a preview deployment gets that deployment's art rather
 * than production's.
 */
function host(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  // No domain configured is a development build talking to nothing. Returning
  // an empty prefix yields a relative path that will simply fail to load, which
  // the callers already handle, rather than throwing at render.
  return domain ? `https://${domain}` : "";
}

/**
 * A storybook illustration, by the id the shared library assigns it.
 *
 * EXPO_PUBLIC_STORY_MEDIA_HOST is a DEVELOPMENT override, added 2026-09-16 so
 * the owner could see new book art in the simulator before any of it was
 * published: the art is served from the Mac (for example http://localhost:8765)
 * while the API stays on EXPO_PUBLIC_DOMAIN. Unset in every EAS profile, so a
 * store build always fetches from its own domain.
 *
 * THE DIRECTORY COMES FROM lib/story (storyStillPath, STORY_ART_DIR), moved
 * 2026-09-16 from `/story/` to `/story/madlib/`: the rewritten books bundle
 * new words, and a build already in the App Store would otherwise fetch the
 * new pictures beside its old narration. The dev override serves the same
 * layout: `<override>/story/madlib/<id>.webp`.
 */
export function storyStillUrl(stillId: string): string {
  const override = process.env.EXPO_PUBLIC_STORY_MEDIA_HOST;
  return `${override || host()}/${storyStillPath(stillId)}`;
}

/** A zone's Emergency film. */
export function emergencyFilmUrl(journey: number, zone: number): string {
  return `${host()}/${emergencyFilmPath(journey, zone)}`;
}
