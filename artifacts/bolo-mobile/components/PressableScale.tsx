import React from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { hapticTap, type HapticStrength } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that gently scales down while pressed, giving every tappable
 * surface a lively, native-feeling response. Honors the reduced-motion setting.
 * Fires a light haptic tap on press by default (override via `haptic` for
 * primary actions, or 'none' where a parent already provides feedback).
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
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion ? 1 : 1 - pressed.value * (1 - scaleTo),
      },
    ],
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPress={(e) => {
        hapticTap(haptic);
        onPress?.(e);
      }}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 140 });
        onPressOut?.(e);
      }}
      style={[style as ViewStyle, animatedStyle]}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
}
