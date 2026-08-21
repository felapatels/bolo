/**
 * The react-native `Animated` twin of lib/useLoopProgress.ts.
 *
 * WHY THIS EXISTS. On 2026-08-21 an on-device diagnostic established that
 * reanimated's per-frame driver never starts in release builds of this app:
 * `useFrameCallback` fires exactly once, `withTiming` never advances past its
 * first value, and a shared value stepped from a plain JS timer moves ONCE and
 * then stops. `runOnJS` round-trips work and the worklet runtime is alive, so
 * this is one dead subsystem rather than a broken install. React Native's own
 * `Animated` runs perfectly in the same builds, which is what this is for.
 *
 * The reanimated version of this hook stays exactly where it is. Nothing is
 * deleted, because when the driver is fixed upstream the components can move
 * back by swapping the import and nothing else. See CLAUDE.md, THE ANIMATION
 * BUG.
 *
 * Returns a value cycling 0 -> 1 linearly, forever, exactly like its twin. It
 * is safe to drive `opacity` and `transform` from it with the native driver;
 * anything else must pass `useNativeDriver: false` at the consumer.
 */
import React from 'react';
import { Animated, Easing } from 'react-native';

export function useLoopProgressRN(
  cycleMs: number,
  enabled: boolean,
): Animated.Value {
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // On the JS driver this schedules real rAF work, which outlives jest's
    // teardown and fails suites at the suite level. Components still mount and
    // render under test; only the clock stops.
    if (process.env.NODE_ENV === 'test') return;
    if (!enabled) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: cycleMs,
        easing: Easing.linear,
        // FALSE, AND THAT IS THE WHOLE POINT. Build 270 shipped this as `true`
        // and every ported animation came out dead flat, while the diagnostic's
        // own amber bar kept pulsing beside it on `false`. So the fault is not
        // reanimated specifically: ANYTHING driven per-frame from the native
        // side is dead in release builds of this app, which is also why
        // reanimated 4's frame loop never starts, since on the New Architecture
        // it drives from native too. JS-thread animation is the only thing that
        // ticks here. The cost is that a busy JS thread can stutter the idle
        // motion, which is a fair price for it running at all.
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [cycleMs, enabled, progress]);

  return progress;
}

export default useLoopProgressRN;
