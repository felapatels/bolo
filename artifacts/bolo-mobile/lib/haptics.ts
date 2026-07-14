import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Single home for tap feedback so every touchpoint feels consistent:
 * - light  — navigation/selection taps (cards, rows, tabs, toggles, links)
 * - medium — primary/confirming actions (matches the ChunkyButton feel)
 * - heavy  — rare celebratory pulses (e.g. a 90+ pronunciation score)
 *
 * All calls are fire-and-forget and no-op on web, where expo-haptics has no
 * effect. Screens should use these (or `HapticPressable`/`PressableScale`)
 * instead of calling expo-haptics directly.
 */
function impact(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === 'web') return;
  // Fire-and-forget: haptics must never delay or break the tap handler.
  // (Promise.resolve tolerates stubbed implementations returning undefined.)
  try {
    Promise.resolve(Haptics.impactAsync(style)).catch(() => {});
  } catch {
    // Ignore — feedback is a nicety, never a failure path.
  }
}

export function hapticLight() {
  impact(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticMedium() {
  impact(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticHeavy() {
  impact(Haptics.ImpactFeedbackStyle.Heavy);
}

export function hapticNotify(type: Haptics.NotificationFeedbackType) {
  if (Platform.OS === 'web') return;
  try {
    Promise.resolve(Haptics.notificationAsync(type)).catch(() => {});
  } catch {
    // Ignore — feedback is a nicety, never a failure path.
  }
}

export type HapticStrength = 'light' | 'medium' | 'none';

/** Fire the requested strength (used by pressable wrappers). */
export function hapticTap(strength: HapticStrength) {
  if (strength === 'light') hapticLight();
  else if (strength === 'medium') hapticMedium();
}
