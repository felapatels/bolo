import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

/**
 * Live-input waveform (Spec D2). A row of vertical bars whose heights track
 * the microphone's real amplitude while recording — not an oscilloscope, not
 * a spectrum, and never a canned loop pretending to be the learner's voice.
 *
 * The amplitude arrives as a Reanimated SharedValue (0..1, mapped from the
 * recorder's dBFS metering by meteringToAmplitude in lib/audio.ts) so bar
 * heights update on the UI thread without any React re-render per frame.
 *
 * Reduced motion: renders a static segment-level indicator instead — the
 * "is my mic working" feedback stays, the dancing does not. The `level`
 * prop (plain 0..1 number, updated at the metering poll rate through React
 * state) drives it; that is a slow information display, not an animation.
 */

const BAR_PEAKS = [0.45, 0.7, 1, 0.85, 1, 0.6, 0.4];
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MIN_FRACTION = 0.18;

function Bar({
  amplitude,
  peak,
  height,
  color,
}: {
  amplitude: SharedValue<number>;
  peak: number;
  height: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const a = Math.min(1, Math.max(0, amplitude.value));
    return {
      // The metering poll delivers ~16 samples/s; tween each bar to its new
      // target over roughly one poll interval so heights glide between
      // samples instead of stepping visibly at 16Hz.
      height: withTiming(Math.max(height * MIN_FRACTION, a * peak * height), {
        duration: 80,
        easing: Easing.out(Easing.quad),
      }),
    };
  });
  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function Waveform({
  amplitude,
  level,
  height = 22,
  color,
}: {
  /** Live input amplitude 0..1 on the UI thread. */
  amplitude: SharedValue<number>;
  /** Same amplitude as a plain number, for the reduced-motion indicator. */
  level: number;
  /** Overall height of the tallest bar, in px. */
  height?: number;
  /** Bar color; defaults to the theme accent. */
  color?: string;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const barColor = color ?? colors.accent;

  if (reduceMotion) {
    const lit = Math.min(5, Math.round(Math.min(1, Math.max(0, level)) * 5));
    return (
      <View
        style={[styles.row, { height }]}
        accessibilityRole="image"
        accessibilityLabel="Microphone level"
      >
        {[1, 2, 3, 4, 5].map((seg) => (
          <View
            key={seg}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: seg <= lit ? barColor : colors.muted,
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden>
      {BAR_PEAKS.map((peak, i) => (
        <Bar
          key={i}
          amplitude={amplitude}
          peak={peak}
          height={height}
          color={barColor}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
  },
});
