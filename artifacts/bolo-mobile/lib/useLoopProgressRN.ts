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
        // Every consumer of this drives opacity or transform only, both of
        // which the native driver supports. Keeping it on the UI thread means
        // a busy JS thread cannot stutter the idle motion.
        useNativeDriver: true,
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
