// Central guard for reanimated entrance ("entering") animations.
//
// In Expo Go, reanimated entrance animations can silently never run: the view
// is mounted at the animation's initial state (opacity 0 / offset) and stays
// there forever, leaving whole screens invisible. Entrance animations are a
// progressive enhancement — visibility must never depend on them — so inside
// Expo Go we drop them entirely (views render directly in their resting
// state). Development and production builds keep the full animations.
//
// When the user has enabled Reduce Motion in their system accessibility
// settings, we also drop entering animations to guarantee text is never left
// at opacity 0 / offset — the animation's initial state — by a skipped
// animation pass.
import Constants from 'expo-constants';
import { useReducedMotion } from 'react-native-reanimated';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

/**
 * THE KILL SWITCH, back ON. Entrance animations run in release builds again.
 *
 * This was set to __DEV__ on 2026-08-19 as an experiment rather than a fix:
 * with no layout animations registered in a release build, the next crash, or
 * its absence, would say whether reanimated was ever involved in the Hermes GC
 * deaths that cost that whole day.
 *
 * THE EXPERIMENT RETURNED AND REANIMATED IS EXONERATED. The build carrying this
 * switch off finished at 19:59 UTC and the app went on dying inside HadesGC at
 * 20:09 and again at 20:27. Every crash stops dead at 20:44, which is when the
 * build that removed expo-video finished, and Sentry has recorded none since.
 * BrandSplash was playing a film from the ROOT layout on every cold start; that
 * was the bug, and it is gone.
 *
 * So this returns to true rather than staying off out of caution. Entrances
 * were ON in the August 16 build that survived five cold starts out of five,
 * which makes on the verified configuration and off the novel one.
 *
 * The switch itself stays, because it earned its keep: the next VM-level scare
 * should cost one edit instead of an afternoon. Flip this constant and every
 * guard below obeys.
 */
const ENTRANCES_ENABLED = true;

/**
 * Wrap every `entering={...}` value with this. Returns the animation as-is in
 * real builds, and `undefined` (no entrance animation) inside Expo Go.
 */
export function appear<T>(animation: T): T | undefined {
  return isExpoGo || !ENTRANCES_ENABLED ? undefined : animation;
}

/**
 * Hook version of `appear`. Returns `undefined` (skipping the entrance
 * animation) both in Expo Go and when the user has enabled Reduce Motion in
 * system accessibility settings, so animated views always render in their
 * final resting state instead of an invisible initial state.
 *
 * Use this wherever content visibility must be guaranteed regardless of
 * animation preference (e.g. FunFactLoader fact text, important labels).
 */
export function useAppear<T>(animation: T): T | undefined {
  const reducedMotion = useReducedMotion();
  return isExpoGo || reducedMotion || !ENTRANCES_ENABLED ? undefined : animation;
}

/**
 * Returns `true` when entrance animations should be suppressed — either
 * because we're running in Expo Go or because the user has enabled Reduce
 * Motion. Use this as a boolean guard in places where the animation value
 * can't be passed to `useAppear` directly (e.g. inside `.map()` callbacks
 * where the animation depends on a loop variable).
 *
 * ```tsx
 * const skipEnter = useAppearSkip();
 * // …
 * entering={skipEnter ? undefined : FadeInDown.delay(i * 60)}
 * ```
 */
export function useAppearSkip(): boolean {
  const reducedMotion = useReducedMotion();
  return isExpoGo || reducedMotion || !ENTRANCES_ENABLED;
}

// ---------------------------------------------------------------------------
// SAFE ENTRANCES: motion that cannot take the content with it.
//
// Confirmed on device 2026-08-19: in a preview build on reanimated 4.1.1 with
// the New Architecture, FadeInDown mounts its view at opacity 0 and never runs.
// The home screen rendered its layout correctly and showed nothing, and the
// stagger was visible in the wreckage: delay-0 blocks faintly there, delay-200
// blocks entirely absent. Turning Reduce Motion on fixed it, which is this
// module's own guard doing its job and confirming the diagnosis.
//
// The guard above is a BLOCKLIST of environments known to break, and a
// blocklist fails open: any environment nobody thought of gets the animation
// and, when it does not run, an invisible screen. Chasing the upstream bug is
// not the fix either, because the next version of it will fail the same way.
//
// So the entrances below carry NO opacity. They move, and movement is all they
// do. An entrance that never runs leaves its content sitting a few pixels off
// its resting place, fully readable, and nobody ever notices. That is a
// progressive enhancement; the fade was not.
import { withDelay, withTiming, type EntryAnimationsValues } from 'react-native-reanimated';

