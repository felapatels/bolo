/**
 * THE STOP TRANSITION. Tapping a stop on the journey cross-fades the map out
 * under a short film of that stop's zone, which then fades into the stop's own
 * page. Asked for 2026-08-26: "i want to use this quick splash every time
 * someone selects a stop that fades away into the stop's page."
 *
 * Web twin: src/lib/stop-splash.ts. Keep the zone keys in step.
 *
 * ONE ANIMATED VALUE, AND THAT IS THE WHOLE DESIGN. The owner's first ask was
 * for the stops themselves to fall away, which is N elements each animating
 * position and opacity while a video mounts beside them. Per CLAUDE.md the
 * native animation driver DOES NOT TICK in release builds of this app (build
 * 270 measured a value on `true` coming out dead flat while the same value on
 * `false` moved beside it), and six of seven store builds once shipped with
 * animations frozen outright. A per-element scatter is the riskiest shape of
 * feature this codebase has. The overlay's single fade is the same mechanism
 * BrandSplash already runs on device today, so it is the one that survives a
 * frozen build.
 *
 * THE FILMS ARE THE OWNER'S, NOT GENERATED. A push-in on the zone's still
 * backdrop was offered and rejected for a good reason: these have people
 * walking in them. Measured on the same patch of crowd half a second apart,
 * two porters change stride AND change their spacing relative to each other,
 * which a zoom cannot do because a zoom preserves relative spacing.
 *
 * Trimmed to 1.2s from 3s and encoded at CRF 28 (VMAF 96.0 against the
 * delivered file). The delivered files are ~15MB each; these are ~660KB to
 * ~1.1MB. 1.2s is chosen to cover the navigation and the stop page's first
 * render rather than to be watched: three seconds on every stop tap is an
 * interstitial a learner waits through.
 */
import { useSyncExternalStore } from 'react';

/**
 * ONE FILM PER ZONE, keyed by the CATEGORY ID, and that choice is load-bearing.
 * The six zones are fixed across all 22 languages, so this is six files rather
 * than 132.
 *
 * KEYED ON THE ID, NOT ON THE ZONE ORDINAL, and journey 2 is the reason.
 * journeyLines.ts spells out that journey 1's zone ids are 1-6 only because
 * those rows were inserted first, while journey 2's landed at 277-282. Keying
 * on a 1-based ordinal would hand journey 2's zone 1 the gateway-arch film,
 * which belongs to Greetings & Manners and has nothing to do with Travel &
 * Directions. Keying on the id means journey 2 falls through to null and gets
 * no transition, which is correct: there are no journey 2 films.
 *
 * ALL SIX ARE HERE. Zone 6 arrived after the other five and slotted in with a
 * single line, which is the point of the shape: `stopSplashFor` returns null
 * for anything missing and the overlay simply does not play, so a zone without
 * a film navigates instantly rather than failing. That path is still live and
 * is what a seventh zone would land on.
 */
const FILMS: Record<number, number> = {
  1: require('../assets/journey/stop-zone-1.mp4') as number,
  2: require('../assets/journey/stop-zone-2.mp4') as number,
  3: require('../assets/journey/stop-zone-3.mp4') as number,
  4: require('../assets/journey/stop-zone-4.mp4') as number,
  5: require('../assets/journey/stop-zone-5.mp4') as number,
  6: require('../assets/journey/stop-zone-6.mp4') as number,
};

/** The film for a zone, or null where there is not one yet. */
export function stopSplashFor(zoneId: number): number | null {
  return FILMS[zoneId] ?? null;
}

/**
 * The fade UP onto the film.
 *
 * The overlay used to appear in one frame at full opacity and only the exit
 * was animated, which is most of why it read as abrupt: "doesn't feel smooth
 * enough, fade it in and out" (2026-08-27). 220 is long enough to register as
 * a fade and short enough that it does not delay a film that is only holding
 * for 1200.
 */
export const STOP_SPLASH_ENTER_MS = 220;

/**
 * How long the overlay holds before it starts fading out.
 *
 * 1400, was 1200. The hold now has a 220 fade in front of it, and keeping the
 * old number would have cut the same amount off the part a learner actually
 * watches. This keeps the film's own visible stretch where it was.
 */
export const STOP_SPLASH_HOLD_MS = 1400;

/**
 * The fade from the film to the stop page.
 *
 * 420, was 260. Out slower than in (220) on purpose: an entrance wants to be
 * over quickly, an exit that snaps is the half that reads as a cut.
 */
export const STOP_SPLASH_EXIT_MS = 420;

/**
 * A module store rather than a context, because the trigger is inside the
 * navigator and the overlay is above it. A provider spanning both would have to
 * wrap the Stack, and the one thing this overlay must not do is re-render the
 * navigator every time a stop is tapped.
 */
let zone: number | null = null;
const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function snapshot(): number | null {
  return zone;
}

function emit(): void {
  for (const l of listeners) l();
}

/**
 * Start the transition for a zone. Call it immediately BEFORE the navigation,
 * not after: the overlay has to be on screen before the stop page mounts, or
 * the learner sees the page appear and then get covered up.
 *
 * A zone with no film is a no-op, so callers never have to check.
 */
export function playStopSplash(zoneId: number): void {
  if (stopSplashFor(zoneId) === null) return;
  zone = zoneId;
  emit();
}

/**
 * The zone whose film is up right now, or null: a synchronous read for a
 * screen deciding whether to START one. Build 21: the home pass starts the
 * journey's arrival film at the tear, so the journey, mounting under it,
 * must not start it again when its own zone resolves.
 */
export function currentStopSplashZone(): number | null {
  return zone;
}

/** Called by the overlay when its fade finishes, or when a tap skips it. */
export function endStopSplash(): void {
  if (zone === null) return;
  zone = null;
  emit();
}

/** The zone currently transitioning, or null. */
export function useStopSplashZone(): number | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
