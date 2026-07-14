// Central guard for reanimated entrance ("entering") animations.
//
// In Expo Go, reanimated entrance animations can silently never run: the view
// is mounted at the animation's initial state (opacity 0 / offset) and stays
// there forever, leaving whole screens invisible. Entrance animations are a
// progressive enhancement — visibility must never depend on them — so inside
// Expo Go we drop them entirely (views render directly in their resting
// state). Development and production builds keep the full animations.
import Constants from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

/**
 * Wrap every `entering={...}` value with this. Returns the animation as-is in
 * real builds, and `undefined` (no entrance animation) inside Expo Go.
 */
export function appear<T>(animation: T): T | undefined {
  return isExpoGo ? undefined : animation;
}
