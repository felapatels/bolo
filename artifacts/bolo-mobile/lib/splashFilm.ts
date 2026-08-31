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

/**
 * THE FILM, UNTOUCHED. The original 1080x2400 encode at 60fps, no re-encode and
 * no downscale, because a video decoder streams frames instead of holding them
 * and so has none of the memory ceiling a frame sequence does. Measured: the
 * same film as a full-resolution JPEG sequence is 11.7MB bundled and over a
 * GIGABYTE of decoded pixels at 24fps. That is not a tuning problem, it is the
 * wrong mechanism.
 */
export const SPLASH_FILM = require('../assets/splash/welcome-bolo.mp4') as number;

/**
 * The still under the film, for a FULL launch, which plays from 0.
 *
 * Verified build 26 by re-cutting the film at 0 and comparing: RMSE 1.6%
 * against this file, which is JPEG noise. It is the frame at zero.
 */
export const SPLASH_POSTER = require('../assets/splash/welcome-bolo-poster.jpg') as number;

/**
 * The same still for a SHORT launch, which opens at SPLASH_SHORT_START_S.
 *
 * WHY TWO POSTERS. The underlay exists to cover the gap before the film's
 * first frame decodes, and the plate normally hides that gap entirely: it only
 * lifts once the film has painted. But the frame failsafe lifts the plate
 * whether or not the film painted, and THAT is when the poster is actually
 * seen. With one poster it was the frame at 0, the stretch of this film with
 * no bird in it, and the film then popped in at 2.6s with Bolo already in
 * shot. A jump, on the launch path, on every launch but the day's first.
 *
 * There is no ambiguity about which to show: the mode is decided from storage
 * before the failsafe can fire, so by the time this is visible the answer is
 * known. Before it is decided the plate is still down and neither is seen.
 *
 * HOW TO RE-CUT IT if the film is ever changed. Both posters are plain frame
 * grabs at quality 90, and they must be re-cut TOGETHER, from the same encode:
 *
 *   the frame at 0                -> welcome-bolo-poster.jpg
 *   the frame at SPLASH_SHORT_START_S -> welcome-bolo-poster-short.jpg
 *
 * ffmpeg is the obvious tool and it was BROKEN on the owner's Mac in build 26
 * (a Homebrew x265 dylib the installed ffmpeg was not built against), so the
 * cut was made with AVFoundation instead, which needs nothing installed:
 * AVAssetImageGenerator with both time tolerances set to zero, so it lands on
 * the named instant rather than snapping to the nearest keyframe. The
 * tolerances matter: without them a 2.6s request can return a frame from a
 * second earlier, which is the whole bug again.
 */
export const SPLASH_POSTER_SHORT = require('../assets/splash/welcome-bolo-poster-short.jpg') as number;

/**
 * THE HANDOVER PLATE (build 18). The native splash is the bird on WHITE now
 * (app.json's splash.backgroundColor), and the boot film opens on the bazaar,
 * so the two used to meet at a hard cut. Owner: "Bolo bird has a brown
 * background when you first launch. instead i want it with a white background
 * and crossfade with intro animation."
 *
 * expo-splash-screen can fade the native splash out on iOS ONLY (setOptions'
 * `fade` is @platform ios in v31), so the crossfade is drawn here instead, on
 * both platforms: BrandSplash paints the same bird on the same white as its
 * TOP layer, the native splash hides behind it (an invisible cut, plate for
 * plate), and the plate then fades over the film once the root reports the
 * native splash gone.
 *
 * THE BIRD IS DRAWN THE WAY THE NATIVE SPLASH DRAWS IT, or the cut shows. With
 * the top-level `expo.splash` key and no "expo-splash-screen" plugin entry,
 * @expo/prebuild-config takes its LEGACY branch (getIosSplashConfig /
 * getAndroidSplashConfig): iOS draws the image full-screen aspect-fit
 * (enableFullScreenImage_legacy), Android at imageWidth 200dp. Check both
 * again if app.json ever gains a plugin entry, because that branch draws a
 * 100pt logo instead and the plate would have to follow it.
 */
export const SPLASH_HANDOVER_BIRD = require('../assets/images/mascot/mascot-wave.png') as number;
/** Byte-identical to app.json's splash.backgroundColor; a test holds them together. */
export const SPLASH_HANDOVER_GROUND = '#FFFFFF';
/** How wide Android's native splash draws the bird (prebuild's legacy imageWidth). */
export const SPLASH_HANDOVER_BIRD_ANDROID_W = 200;
/** The crossfade from the bird to the film. */
export const SPLASH_HANDOVER_FADE_MS = 600;
/**
 * How long the plate may wait for the film's first frame before fading
 * anyway (build 23). The crossfade used to start the moment the native
 * splash was gone, whether or not the decoder had a frame yet, so on a store
 * build the bird faded onto the poster and the film then popped over it, and
 * the same launch could rewind the film under the fade when the day's first
 * play resolved late: "there is a flicker between the bolo bird and the
 * splash video playing when i launch." The plate now holds until the film
 * has drawn its first frame at the right start. This is the cap on that
 * hold, so a decoder that never reports (a broken file, an emulator without
 * video) cannot park the bird on screen for good; past it the old behaviour
 * resumes, poster first.
 */
