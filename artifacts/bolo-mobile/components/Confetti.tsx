import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
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

const PERFECT_COLORS = [
  '#F59E0B', // amber
  '#FBBF24', // amber-400
  '#FCD34D', // amber-300
  '#D97706', // amber-600
  '#B45309', // amber-700
  '#FEF3C7', // cream
];

const PIECE_COUNT = 44;

type PieceShape = 'rect' | 'circle' | 'diamond';

type PieceSpec = {
  id: number;
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  shape: PieceShape;
  /** When set, the piece renders this letterform instead of a shape. */
  glyph?: string;
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

  if (spec.glyph) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.piece, { left: spec.left }, style]}
      >
        <Text
          style={{
            color: spec.color,
            fontSize: spec.size + 8,
            fontWeight: '700',
            includeFontPadding: false,
          }}
        >
          {spec.glyph}
        </Text>
      </Animated.View>
    );
  }

  if (spec.shape === 'circle') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.piece,
          {
            left: spec.left,
            width: spec.size,
            height: spec.size,
            borderRadius: spec.size / 2,
            backgroundColor: spec.color,
          },
          style,
        ]}
      />
    );
  }

  if (spec.shape === 'diamond') {
    // Two overlapping narrow rectangles at 0° and 90° give a plus/cross shape;
    // the ongoing rotate animation turns them into a spinning star-like piece.
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.piece,
          {
            left: spec.left,
            width: spec.size,
            height: spec.size,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            width: spec.size,
            height: spec.size * 0.35,
            backgroundColor: spec.color,
            borderRadius: 2,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: spec.size * 0.35,
            height: spec.size,
            backgroundColor: spec.color,
            borderRadius: 2,
          }}
        />
      </Animated.View>
    );
  }

  // rect (default)
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

export type ConfettiVariant = 'default' | 'perfect';

const SHAPES: PieceShape[] = ['rect', 'circle', 'diamond'];

/**
 * A lightweight full-screen confetti rain built on reanimated. Pieces loop while
 * mounted, so the parent controls the celebration lifetime by mounting /
 * unmounting this component.
 *
 * `variant="perfect"` shifts the palette to amber/gold for a golden-moment feel.
 */
export function Confetti({
  variant = 'default',
  glyphs,
}: {
  variant?: ConfettiVariant;
  /**
   * Script letterforms to rain instead of shapes (Spec 1 glyph confetti).
   * Empty/undefined falls back to the classic shape confetti. Glyph mode is
   * capped at 25 pieces on mobile.
   */
  glyphs?: string[];
}) {
  const reduceMotion = useReducedMotion();
  const palette = variant === 'perfect' ? PERFECT_COLORS : CONFETTI_COLORS;
  const glyphMode = !!glyphs && glyphs.length > 0;

  const pieces = React.useMemo<PieceSpec[]>(
    () =>
      Array.from({ length: glyphMode ? 25 : PIECE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * width,
        size: 8 + Math.random() * 8,
        color: palette[i % palette.length],
        delay: Math.random() * 1200,
        duration: 2200 + Math.random() * 1800,
        drift: 20 + Math.random() * 60,
        shape: SHAPES[i % SHAPES.length],
        glyph: glyphMode ? glyphs![i % glyphs!.length] : undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, glyphMode],
  );

  // Spec 1 rule 25: reduced motion renders no confetti at all — the summary
  // copy carries the celebration.
  if (reduceMotion) return null;

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
