import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#4F46E5', // indigo (primary)
  '#6366F1', // indigo-500
  '#0D9488', // teal (secondary)
  '#14B8A6', // teal-500 (accent)
  '#10B981', // emerald (success)
  '#F59E0B', // amber (gold)
];

const PIECE_COUNT = 44;

type PieceSpec = {
  id: number;
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
};

function ConfettiPiece({ spec }: { spec: PieceSpec }) {
  const t = useSharedValue(0);

  React.useEffect(() => {
    t.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: spec.duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [t, spec.delay, spec.duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -40 + t.value * (height + 80) },
      { translateX: Math.sin(t.value * Math.PI * 3) * spec.drift },
      { rotate: `${t.value * 720}deg` },
    ],
    opacity: 1 - t.value * 0.2,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        {
          left: spec.left,
          width: spec.size,
          height: spec.size * 0.55,
          backgroundColor: spec.color,
        },
        style,
      ]}
    />
  );
}

/**
 * A lightweight full-screen confetti rain built on reanimated. Pieces loop while
 * mounted, so the parent controls the celebration lifetime by mounting /
 * unmounting this component.
 */
export function Confetti() {
  const pieces = React.useMemo<PieceSpec[]>(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * width,
        size: 8 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 1200,
        duration: 2200 + Math.random() * 1800,
        drift: 20 + Math.random() * 60,
      })),
    [],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {pieces.map((spec) => (
        <ConfettiPiece key={spec.id} spec={spec} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
});
