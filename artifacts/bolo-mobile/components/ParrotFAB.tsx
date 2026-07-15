import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';

/**
 * Global floating Bolo entry point — a round parrot avatar that sits in the
 * bottom-right corner of every app screen and opens the full-screen chat.
 *
 * Hidden while the learner is already inside the chat screen so they don't
 * see a recursive entry point.
 */
export function ParrotFAB() {
  const router = useRouter();
  const pathname = usePathname();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // Gentle idle float — makes Bolo feel alive even while not tapped.
  const floatVal = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion) return;
    floatVal.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, floatVal]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -5 * Math.sin(floatVal.value * Math.PI) }],
  }));

  // Hide on the chat screen itself
  if (pathname === '/chat' || pathname.endsWith('/chat')) return null;

  const bottomOffset = Math.max(insets.bottom, 8) + 96; // clear the tab bar

  return (
    <View
      style={[styles.container, { bottom: bottomOffset, right: 20 }]}
      pointerEvents="box-none"
    >
      <Animated.View style={floatStyle}>
        <PressableScale
          onPress={() => router.push('/(app)/(tabs)/chat')}
          accessibilityRole="button"
          accessibilityLabel="Chat with Bolo"
          style={[
            styles.fab,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.foreground,
            },
          ]}
        >
          <Image
            source={require('../assets/images/mascot/mascot-wave.png')}
            style={styles.fabImage}
            resizeMode="contain"
          />
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 999,
    pointerEvents: 'box-none',
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Subtle shadow so it floats above the screen content
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  fabImage: {
    width: 52,
    height: 52,
  },
});
