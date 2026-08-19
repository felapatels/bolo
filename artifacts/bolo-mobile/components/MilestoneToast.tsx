import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeOut,
  SlideInUp,
  SlideOutUp,
  useReducedMotion,
} from 'react-native-reanimated';
import { appearPlain } from '@/lib/entrance';
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

const DISPLAY_MS = 2000;

/**
 * A transient, absolutely-positioned pill that springs in from the top,
 * holds for 2 s, then springs back out.
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
  const [visible, setVisible] = React.useState(false);

  // Track whether we've mounted so we don't fire on key=0 at startup.
  const initialized = React.useRef(false);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      if (toastKey === 0) return;
    }
    if (!message) return;

    // Clear any pending dismiss from a previous toast cycle.
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    setVisible(true);
    dismissTimer.current = setTimeout(() => setVisible(false), DISPLAY_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastKey]);

  React.useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  if (!visible) return null;

  const entering = reduceMotion
    ? appearPlain()
    : SlideInUp.springify().damping(14).stiffness(220);

  const exiting = reduceMotion
    ? FadeOut.duration(200)
    : SlideOutUp.springify().damping(14).stiffness(220);

  return (
    <Animated.View
      pointerEvents="none"
      entering={entering}
      exiting={exiting}
      testID="milestone-toast"
      style={[styles.pill, { backgroundColor }]}
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
