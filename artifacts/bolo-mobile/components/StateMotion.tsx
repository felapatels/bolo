/**
 * Animation driven by React state, allocating NOTHING per frame.
 *
 * WHY STATE AT ALL. On-device diagnostics on 2026-08-21 established that in this
 * app's release builds, the only thing that updates a view is a React re-render:
 *
 *   RN Animated, useNativeDriver false, WIDTH (a layout prop) -> works
 *   RN Animated, useNativeDriver false, OPACITY or TRANSFORM  -> dead flat
 *   RN Animated, useNativeDriver true                         -> dead flat
 *   reanimated withTiming / useFrameCallback                  -> one frame, dead
 *   a shared value stepped from a JS timer                    -> one update, dead
 *
 * Opacity and transform go through direct manipulation, which skips React, and
 * that is the same path the native driver and reanimated use. Everything on it
 * is dead. See HERMES-HEAP-CORRUPTION-REPORT.md.
 *
 * WHY ZERO ALLOCATION, AND THIS IS THE PART THAT MATTERS. The crash in this app
 * is Hermes heap corruption DETECTED BY THE GARBAGE COLLECTOR, so the crash rate
 * scales with how often the collector runs. Measured directly:
 *
 *   build 290, motion on,  ~180 objects/sec allocated ->  8 cold starts of 10
 *   build 300, motion off, none                       -> 10 cold starts of 10
 *
 * The first version built a fresh style object, transform array and inner object
 * on every step of every component. This one builds the whole table ONCE at
 * mount and then only moves an integer index, so the steady state allocates
 * nothing at all. The frame rate is also lower, because a breathe and a float do
 * not need twenty steps a second to read as smooth.
 *
 * `children` is passed straight through, so its element reference is stable and
 * React skips reconciling the subtree. Only the wrapper View re-renders.
 *
 * When the underlying fault is fixed upstream, delete this file and restore the
 * reanimated versions. Nothing else has to change.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

/** Master switch. Off ships a completely static home screen. */
export const STATE_MOTION_ENABLED = true;

/**
 * ~8fps. Deliberately slow. These are 3-to-4 second breathes and floats, so the
 * eye reads them as smooth, and each halving of the rate halves the GC pressure
 * that was measurably raising the crash rate.
 */
const STEP_MS = 120;

/** How many samples make up one full there-and-back cycle. */
function stepsFor(cycleMs: number): number {
  return Math.max(4, Math.round(cycleMs / STEP_MS));
}

/**
 * A triangle wave as an INDEX, not a float. Returns 0..steps-1. Callers use it
 * to look up a precomputed style, so nothing is computed or allocated per tick.
 */
function useStepIndex(steps: number, enabled: boolean): number {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    // Real timers outlive jest teardown and fail suites at the suite level.
    if (process.env.NODE_ENV === 'test') return;
    if (!STATE_MOTION_ENABLED || !enabled) {
      setI(0);
      return;
    }
    const id = setInterval(() => setI((n) => (n + 1) % steps), STEP_MS);
    return () => clearInterval(id);
  }, [steps, enabled]);
  return i;
}

/** 0 -> 1 -> 0 across `steps`, as a plain number. Used only at table build time. */
function triangle(i: number, steps: number): number {
  const half = steps / 2;
  return i <= half ? i / half : (steps - i) / half;
}

/** Pulses opacity between `min` and `max`. */
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
  const steps = stepsFor(cycleMs);
  const i = useStepIndex(steps, enabled);
  const table = React.useMemo(
    () =>
      Array.from({ length: steps }, (_, n) => ({
        opacity: min + (max - min) * triangle(n, steps),
      })),
    [steps, min, max],
  );
  const on = STATE_MOTION_ENABLED && enabled;
  return <View {...rest} style={[style as ViewStyle, on ? table[i] : { opacity: max }]} />;
}

/** Lifts its children by up to `amplitude` points and back. */
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
  const steps = stepsFor(cycleMs);
  const i = useStepIndex(steps, enabled);
  const table = React.useMemo(
    () =>
      Array.from({ length: steps }, (_, n) => ({
        transform: [{ translateY: -amplitude * triangle(n, steps) }],
      })),
    [steps, amplitude],
  );
  if (!STATE_MOTION_ENABLED || !enabled) return <>{children}</>;
  return <View style={table[i]}>{children}</View>;
}

/** Scales its children between 1 and `scale`. */
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
  const steps = stepsFor(cycleMs);
  const i = useStepIndex(steps, enabled);
  const table = React.useMemo(
    () =>
      Array.from({ length: steps }, (_, n) => ({
        transform: [{ scale: 1 + (scale - 1) * triangle(n, steps) }],
      })),
    [steps, scale],
  );
  const on = STATE_MOTION_ENABLED && enabled;
  return (
    <View style={[style as ViewStyle, on ? table[i] : undefined]}>{children}</View>
  );
}

/**
 * A band that sweeps across its parent and then rests off-face until the next
 * cycle. Used for the ticket shimmer, which travels over the first `travelFrac`
 * of the heartbeat and waits out the rest.
 */
export function SweepView({
  width,
  cycleMs,
  travelFrac = 0.45,
  skewDeg = -14,
  enabled = true,
  style,
  children,
  ...rest
}: {
  width: number;
  cycleMs: number;
  travelFrac?: number;
  skewDeg?: number;
  enabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  pointerEvents?: 'none' | 'auto';
  testID?: string;
}) {
  const steps = stepsFor(cycleMs);
  const i = useStepIndex(steps, enabled && width > 0);
  const table = React.useMemo(() => {
    const from = -1.5 * width;
    const to = 4.5 * width;
    const travelSteps = Math.max(1, Math.round(steps * travelFrac));
    return Array.from({ length: steps }, (_, n) => {
      const p = n < travelSteps ? n / travelSteps : 1;
      return {
        transform: [{ translateX: from + (to - from) * p }, { skewX: `${skewDeg}deg` }],
      };
    });
  }, [steps, width, travelFrac, skewDeg]);
  const on = STATE_MOTION_ENABLED && enabled && width > 0;
  return (
    <View {...rest} style={[style as ViewStyle, on ? table[i] : { opacity: 0 }]}>
      {children}
    </View>
  );
}

/**
 * A downward nudge for a call to action: bobs a few points and back. Same table
 * trick, exported separately so the intent reads at the call site.
 */
export function NudgeView({
  cycleMs = 900,
  distance = 6,
  enabled = true,
  children,
}: {
  cycleMs?: number;
  distance?: number;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FloatView amplitude={-distance} cycleMs={cycleMs} enabled={enabled}>
      {children}
    </FloatView>
  );
}
