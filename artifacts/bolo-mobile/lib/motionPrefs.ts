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

/**
 * THE LAUNCH QUIET WINDOW, and it is the fix for the crash that cost two days.
 *
 * This app dies inside the Hermes garbage collector 200ms to 600ms after
 * launch. Seven builds established the rule with no exceptions: every
 * configuration where reanimated animations RAN crashed, and every one that
 * launched had animations that were not running. Five of those builds were
 * version roulette across reanimated 3.19.5, 4.1.7 and 4.3.2, worklets 0.5.1
 * and 0.8.3, and both architectures. None of it mattered.
 *
 * Build 57 narrowed it further. In the clean builds the animated components
 * still MOUNTED: every useAnimatedStyle and useSharedValue ran. They simply
 * never animated. So the cost is not registering worklets, it is executing
 * them, driving the UI runtime while the GC is at its busiest.
 *
 * So nothing animates for the first stretch of the app's life. Every animation
 * in this codebase already gates on reduced motion, at 32 call sites, which
 * makes this the one chokepoint that reaches all of them without touching a
 * single component.
 *
 * NOBODY SEES IT. BrandSplash covers the whole screen for SPLASH_MIN_HOLD_MS,
 * which is 1500ms, so this window closes while the splash is still up. The
 * value is deliberately longer than that hold: finishing early would put the
 * first animation frame back inside the window this exists to empty.
 */
const LAUNCH_QUIET_MS = 1800;
let launchSettled = false;

setTimeout(() => {
  launchSettled = true;
  publish(cached);
}, LAUNCH_QUIET_MS);

/** True while the app is still inside the window where animating crashes it. */
export function inLaunchQuietWindow(): boolean {
  return !launchSettled;
}

/** Tests only: collapse the window so behaviour under it can be asserted. */
export function __settleLaunchForTests(): void {
  launchSettled = true;
  publish(cached);
}

/** Tests only: reopen it. */
export function __resetLaunchForTests(): void {
  launchSettled = false;
}

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
  return !launchSettled || cached;
}

/**
 * Reactive answer, for components. Drop-in replacement for reanimated's
 * useReducedMotion() and the one every animated component should use.
 */
export function useReducedMotion(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    listeners.add(bump);
    bump();
    return () => {
      listeners.delete(bump);
    };
  }, []);
  // The launch window reports reduced motion whatever the OS says, so every
  // animation in the app stays still until it closes. See LAUNCH_QUIET_MS.
  return !launchSettled || cached;
}
