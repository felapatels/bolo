import React from 'react';
import {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * A 0→1 progress value that loops forever on a fixed cycle, the reanimated
 * analogue of one CSS keyframe animation cycle. Consumers interpolate the
 * linear progress against keyframe stops (the same fractions the web CSS
 * uses), so both platforms share one motion spec (see
 * gujarati-coach/src/index.css "Boarding pass and journey CTA idle motion").
 *
 * While `enabled` is false the value rests at 0, which every caller treats
 * as the identity frame, the reduced-motion static frame comes for free.
 */
export function useLoopProgress(cycleMs: number, enabled: boolean): SharedValue<number> {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    if (!enabled) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: cycleMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      progress.value = 0;
    };
  }, [cycleMs, enabled, progress]);
  return progress;
}
