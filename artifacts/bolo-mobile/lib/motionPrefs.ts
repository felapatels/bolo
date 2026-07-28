/**
 * Reduced-motion preference (Spec 1 v3 §4.4).
 *
 * Mobile reads `AccessibilityInfo.isReduceMotionEnabled()`. The OS API is
 * async, so we cache the value at module load and track changes; components
 * built on Reanimated should prefer its reactive `useReducedMotion()` hook.
 * This helper is for imperative call sites needing a synchronous answer.
 */
import { AccessibilityInfo } from 'react-native';

let cached = false;

try {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      cached = v;
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
    cached = v;
  });
} catch {
  // Test environments may not implement AccessibilityInfo; default to false.
}

export function prefersReducedMotion(): boolean {
  return cached;
}
