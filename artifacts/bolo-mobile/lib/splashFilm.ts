/**
 * The boot still.
 *
 * ONE require() per asset, following lib/tearAudio.ts: Metro resolves static
 * requires at bundle time, so swapping it is editing the path below and
 * rebuilding. There is no runtime path to change.
 *
 * THERE IS NO FILM HERE ANY MORE, AND TWO ATTEMPTS ARE WHY.
 *
 * The mp4 was played by expo-video from BrandSplash, which mounts at the ROOT
 * layout, so a film decoded on EVERY cold start. Removing it did not stop the
 * launch crash; see CLAUDE.md, because an older commit message claims it did.
 *
 * Then the same film was encoded as an animated WebP and played through
 * expo-image. That failed five cold starts out of five, and so did the very
 * next build with the animation switched OFF and expo-image rendering nothing
 * but this poster. One line apart from a build that had just gone 5 for 5:
 *
 *   d429f289  react-native Image, still poster   5 launches, 0 crashes
 *   c56157f0  expo-image, animated WebP          5 launches, 5 crashes
 *   0f349d37  expo-image, same still poster      5 launches, 5 crashes
 *
 * So the FILM was never the variable and the encode was never the problem. The
 * Image component was. expo-image is no longer imported anywhere in this app.
 *
 * assets/splash/welcome-bolo.webp stays on disk unreferenced, because the
 * encode was the fiddly part and is worth keeping for whoever finds a renderer
 * that survives this launch path. img2webp defaults to LOSSLESS, which turns
 * this film into 4.7MB rather than 2.3MB, so -lossy is load-bearing:
 *   ffmpeg -i welcome-bolo.mp4 -vf "fps=24,scale=720:-2:flags=lanczos" f/%04d.png
 *   img2webp -loop 0 -kmin 9 -kmax 30 -d 41 -lossy -q 70 -m 6 f/*.png -o welcome-bolo.webp
 *
 * The web twin is gujarati-coach/src/components/brand-splash.tsx. It still
 * plays the mp4 through a <video> tag and is deliberately untouched: there is
 * no Hermes on web and nothing there ever crashed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
