/**
 * XP arc animation (Spec 1 v3 §4.2).
 *
 * A small "+N XP" badge arcs from the result area to the persistent XP
 * counter (located via the Spec 1a measureXpCounter accessor), then triggers
 * a pop on the counter. ≤600ms, transform/opacity only, driven by a
 * Reanimated worklet on the UI thread.
 *
 * If the counter is not mounted, the arc is skipped with a console.warn and
 * the counter still updates through its normal data flow.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { measureXpCounter, popXpCounter } from '@/lib/xpCounterRef';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useReducedMotion } from '@/lib/motionPrefs';

const DURATION_MS = 550;

export function XpArc({
  amount,
  from,
  onDone,
}: {
  amount: number;
  /** Window coordinates the badge starts from (center point). */
  from: { x: number; y: number };
  onDone?: () => void;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [delta, setDelta] = React.useState<{ dx: number; dy: number } | null>(
    null,
  );
  const doneRef = React.useRef(false);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    popXpCounter();
    onDone?.();
  }, [onDone]);

  React.useEffect(() => {
    let cancelled = false;
    measureXpCounter().then((rect) => {
      if (cancelled) return;
      if (!rect) {
        console.warn('[XpArc] XP counter not mounted; skipping arc animation');
        doneRef.current = true;
        onDone?.();
        return;
      }
      if (reduceMotion) {
        // Reduced motion: outcome is instant; completion still fires.
        finish();
        return;
      }
      setDelta({
        dx: rect.x + rect.width / 2 - from.x,
        dy: rect.y + rect.height / 2 - from.y,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!delta) return;
    progress.value = withTiming(
      1,
      { duration: DURATION_MS, easing: Easing.inOut(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(finish)();
      },
    );
  }, [delta, progress, finish]);

  const style = useAnimatedStyle(() => {
    'worklet';
    const t = progress.value;
    const dx = delta?.dx ?? 0;
    const dy = delta?.dy ?? 0;
    // Quadratic bezier through a raised midpoint — arc, transform-only.
    const midX = dx * 0.5 + (dx >= 0 ? 40 : -40);
    const midY = Math.min(0, dy) * 0.5 - 56;
    const inv = 1 - t;
    const x = 2 * inv * t * midX + t * t * dx;
    const y = 2 * inv * t * midY + t * t * dy;
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: interpolate(t, [0, 0.55, 1], [1, 1.08, 0.5]) },
      ],
      opacity: interpolate(t, [0, 0.8, 1], [1, 1, 0.85]),
    };
  }, [delta]);

  if (!delta) return null;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: 60 }]}
    >
      <Animated.View
        style={[
          styles.badge,
          { left: from.x, top: from.y, backgroundColor: colors.primary },
          style,
        ]}
      >
        <Text style={[styles.text, { color: colors.primaryForeground }]}>
          +{amount} XP
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    marginLeft: -32,
    marginTop: -14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  text: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
  },
});
