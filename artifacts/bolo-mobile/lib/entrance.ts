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
 * Wrap every `entering={...}` value with this. Returns the animation as-is in
 * real builds, and `undefined` (no entrance animation) inside Expo Go.
 */
export function appear<T>(animation: T): T | undefined {
  return isExpoGo ? undefined : animation;
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
  return isExpoGo || reducedMotion ? undefined : animation;
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
  return isExpoGo || reducedMotion;
}
