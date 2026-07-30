import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { hapticMedium } from '@/lib/haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

type Variant = 'primary' | 'secondary' | 'accent';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChunkyButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const colors = useColors();
  const pressed = useSharedValue(0);

  const bg =
    variant === 'secondary'
      ? colors.secondary
      : variant === 'accent'
        ? colors.accent
        : colors.primary;
  const fg =
    variant === 'secondary'
      ? colors.secondaryForeground
      : variant === 'accent'
        ? colors.accentForeground
        : colors.primaryForeground;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(pressed.value * 4, { duration: 90 }) }],
  }));

  const isDisabled = disabled || loading;

  return (
    <View style={[styles.wrap, style]}>
      {/* Solid "shadow" underlay for a playful, chunky feel. */}
      <View
        style={[
          styles.shadow,
          { backgroundColor: colors.primaryShadow, opacity: isDisabled ? 0.4 : 1 },
        ]}
      />
      <AnimatedPressable
        accessibilityRole="button"
        testID={testID}
        disabled={isDisabled}
        onPressIn={() => {
          pressed.value = 1;
        }}
        onPressOut={() => {
          pressed.value = 0;
        }}
        onPress={() => {
          hapticMedium();
          onPress();
        }}
        style={[
          styles.button,
          { backgroundColor: bg, opacity: isDisabled ? 0.6 : 1 },
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon ? <Feather name={icon} size={20} color={fg} /> : null}
            <Text style={[styles.label, { color: fg }]}>{title}</Text>
          </>
        )}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 5,
    bottom: -1,
    borderRadius: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  label: {
    fontFamily: AppFonts.bold,
    fontSize: 17,
  },
});
