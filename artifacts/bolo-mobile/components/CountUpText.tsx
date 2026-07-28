/**
 * Count-up number reveal for session summaries (Spec 1 v3 §4.4).
 *
 * Animates from 0 to `value` on the UI thread (Reanimated + animated
 * TextInput props — the ReText pattern). ≤700ms. Reduced motion renders the
 * final value instantly.
 */
import React from 'react';
import {
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function CountUpText({
  value,
  prefix = '',
  suffix = '',
  durationMs = 700,
  style,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  React.useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduceMotion, durationMs, value]);

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const n = Math.round(progress.value * value);
    // `text` is a valid native prop on TextInput (the ReText pattern) but is
    // absent from the public TS props, hence the cast.
    return { text: `${prefix}${n}${suffix}` } as unknown as Partial<TextInputProps>;
  }, [value, prefix, suffix]);

  return (
    <AnimatedTextInput
      editable={false}
      defaultValue={`${prefix}${reduceMotion ? value : 0}${suffix}`}
      animatedProps={animatedProps}
      style={[styles.reset, style]}
      accessibilityLabel={`${prefix}${value}${suffix}`}
    />
  );
}

const styles = StyleSheet.create({
  reset: { padding: 0, margin: 0 },
});
