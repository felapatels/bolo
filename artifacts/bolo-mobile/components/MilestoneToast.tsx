import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { AppFonts } from '@/constants/fonts';

interface MilestoneToastProps {
  /** Message to display. */
  message: string;
  /**
   * Change this key to re-trigger the toast animation.
   * Each distinct value plays a new slide-in → hold → slide-out cycle.
   */
  toastKey: number;
  /** Background pill color. Defaults to a deep indigo. */
  backgroundColor?: string;
  /** Text color. Defaults to white. */
  color?: string;
}

const DISPLAY_MS = 1500;
const SLIDE_MS = 300;

/**
 * A transient, absolutely-positioned pill that slides in from the top of its
 * parent container, holds for 1.5 s, then slides back out.
 *
 * Place it inside a container with `position: 'relative'` (or inside a Screen).
 * The toast is pointer-event-none so it never blocks touches.
 *
 * When `toastKey` changes (and message is non-empty), a fresh animation cycle fires.
 * Respects `useReducedMotion` — falls back to a fade-only animation.
 */
export function MilestoneToast({
  message,
  toastKey,
  backgroundColor = '#312E81',
  color = '#FFFFFF',
}: MilestoneToastProps) {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  // Track whether we're currently showing so we don't re-trigger for key=0.
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      // Don't fire on first mount with key=0.
      if (toastKey === 0) return;
    }
    if (!message) return;

    if (reduceMotion) {
      // Fade only, no slide.
      opacity.value = withSequence(
        withTiming(1, { duration: SLIDE_MS }),
        withDelay(DISPLAY_MS, withTiming(0, { duration: SLIDE_MS })),
      );
      translateY.value = 0;
    } else {
      translateY.value = withSequence(
        withTiming(0, { duration: SLIDE_MS, easing: Easing.out(Easing.back(1.5)) }),
        withDelay(DISPLAY_MS, withTiming(-80, { duration: SLIDE_MS, easing: Easing.in(Easing.quad) })),
      );
      opacity.value = withSequence(
        withTiming(1, { duration: SLIDE_MS }),
        withDelay(DISPLAY_MS, withTiming(0, { duration: SLIDE_MS })),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastKey]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pill, { backgroundColor }, animStyle]}
    >
      <Text style={[styles.text, { color }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    zIndex: 100,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    fontFamily: AppFonts.extrabold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
