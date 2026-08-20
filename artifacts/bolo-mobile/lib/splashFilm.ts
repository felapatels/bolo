/**
 * The boot film and its still.
 *
 * ONE require() per asset, following lib/tearAudio.ts: Metro resolves static
 * requires at bundle time, so swapping the film is editing the paths below and
 * rebuilding. There is no runtime path to change.
 *
 * THE FILM IS AN ANIMATED WEBP, NOT AN MP4, AND THAT IS THE ENTIRE POINT.
 * The mp4 was played by expo-video from BrandSplash, which mounts at the ROOT
 * layout, so a film was decoded on EVERY cold start and the app died inside the
 * Hermes GC three or four launches out of five. Fifteen crashes on 2026-08-19,
 * every one of them stopping the moment expo-video came out.
 *
 * An animated WebP goes through expo-image's image pipeline instead. No
 * AVPlayer, no VideoToolbox, none of the JSI machinery that broke us. It is the
 * same film at 720x1600 and 24fps, and at 2.3MB it is SMALLER than the 2.8MB
 * mp4 it replaces, which is no longer required and so no longer bundled.
 *
 * Regenerate it from the mp4 with ffmpeg and img2webp:
 *   ffmpeg -i welcome-bolo.mp4 -vf "fps=24,scale=720:-2:flags=lanczos" f/%04d.png
 *   img2webp -loop 0 -kmin 9 -kmax 30 -d 41 -lossy -q 70 -m 6 f/*.png -o welcome-bolo.webp
 * The -lossy flag is load-bearing: img2webp defaults to LOSSLESS, which turns
 * this same film into 4.7MB without warning you.
 *
 * The still is BOTH the reduced-motion frame and the film's placeholder, so the
 * overlay never paints empty before the first frame decodes.
 *
 * The web twin is gujarati-coach/src/components/brand-splash.tsx. It still
 * plays the mp4 through a <video> tag and is deliberately untouched: there is
 * no Hermes on web and nothing there ever crashed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SPLASH_MOTION = require('../assets/splash/welcome-bolo.webp') as number;
export const SPLASH_POSTER = require('../assets/splash/welcome-bolo-poster.png') as number;

/**
 * THE KILL SWITCH, and it is OFF because the film failed worse than the video.
 *
 * The animated WebP crashed FIVE cold starts out of FIVE on device, 2026-08-19.
 * That is not a regression to the old bug, it is worse than it: expo-video was
 * intermittent at three or four in five, and this was total.
 *
 * I argued that expo-image's pipeline was a different enough mechanism to be
 * safe. That was an argument and not evidence, which is exactly the caveat
 * written into this comment's first version, and the device settled it in the
 * time it takes to launch an app five times.
 *
 * So the splash is the still again, which is the state that launched clean 5/5
 * twice today. SPLASH_MOTION and the .webp stay in the tree deliberately: the
 * asset is correct and the encode recipe above is worth keeping, and whoever
 * picks this up next should start from a working file rather than re-deriving
 * it. What is NOT settled is why a 122-frame 720x1600 animation kills this app
 * at launch, and nobody should flip this back to true without that answer.
 */
export const SPLASH_MOTION_ENABLED = false;

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
