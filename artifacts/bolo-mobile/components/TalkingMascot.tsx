import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { appear, appearZoom } from '@/lib/entrance';
import { useColors } from '@/hooks/useColors';
import { accessoryOverlaySource, mascotSource } from '@/lib/mascotOutfits';
import { useEquippedOutfit } from '@/contexts/OutfitContext';
import type { MascotPose } from '@/components/Mascot';

export type TalkingMascotMode = 'idle' | 'listening' | 'talking' | 'thinking';

// Chat modes borrow the canonical poses; the art itself (canonical or dressed
// in the learner's equipped outfit) resolves in lib/mascotOutfits.ts, so the
// chat screen wears the same costume as every other surface.
const MODE_POSES = {
  idle: 'wave',
  listening: 'thinking',
  talking: 'wave',
  thinking: 'thinking',
} satisfies Record<TalkingMascotMode, MascotPose>;

/**
 * An extended mascot component for the Parrot Chat screen.
 *
 * Beyond the static Mascot poses, this adds three animated states:
 *   - idle:     gentle float, wave pose
 *   - listening: thinking pose + pulsing mic ring (learner is speaking)
 *   - talking:  wave pose + rapid beak-bob animation + sound-wave bars
 *   - thinking: thinking pose + slow oscillation (processing)
 *
 * Reduced-motion users see the correct pose with no animated embellishments.
 */
export function TalkingMascot({
  mode,
  size = 160,
}: {
  mode: TalkingMascotMode;
  size?: number;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const equipped = useEquippedOutfit();
  const overlay = accessoryOverlaySource(
    MODE_POSES[mode],
    equipped.accessory,
  );

  // ── Float loop (idle + thinking) ──────────────────────────────────────────
  const floatVal = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion || (mode !== 'idle' && mode !== 'thinking')) {
      floatVal.value = withTiming(0, { duration: 200 });
      return;
    }
    floatVal.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [mode, reduceMotion, floatVal]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * Math.sin(floatVal.value * Math.PI) }],
  }));

  // ── Beak-bob loop (talking) ────────────────────────────────────────────────
  // Rapid small vertical oscillation simulates beak open/close while Bolo speaks.
  const beakVal = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion || mode !== 'talking') {
      beakVal.value = withTiming(0, { duration: 150 });
      return;
    }
    beakVal.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [mode, reduceMotion, beakVal]);

  const beakStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -5 * beakVal.value },
      { scaleY: 1 - 0.04 * beakVal.value },
    ],
  }));

  // ── Pulse ring (listening) ──────────────────────────────────────────────────
  const pulseVal = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion || mode !== 'listening') {
      pulseVal.value = withTiming(0, { duration: 200 });
      return;
    }
    pulseVal.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [mode, reduceMotion, pulseVal]);

  const pulseRingStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulseVal.value),
    transform: [{ scale: 1 + 0.35 * pulseVal.value }],
  }));

  // ── Sound bars (talking) ────────────────────────────────────────────────────
  const barVals = [
    useSharedValue(0.3),
    useSharedValue(0.3),
    useSharedValue(0.3),
    useSharedValue(0.3),
    useSharedValue(0.3),
  ];

  React.useEffect(() => {
    if (reduceMotion || mode !== 'talking') {
      barVals.forEach((v) => {
        v.value = withTiming(0.3, { duration: 200 });
      });
      return;
    }
    barVals.forEach((v, i) => {
      const duration = 280 + i * 60;
      v.value = withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.2, { duration, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reduceMotion]);

  const barStyles = barVals.map((v) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }] })),
  );

  const entrance =
    !reduceMotion
      ? appearZoom(30)
      : undefined;

  const imageMotionStyle =
    mode === 'talking' ? beakStyle : floatStyle;

  return (
    <View style={styles.root}>
      {/* Pulse ring for listening */}
      {mode === 'listening' && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: size * 1.1,
              height: size * 1.1,
              borderRadius: (size * 1.1) / 2,
              borderColor: colors.primary,
            },
            pulseRingStyle,
          ]}
        />
      )}

      {/* Mascot image */}
      <Animated.View key={mode} entering={appear(entrance)}>
        <Animated.View style={imageMotionStyle}>
          <View style={{ width: size, height: size }}>
            <Image
              source={mascotSource(MODE_POSES[mode], equipped.garment)}
              style={{ width: size, height: size }}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={
                mode === 'talking'
                  ? 'Bolo the parrot is speaking'
                  : mode === 'listening'
                    ? 'Bolo the parrot is listening'
                    : 'Bolo the parrot'
              }
            />
            {/* Head slot over the garment base, same 1024 frame, drawn at the
                same size, so it lands where it belongs. Explicit width/height:
                a bare absoluteFill Image takes its intrinsic size on iOS. */}
            {overlay ? (
              <Image
                source={overlay}
                style={[styles.overlay, { width: size, height: size }]}
                resizeMode="contain"
                accessible={false}
              />
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>

      {/* Sound wave bars while talking */}
      {mode === 'talking' && (
        <View style={styles.soundBars}>
          {barStyles.map((barStyle, i) => (
            <Animated.View
              key={i}
              style={[
                styles.soundBar,
                { backgroundColor: colors.primary },
                barStyle,
              ]}
            />
          ))}
        </View>
      )}

      {/* Mic dot while listening */}
      {mode === 'listening' && !reduceMotion && (
        <View
          style={[styles.micDot, { backgroundColor: colors.destructive ?? '#EF4444' }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 3,
  },
  overlay: { position: 'absolute', top: 0, left: 0 },
  soundBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    height: 24,
  },
  soundBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  micDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 10,
  },
});
