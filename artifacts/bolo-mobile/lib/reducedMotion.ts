/**
 * Reduce Motion, read WITHOUT reanimated.
 *
 * reanimated ships useReducedMotion(), and using it costs a worklet runtime
 * subscription per call site. PressableScale renders 17 times on the home
 * screen alone, so that hook alone was 17 subscriptions inside the launch
 * window this app crashes in (see components/PressableScale.tsx).
 *
 * AccessibilityInfo is React Native's own API and involves no worklets, no
 * second Hermes runtime, and no cross-runtime traffic. Anything that only needs
 * to KNOW the setting, rather than read it inside a worklet, should use this.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotionRN(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {
        // Unreadable preference means motion stays ON, matching reanimated's
        // own default. A failure here must never freeze the whole UI.
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) =>
      setReduced(on),
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
