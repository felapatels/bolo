import React from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Returns `{ isIdle, onActivity }`.
 *
 * `isIdle` flips to `true` after `seconds` of no activity and resets to
 * `false` whenever `onActivity()` is called. Always returns `isIdle = false`
 * when the OS "reduce motion" setting is enabled.
 *
 * Usage: call `onActivity` from the screen's root `onTouchStart` (or any
 * interaction handler) and pass `isIdle` down to `<Mascot isIdle={isIdle}>`.
 */
export function useIdleTimer(seconds: number): {
  isIdle: boolean;
  onActivity: () => void;
} {
  const reduceMotion = useReducedMotion();
  const [isIdle, setIsIdle] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onActivity = React.useCallback(() => {
    setIsIdle(false);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (!reduceMotion) {
      timerRef.current = setTimeout(() => setIsIdle(true), seconds * 1000);
    }
  }, [seconds, reduceMotion]);

  // Start the countdown on mount; clear on unmount.
  React.useEffect(() => {
    if (reduceMotion) {
      setIsIdle(false);
      return;
    }
    timerRef.current = setTimeout(() => setIsIdle(true), seconds * 1000);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [seconds, reduceMotion]);

  return { isIdle: reduceMotion ? false : isIdle, onActivity };
}
