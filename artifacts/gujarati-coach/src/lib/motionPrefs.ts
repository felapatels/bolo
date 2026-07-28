/**
 * Reduced-motion preference (Spec 1 v3 §4.4).
 *
 * Web reads the OS-level `prefers-reduced-motion` media query. Components
 * built on framer-motion should prefer its `useReducedMotion()` hook (it is
 * reactive); this helper exists for imperative call sites (sound/haptic
 * branches, one-shot animations) that need a synchronous answer.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
