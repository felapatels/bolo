import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

interface SkeletonCardProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: object;
}

/**
 * A rounded rectangle placeholder with a looping shimmer animation.
 * Replaces ActivityIndicator spinners during data loads so the layout stays
 * stable. The shimmer honors the reduced-motion system setting.
 */
export function SkeletonCard({
  width = '100%',
  height = 80,
  borderRadius = 14,
  style,
}: SkeletonCardProps) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const tx = useSharedValue(-windowWidth);

  useEffect(() => {
    if (reduceMotion) {
      // Static placeholder — no shimmer for reduced-motion users.
      tx.value = -windowWidth;
      return;
    }
    tx.value = withRepeat(
      withTiming(windowWidth * 1.5, {
        duration: 1100,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [windowWidth, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  return (
    <View
      testID="skeleton-card"
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.muted,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {!reduceMotion && (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <LinearGradient
            colors={[
              'transparent',
              `${colors.card}CC`,
              'transparent',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: windowWidth, height: '100%' }}
          />
        </Animated.View>
      )}
    </View>
  );
}