export const SPLASH_FILM_FRAME_FAILSAFE_MS = 1200;

/**
 * THE GREETING WAVE, as twelve JPEG frames swapped through react-native's own
 * `Image`. No new package, no new native module, no decoder we do not already
 * trust, because that trust is the only thing left standing after 2026-08-19.
 *
 * WHY FRAMES AND NOT A FILM. Two renderers have now killed this app from the
 * ROOT layout: expo-video, and expo-image, the latter proven by a build that
 * crashed 5 of 5 while rendering nothing but a STILL. What survived ten
 * consecutive cold starts is `Image` from react-native, so that is the only
 * thing the launch path is allowed to use, and a frame sequence is the only way
 * to move a picture through it.
 *
 * WHY ONLY THE WAVE. The film has two acts: the bird greets you on a near-white
 * plate for a second, then flies off into the bazaar. Only the first act is a
 * splash. The rest ends mid-flight, and holding a mid-flight frame for the
 * remaining 3.6s of a FULL play looks like a stall rather than a finish. These
 * twelve frames are the window where the "Welcome to BOLO!" bubble is up.
 *
 * PING-PONGED, so it loops seamlessly whatever the source cycle was: forward to
 * the last frame, back to the first, forever. 22 steps at 12fps is a 1.83s
 * cycle, which fits inside SPLASH_MIN_HOLD_MS and repeats cleanly beyond it.
 *
 * THE BUDGET, measured rather than hoped: 640px wide, q5 JPEG, 364KB for all
 * twelve, which is LESS than the 472KB poster beside them. Worst case if every
 * frame is held decoded at once is about 42MB.
 *
 *   ffmpeg -t 1.0 -i welcome-bolo.mp4 -vf "fps=12,scale=640:-2:flags=lanczos" -q:v 5 wave/%02d.jpg
 */
export const SPLASH_WAVE: number[] = [
  require('../assets/splash/wave/01.jpg'),
  require('../assets/splash/wave/02.jpg'),
  require('../assets/splash/wave/03.jpg'),
  require('../assets/splash/wave/04.jpg'),
  require('../assets/splash/wave/05.jpg'),
  require('../assets/splash/wave/06.jpg'),
  require('../assets/splash/wave/07.jpg'),
  require('../assets/splash/wave/08.jpg'),
  require('../assets/splash/wave/09.jpg'),
  require('../assets/splash/wave/10.jpg'),
  require('../assets/splash/wave/11.jpg'),
  require('../assets/splash/wave/12.jpg'),
];

/** 22 ping-pong steps at this rate is a 1.83s cycle. */
export const SPLASH_WAVE_FPS = 12;

/**
 * THE KILL SWITCH, BACK ON, because the three failures that turned it off were
 * all measured on a launch path that was crashing anyway.
 *
 * Every attempt at motion here was made on react-native-worklets 0.5.1, which
 * has since been proven to crash this app on launch THIRTY times out of THIRTY.
 * That includes the wave itself: a9b11df4 scored 9 in 10, and 350af74e, which is
 * runtime-identical to it with the switch OFF, scored the same 9 in 10. The
 * wave was never the variable. Nothing on that launch path was.
 *
 * On 0.8.3 the same binary lineage goes 10 cold starts for 10. So the question
 * "can the splash move" has never actually been asked under conditions where
 * the answer could be trusted, and this build asks it.
 *
 * The frames are unchanged from a9b11df4: twelve JPEGs at 640px, 364KB total,
 * which is less than the 472KB poster they sit beside, ping-ponged at 12fps
 * through react-native's own Image. No new library, no new native module.
 *
 * If this crashes, the switch goes back to false and the wave frames stay on
 * disk. If it does not, the splash moves for the first time since 2026-08-16.
 */
export const SPLASH_MOTION_ENABLED = true;

/** Film length is 5.042s as of the 2026-08-20 re-shoot. The full-play timer
 *  must OUTLAST it or the last frame is cut, and 5100 still does. Move this if
 *  the film is ever swapped for a longer one. */
export const SPLASH_FULL_PLAY_MS = 5100;
/**
 * WHERE THE SHORT SPLASH STARTS, and why it is not zero.
 *
 * Bolo does not enter the frame until about 1.8s and does not land until about
 * 3.9s. SPLASH_MIN_HOLD_MS is 1500, so a READY-mode launch that played from the
 * beginning would show the one stretch of this film with no bird in it: Chacha
 * -ji waving at an empty sky. Every launch except the day's first looked like
 * the mascot had been cut out of his own splash.
 *
 * So the short mode OPENS ON THE BEAT WHERE BOLO IS ALREADY IN SHOT. From 2.6s
 * the minimum hold runs to 4.1s, which covers the descent and the landing at
 * 3.9s with room to spare. A slower launch simply holds longer on him perched.
 *
 * The day's first cold start still rewinds to 0 and plays the whole thing.
 */
export const SPLASH_SHORT_START_S = 2.6;

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
