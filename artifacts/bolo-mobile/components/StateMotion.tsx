/**
 * Animation driven by React state, because React re-renders are the only thing
 * that reliably updates a view in this app's release builds.
 *
 * THE EVIDENCE, from an on-device diagnostic on 2026-08-21:
 *   RN Animated, useNativeDriver false, animating WIDTH      -> works
 *   RN Animated, useNativeDriver false, animating OPACITY    -> dead flat
 *   RN Animated, useNativeDriver true                        -> dead flat
 *   reanimated withTiming / useFrameCallback                 -> one frame, then dead
 *   a shared value stepped from a JS timer                   -> one update, then dead
 *
 * Width is a LAYOUT prop: changing it forces a React re-render and a full
 * commit. Opacity and transform go through direct manipulation, which skips
 * React entirely, and that is also the path the native driver and reanimated
 * use. Everything on the direct path is dead; the one thing that goes through a
 * commit works. See CLAUDE.md, THE ANIMATION BUG, and
 * HERMES-HEAP-CORRUPTION-REPORT.md.
 *
 * So these components step a number in React state and re-render. Crude on
 * purpose. Each one is deliberately TINY and owns its own state, so the
 * re-render is confined to a leaf and never touches the screen around it.
 *
 * When the underlying fault is fixed upstream, delete this file and put the
 * reanimated versions back. Nothing else has to change.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

/** ~20fps. Enough for a float or a glow, cheap enough to re-render a leaf. */
const STEP_MS = 50;

/**
 * A 0 -> 1 -> 0 triangle wave in React state. Not eased: at these amplitudes
 * and this rate the difference is invisible, and easing would cost a table
 * lookup per frame on the JS thread for nothing.
 */
export function useStepProgress(cycleMs: number, enabled: boolean): number {
  const steps = Math.max(2, Math.round(cycleMs / STEP_MS));
  const [i, setI] = React.useState(0);

  React.useEffect(() => {
    // Real timers outlive jest teardown and fail suites at the suite level.
    if (process.env.NODE_ENV === 'test') return;
    if (!enabled) {
      setI(0);
      return;
    }
    const id = setInterval(() => setI((n) => (n + 1) % steps), STEP_MS);
    return () => clearInterval(id);
  }, [steps, enabled]);

  const half = steps / 2;
  return i <= half ? i / half : (steps - i) / half;
}

/** Pulses opacity between `min` and `max`. Renders a plain View. */
export function PulseView({
  style,
  min,
  max,
  cycleMs,
  enabled = true,
  ...rest
}: {
  style?: ViewStyle | ViewStyle[];
  min: number;
  max: number;
  cycleMs: number;
  enabled?: boolean;
  pointerEvents?: 'none' | 'auto';
  testID?: string;
}) {
  const t = useStepProgress(cycleMs, enabled);
  const opacity = enabled ? min + (max - min) * t : max;
  return <View {...rest} style={[style as ViewStyle, { opacity }]} />;
}

/**
 * Lifts its children by up to `amplitude` points and back. Wraps rather than
 * styles, so the child tree is untouched and re-renders with the wrapper.
 */
export function FloatView({
  amplitude,
  cycleMs,
  enabled = true,
  children,
}: {
  amplitude: number;
  cycleMs: number;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useStepProgress(cycleMs, enabled);
  if (!enabled) return <>{children}</>;
  return (
    <View style={{ transform: [{ translateY: -amplitude * t }] }}>
      {children}
    </View>
  );
}

/** Scales its children between 1 and `scale`. Same contract as FloatView. */
export function BreatheView({
  scale,
  cycleMs,
  enabled = true,
  style,
  children,
}: {
  scale: number;
  cycleMs: number;
  enabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}) {
  const t = useStepProgress(cycleMs, enabled);
  const s = enabled ? 1 + (scale - 1) * t : 1;
  return (
    <View style={[style as ViewStyle, { transform: [{ scale: s }] }]}>
      {children}
    </View>
  );
}
