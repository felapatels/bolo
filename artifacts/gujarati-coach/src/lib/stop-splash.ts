/**
 * THE STOP TRANSITION. Tapping a stop on the journey cross-fades the map out
 * under a short film of that stop's zone, which then fades into the stop's own
 * page. Asked for 2026-08-26: "i want to use this quick splash every time
 * someone selects a stop that fades away into the stop's page."
 *
 * Mobile twin: lib/stopSplash.ts. Keep the zone keys and the timings in step.
 *
 * The mobile twin carries a long note about why this is ONE animated value and
 * not a per-stop scatter, and the reason is a trap that only exists there: the
 * native animation driver does not tick in release builds of that app. On web a
 * scatter would be free. It is still one fade here, because the two surfaces
 * are hand-maintained twins and a transition that feels different on each is
 * worse than one that is slightly less ambitious on both.
 *
 * THE FILMS ARE THE OWNER'S, NOT GENERATED. A push-in on the zone's still
 * backdrop was offered and rejected for a good reason: these have people
 * walking in them. Measured on the same patch of crowd half a second apart,
 * two porters change stride AND change their spacing relative to each other,
 * which a zoom cannot do because a zoom preserves relative spacing.
 *
 * Trimmed to 1.2s from 3s and encoded at CRF 28 (VMAF 96.0 against the
 * delivered file). The delivered files are ~15MB each; these are ~640KB to
 * ~1.1MB, 4.5MB for the set of six. 1.2s covers the navigation and the stop
 * page's first paint rather than being something to watch.
 */
import { useSyncExternalStore } from "react";

/**
 * ONE FILM PER ZONE, keyed by the zone id in JOURNEY_ZONES. The six zones are
 * fixed across all 22 languages, so this is six files rather than 132.
 *
 * A zone with no entry returns null and the overlay simply does not play, so a
 * stop in an unfilmed zone navigates instantly rather than failing. That is the
 * path a seventh zone would land on.
 */
const FILMS: Record<number, string> = {
  1: `${import.meta.env.BASE_URL}journey/stop-zone-1.mp4`,
  2: `${import.meta.env.BASE_URL}journey/stop-zone-2.mp4`,
  3: `${import.meta.env.BASE_URL}journey/stop-zone-3.mp4`,
  4: `${import.meta.env.BASE_URL}journey/stop-zone-4.mp4`,
  5: `${import.meta.env.BASE_URL}journey/stop-zone-5.mp4`,
  6: `${import.meta.env.BASE_URL}journey/stop-zone-6.mp4`,
};

/** The film for a zone, or null where there is not one. */
export function stopSplashFor(zoneId: number): string | null {
  return FILMS[zoneId] ?? null;
}

/** How long the overlay holds before it starts fading out. */
export const STOP_SPLASH_HOLD_MS = 1200;

/** The fade from the film to the stop page. */
export const STOP_SPLASH_EXIT_MS = 260;

/**
 * A module store rather than a context, because the trigger is inside the
 * router and the overlay is above it. A provider spanning both would have to
 * wrap AppRouter, and the one thing this overlay must not do is re-render the
 * whole router every time a stop is tapped.
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

/** Called by the overlay when its fade finishes, or when a click skips it. */
export function endStopSplash(): void {
  if (zone === null) return;
  zone = null;
  emit();
}

/** The zone currently transitioning, or null. */
export function useStopSplashZone(): number | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
