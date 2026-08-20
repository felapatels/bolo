/**
 * Reduced-motion preference (Spec 1 v3 section 4.4).
 *
 * READ THE OS, NEVER REANIMATED. This module used to say the opposite: that
 * components built on reanimated "should prefer its reactive useReducedMotion()
 * hook". That advice silently flattened the entire app on 2026-08-20.
 *
 * reanimated's useReducedMotion() answers from its own native module, and when
 * that module has not initialised it returns TRUE as a fail-safe. Every
 * animation in this app is gated on that one boolean, so a single wrong answer
 * turns off the breathing pass, the shimmer, the ticket tear and every screen
 * entrance at once. The owner had Reduce Motion switched OFF the whole time and
 * the app spent two builds honouring a preference nobody set. Nothing failed,
 * nothing logged, and the app simply stopped moving.
 *
 * AccessibilityInfo is React Native's own API. It answers from the OS, it needs
 * no worklets, no second Hermes runtime and no cross-runtime traffic, and it
 * cannot be wrong about a setting it reads directly.
 *
 * It is also cheaper: reanimated's hook costs a worklet-runtime subscription per
 * call site, and there were 32 of them.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let cached = false;
const listeners = new Set<(on: boolean) => void>();

function publish(v: boolean): void {
  cached = v;
  listeners.forEach((fn) => fn(v));
}

try {
  AccessibilityInfo.isReduceMotionEnabled()
    .then(publish)
    .catch(() => {
      // Unreadable means motion stays ON. Failing the other way is what this
      // whole module exists to prevent.
    });
  AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
} catch {
  // Test environments may not implement AccessibilityInfo; default to false.
}

/** Synchronous answer, for imperative call sites. */
export function prefersReducedMotion(): boolean {
  return cached;
}

/**
 * Reactive answer, for components. Drop-in replacement for reanimated's
 * useReducedMotion() and the one every animated component should use.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(cached);
  useEffect(() => {
    listeners.add(setReduced);
    setReduced(cached);
    return () => {
      listeners.delete(setReduced);
    };
  }, []);
  return reduced;
}
