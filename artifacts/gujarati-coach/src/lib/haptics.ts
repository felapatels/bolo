/**
 * Web haptic feedback via navigator.vibrate().
 * Maps haptic types to vibration patterns that mirror the mobile haptics library
 * (artifacts/bolo-mobile/lib/haptics.ts) so every feedback event that fires on
 * mobile also fires on web at the exact same moment.
 *
 * No-ops silently on browsers that don't support the Vibration API (iOS Safari,
 * most desktop browsers) — haptics are a nicety, never a failure path.
 */

export type WebHapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/** Vibration patterns in milliseconds — single values are one-shot, arrays alternate on/off. */
const PATTERNS: Record<WebHapticType, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [40, 30, 40],
  warning: [30, 50, 30],
  error: [50, 30, 50, 30, 50],
};

export function webHaptic(type: WebHapticType): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[type]);
  } catch {
    // Ignore — feedback is a nicety, never a failure path.
  }
}