const DEFAULT_MS = 500;
/** Far enough to read as motion, near enough that a stalled one looks fine. */
const TRAVEL = 16;

type Entering = (values: EntryAnimationsValues) => {
  initialValues: Record<string, unknown>;
  animations: Record<string, unknown>;
};

/**
 * EVERY UNIQUE ANIMATION IS BUILT ONCE, EVER.
 *
 * These are called from inside a render body (`entering={appearDown(60, 500)}`)
 * at ~100 sites, so an unmemoised factory mints a brand new worklet on every
 * render of every one of them, and reanimated serialises each new closure
 * across to its UI runtime. The parameters are constants at every call site,
 * so a cache keyed on them collapses ~100 worklets-per-render down to a fixed
 * handful for the app's whole lifetime.
 *
 * THIS WAS NOT THE CRASH FIX, and the comment that used to claim it was has
 * been corrected. It was written on 2026-08-19 as the second of three guesses
 * at build 40's Hermes GC deaths; the real cause was expo-video playing a film
 * from BrandSplash on every cold start. The memoisation stays on its own
 * merits, since minting a hundred throwaway worklets per render is waste
 * whatever the GC thinks of it.
 */
const CACHE = new Map<string, Entering>();

/** A single shared no-op, so the disabled path allocates nothing at all. */
const NO_ENTRANCE: Entering = () => {
  'worklet';
  return { initialValues: {}, animations: {} };
};

function memo(key: string, make: () => Entering): Entering {
  const hit = CACHE.get(key);
  if (hit) return hit;
  const made = make();
  CACHE.set(key, made);
  return made;
}

function slide(from: number, delay: number, duration: number): Entering {
  return () => {
    'worklet';
    return {
      // No opacity key at all: the view is visible from its first frame, and
      // stays visible whatever happens to the animation.
      initialValues: { transform: [{ translateY: from }] },
      animations: {
        transform: [{ translateY: withDelay(delay, withTiming(0, { duration })) }],
      },
    };
  };
}

/** Rises into place. The replacement for FadeInDown. */
export function appearDown(delay = 0, duration = DEFAULT_MS): Entering {
  // Belt and braces: a call site that forgets the guard still gets nothing.
  if (!ENTRANCES_ENABLED) return NO_ENTRANCE;
  return memo(`d${delay}:${duration}`, () => slide(TRAVEL, delay, duration));
}

/** Settles down into place. The replacement for FadeInUp. */
export function appearUp(delay = 0, duration = DEFAULT_MS): Entering {
  // Belt and braces: a call site that forgets the guard still gets nothing.
  if (!ENTRANCES_ENABLED) return NO_ENTRANCE;
  return memo(`u${delay}:${duration}`, () => slide(-TRAVEL, delay, duration));
}

/** Grows into place. The replacement for ZoomIn. */
export function appearZoom(delay = 0, duration = DEFAULT_MS): Entering {
  // Belt and braces: a call site that forgets the guard still gets nothing.
  if (!ENTRANCES_ENABLED) return NO_ENTRANCE;
  return memo(`z${delay}:${duration}`, () => zoom(delay, duration));
}

function zoom(delay: number, duration: number): Entering {
  return () => {
    'worklet';
    return {
      initialValues: { transform: [{ scale: 0.92 }] },
      animations: {
        transform: [{ scale: withDelay(delay, withTiming(1, { duration })) }],
      },
    };
  };
}

/**
 * The replacement for a bare FadeIn.
 *
 * There is no safe way to fade content in from nothing: the initial state IS
 * invisible, so a stalled fade is an empty screen by definition. This renders
 * the content and skips the animation. Losing a fade costs nothing; losing the
 * screen cost an afternoon.
 */
export function appearPlain(): undefined {
  return undefined;
}
