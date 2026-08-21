/**
 * The boot film overlay. Mobile twin of web's brand-splash.tsx.
 *
 * Mounted at the ROOT, not inside home, because the wait it covers is
 * Clerk resolving plus two redirect hops that happen above home in the
 * tree. It sits over the Stack as a pointer-events-none layer and never
 * gates, delays or blocks anything below it: every screen mounts and
 * fetches exactly as it would with no splash present.
 *
 * Lifecycle, identical to web: playing -> exiting -> done.
 *   FULL   the day's first cold start. Plays the film through on a fixed
 *          timer and ignores the ready signal entirely.
 *   READY  every later cold start. Releases at the LATER of the ready
 *          signal (lib/splashReady) and the minimum hold.
 * SPLASH_MAX_HOLD_MS is a failsafe cap in BOTH modes, so a signal that
 * never lands can never trap the learner behind the overlay.
 *
 * Any failure renders null and the app boots normally (boundary below).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SPLASH_MIN_HOLD_MS } from '@/lib/splashFilm';

/**
 * DIAGNOSTIC STUB, 2026-08-20. Not the real component. Do not merge.
 *
 * Everything BrandSplash did is gone except the one thing it cannot avoid
 * being: a full-screen view at the ROOT layout that mounts on the first frame
 * and unmounts a moment later. No Animated of either kind, no Image, no
 * AsyncStorage, no error boundary, one timer.
 *
 * WHAT THIS SPLITS. Four store builds so far:
 *   150  overlay + RN Animated, useNativeDriver true    app frozen
 *   170  overlay + reanimated                           splash frozen
 *   180  overlay + RN Animated, useNativeDriver false   app frozen
 *   160  NO overlay                                     everything animates
 *
 * The animation driver is cleared: false behaved exactly like true. So either
 * the overlay's mere existence is the problem, or something else inside the
 * real component is.
 *
 *   app animates  -> the overlay is fine and the cause is something the real
 *                    component does: the Image, the AsyncStorage read, the four
 *                    timers, or the error boundary.
 *   app frozen    -> a full-screen root overlay that mounts and unmounts is
 *                    itself incompatible with reanimated here, and the fix is
 *                    architectural rather than a setting.
 */
let coldStartConsumed = false;

export function __resetBrandSplashForTests(): void {
  coldStartConsumed = false;
}

export function BrandSplash() {
  const [visible, setVisible] = React.useState(() => !coldStartConsumed);

  React.useEffect(() => {
    coldStartConsumed = true;
    const t = setTimeout(() => setVisible(false), SPLASH_MIN_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <View
      testID="brand-splash"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.overlay]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: '#F8FAFC', zIndex: 9999, elevation: 9999 },
});

export default BrandSplash;
