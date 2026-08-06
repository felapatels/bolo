// Chacha-ji's Chai Stall — mobile twin of the web treatment
// (artifacts/gujarati-coach/src/components/chai-stall.tsx). Owner ruling 4:
// same asset, same loop, same layer map on both platforms, built once.
//
// TIER 1, the SCENE: a stall vignette on home at wallet-vignette scale (56px
// tall), carrying one slow ambient steam plume over the kettle. Atmospheric
// only — hidden from the accessibility tree, not pressable, no wallet
// behavior attached.
//
// TIER 2, the GLYPH: the kulhad (clay chai cup) replaces the Feather coffee
// icon at every spot showing a Chai amount — stat cell, wallet rows, earn
// chips. Feather 'coffee' survives ONLY in lib/ui.ts, where it is the
// food-topic category icon rather than a currency mark.
//
// DELIVERY: Metro static requires, mirroring assets/images/mascot (Mascot.tsx,
// lib/band-audio.ts). The web twin resolves the same three files out of the
// public folder via BASE_URL; the registries must stay in step.
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Asset map: the mobile twin of web's STALL_ASSETS path registry. */
export const STALL_ASSETS = {
  /** The stall scene: kettle, kulhads, awning, platform beyond. */
  scene: require('../assets/images/stall/stall.png') as number,
  /** The clay chai cup. Chai's inline glyph everywhere an amount is shown. */
  kulhad: require('../assets/images/stall/kulhad.png') as number,
  /** Isolated steam plume, layered over the kettle in the scene. */
  steam: require('../assets/images/stall/steam.png') as number,
};

/** Intrinsic art dimensions, so the vignette and plume keep their shapes. */
const SCENE_ASPECT = 1024 / 574;
const STEAM_ASPECT = 232 / 487;

/**
 * Where the plume sits, in fractions of the SCENE box — the same three
 * numbers as the web KETTLE map. If the scene art moves the kettle, update
 * both files together.
 */
const KETTLE = { left: 0.21, bottom: 0.46, width: 0.12 } as const;

/** Steam opacity at rest. Also the reduced-motion frame: visible, still. */
export const STEAM_REST_OPACITY = 0.45;
const STEAM_MIN_OPACITY = 0.3;
const STEAM_MAX_OPACITY = 0.62;
const STEAM_CYCLE_MS = 7000;

/**
 * The ambient-steam contract, extracted so the reduced-motion ruling is
 * testable without reaching through Reanimated. Reduced motion holds the
 * plume on its rest frame; nothing else about the scene changes, so the
 * vignette never degrades to a blank layer.
 */
export function steamLoop(reduceMotion: boolean): {
  animate: boolean;
  restOpacity: number;
  cycleMs: number;
} {
  return {
    animate: !reduceMotion,
    restOpacity: STEAM_REST_OPACITY,
    cycleMs: STEAM_CYCLE_MS,
  };
}

/**
 * The kulhad glyph. A drop-in replacement for
 * `<Feather name="coffee" size={n} />`: pass the same size. Decorative — every
 * site that uses it already writes the amount and the word "Chai" in text.
 */
export function ChaiGlyph({
  size = 16,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Image
      source={STALL_ASSETS.kulhad}
      testID="chai-glyph"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      resizeMode="contain"
      style={[{ width: size, height: size }, style as never]}
    />
  );
}

/**
 * The stall scene vignette. `height` is the wallet-vignette scale by default;
 * width follows the scene's aspect so the KETTLE fractions stay true.
 */
export function ChaiStallVignette({
  height = 56,
  style,
}: {
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const loop = steamLoop(!!reduceMotion);
  const phase = useSharedValue(0.5);

  React.useEffect(() => {
    if (!loop.animate) {
      phase.value = 0.5;
      return;
    }
    phase.value = withRepeat(
      withTiming(1, {
        duration: loop.cycleMs / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [loop.animate, loop.cycleMs, phase]);

  const width = height * SCENE_ASPECT;
  const steamWidth = width * KETTLE.width;

  // Opacity and translateY only. Animating layout props (top/left/bottom)
  // inside useAnimatedStyle crashes Expo Go on the New Architecture, so the
  // plume's placement is a plain static style and only its transform moves.
  const steamStyle = useAnimatedStyle(() => ({
    opacity:
      STEAM_MIN_OPACITY + (STEAM_MAX_OPACITY - STEAM_MIN_OPACITY) * phase.value,
    transform: [{ translateY: (0.5 - phase.value) * height * 0.18 }],
  }));

  return (
    <View
      testID="chai-stall-vignette"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.vignette, { width, height }, style]}
    >
      <Image
        source={STALL_ASSETS.scene}
        testID="chai-stall-scene"
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        testID="chai-stall-steam"
        style={[
          {
            position: 'absolute',
            left: width * KETTLE.left,
            bottom: height * KETTLE.bottom,
            width: steamWidth,
            height: steamWidth / STEAM_ASPECT,
            opacity: loop.restOpacity,
          },
          steamStyle,
        ]}
      >
        <Image
          source={STALL_ASSETS.steam}
          resizeMode="contain"
          style={styles.steamImage}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  steamImage: {
    width: '100%',
    height: '100%',
  },
});
