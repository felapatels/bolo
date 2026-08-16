/**
 * The boot film and its still.
 *
 * ONE require() per asset, following lib/tearAudio.ts: Metro resolves
 * static requires at bundle time, so swapping the film is editing the
 * two paths below and rebuilding. There is no runtime path to change.
 *
 * The still is BOTH the reduced-motion frame and the video's poster,
 * so the overlay never paints empty before the first frame decodes.
 *
 * The web twin is gujarati-coach/src/components/brand-splash.tsx and
 * the two assets are byte-identical copies of its portrait pair.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SPLASH_FILM = require('../assets/splash/welcome-bolo.mp4') as number;
export const SPLASH_POSTER = require('../assets/splash/welcome-bolo-poster.png') as number;

/** Film length, 5.067s. The full-play timer must OUTLAST it or the last
 *  frame is cut. Move this if the film is ever swapped for a longer one. */
export const SPLASH_FULL_PLAY_MS = 5100;
export const SPLASH_MIN_HOLD_MS = 1500;
export const SPLASH_MAX_HOLD_MS = 8000;
export const SPLASH_EXIT_MS = 260;

/**
 * The day's first cold start plays the film through.
 *
 * Key and value format BOTH match web's `bolo-splash-day` exactly, so a
 * learner who uses both platforms gets one day boundary rather than two.
 * That means the unpadded `YYYY-M-D` web uses, NOT the zero-padded form
 * goalCelebratedStorageKey uses on this platform.
 */
export const SPLASH_DAY_KEY = 'bolo-splash-day';

export function splashToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function isFirstColdStartToday(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SPLASH_DAY_KEY)) !== splashToday();
  } catch {
    // Fail CLOSED, matching web: an unreadable stamp means NOT the first,
    // so a storage failure never means the full film on every launch.
    return false;
  }
}

export async function markFullPlayed(): Promise<void> {
  try {
    await AsyncStorage.setItem(SPLASH_DAY_KEY, splashToday());
  } catch {
    /* A nicety. Losing the stamp only means it plays full again. */
  }
}
