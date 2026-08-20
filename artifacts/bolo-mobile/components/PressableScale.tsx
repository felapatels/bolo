import React from 'react';
import { Animated, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { hapticTap, type HapticStrength } from '@/lib/haptics';
import { useReducedMotionRN } from '@/lib/reducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that gently scales down while pressed, giving every tappable
 * surface a lively, native-feeling response. Honors the reduced-motion setting.
 * Fires a light haptic tap on press by default (override via `haptic` for
 * primary actions, or 'none' where a parent already provides feedback).
 *
 * DELIBERATELY NOT REANIMATED, and this is the load-bearing part.
 *
 * This component renders 17 times on the home screen alone, and it used to
 * carry three reanimated hooks each: useReducedMotion, useSharedValue and
 * useAnimatedStyle. That is 51 worklet-runtime registrations from this file
 * alone, all of them mounting inside the 200ms-to-600ms window where the app
 * was dying inside the Hermes garbage collector on 2026-08-19 and -20.
 *
 * Five separate version combinations were tried before the shape of it was
 * clear: every configuration where reanimated animations actually RAN crashed
 * on launch, and every configuration that launched had animations that were
 * silently dead. It was never a version bug. It was the volume of cross-runtime
 * worklet traffic at mount.
 *
 * react-native's own Animated with useNativeDriver hands the whole animation to
 * the native driver once and involves no worklets, no second Hermes runtime and
 * no cross-runtime object copying. It CANNOT cause that crash. The press scale
 * is a single interpolated transform, so nothing about the effect needed
 * reanimated in the first place.
 *
 * Keep it that way. If this ever wants reanimated again, remember that its cost
 * is multiplied by every tappable surface on the launch screen.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic = 'light',
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & {
  style?: ViewStyle | ViewStyle[];
  scaleTo?: number;
  haptic?: HapticStrength;
}) {
  const reduceMotion = useReducedMotionRN();
  const scale = React.useRef(new Animated.Value(1)).current;

  const to = (value: number, duration: number) => {
    if (reduceMotion) return;
    Animated.timing(scale, {
      toValue: value,
      duration,
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedPressable
      {...rest}
      onPress={(e) => {
        hapticTap(haptic);
        onPress?.(e);
      }}
      onPressIn={(e) => {
        to(scaleTo, 90);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1, 140);
        onPressOut?.(e);
      }}
      style={[style as ViewStyle, { transform: [{ scale }] }]}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
}
