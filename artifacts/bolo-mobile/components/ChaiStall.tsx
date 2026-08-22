// Chacha-ji's Chai Stall — mobile twin of the web treatment
// (artifacts/gujarati-coach/src/components/chai-stall.tsx). Owner ruling 4:
// same asset, same loop, same layer map on both platforms, built once.
//
// TIER 1, the SCENE: a FULL-WIDTH band on home, the art's 1024/572 scene
// cropped 12% at the bottom (BOTTOM_CROP) to drop the platform edge and
// track, directly below the boarding pass (Task #1049) so the pass reads as
// standing in front of the stall. It carries one slow ambient steam plume over
// the kettle,
// and tapping it opens the Chai wallet sheet — the same sheet the Chai stat
// cell opens, never a second wallet surface. (It shipped at wallet-vignette
// scale, 56px and right-aligned; at that size a detailed scene read as a stray
// thumbnail rather than a place. Owner correction, Aug 6.)
//
// The scene is therefore no longer decoration: given `onPress` it is a real
// button with an accessible label. Without one it keeps the old atmospheric
// treatment (hidden from the a11y tree, not pressable). The scene View stays
// out of the a11y tree EITHER WAY, so the Pressable is the single node a
// screen reader lands on — the overlay text below never splits it in two.
//
// The band NAMES ITSELF and shows the live balance in a top-right column,
// so it reads as a wallet surface rather than scenery (same strings and
// layout as web). Both sit over photographic art with a bright sky, so
// legibility is the house pair: a LinearGradient scrim fading leftward
// across the right half (the home bottom-fade / pass-shimmer pattern) plus
// white text with the textShadow treatment speed-round already uses over
// art. The scrim covers the whole right half, so the column never depends
// on the art happening to be dark under it. The balance is the caller's — this
// component never queries or caches one, because spends are
// server-authoritative and every surface refetches on change.
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
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppFonts } from '@/constants/fonts';
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
  /**
   * Chacha-ji himself, isolated on transparency — the existing greeting figure,
   * trimmed to its bounding box. A LAYER, never painted into stall.png: the
   * banked pour-on-earn moment has to be able to animate him.
   */
  chachaji: require('../assets/images/stall/chachaji.png') as number,
};

/**
 * Intrinsic art dimensions, so the vignette and plume keep their shapes.
 * These MUST equal the real pixel dimensions of the files above: the scene
 * box is what `cover` is measured against (a mismatch crops the art), and the
 * plume's height is derived as width/STEAM_ASPECT rather than from the file.
 * Verified against the PNG headers, not eyeballed.
 */
const SCENE_ASPECT = 1024 / 572;
const STEAM_ASPECT = 226 / 485;
const CHACHAJI_ASPECT = 386 / 520;

/** Bottom crop: the platform edge and track, the least informative strip. */
const BOTTOM_CROP = 0.12;
const VISIBLE_ASPECT = 1024 / (572 * (1 - BOTTOM_CROP));

/**
 * Where the plume sits, in fractions of the SCENE box — the same three
 * numbers as the web KETTLE map. If the scene art moves the kettle, update
 * both files together.
 */
const KETTLE = { left: 0.21, bottom: 0.46, width: 0.12 } as const;

/**
 * Where Chacha-ji stands, same contract as KETTLE and the same three numbers
 * as web's CHACHAJI map: fractions of the SCENE box. Height comes from the
 * art's own aspect.
 *
 * `bottom` is MEASURED, not chosen: the awning support pole meets the dirt at
 * b≈17 (its base, with the grass tufts, traced by scanning stall.png for the
 * pole's dark span row by row), and that is the ground line for the open dirt
 * beside the stall. His soles sit on it. Two earlier passes chose a bottom by
 * eye and he floated. `left` clears the pole entirely — the pole leans between
 * x45.2% (base) and x48.3% (upper), so 48.5% puts his whole silhouette to its
 * right. Verified by compositing the real art and zooming into the soles and
 * the pole at native scale.
 */
const CHACHAJI = { left: 0.485, bottom: 0.17, width: 0.195 } as const;

/** The band's own name. The web twin renders the identical string. */
export const STALL_TITLE = "Chacha-ji's Chai Stall";

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
  testID = 'chai-glyph',
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Image
      source={STALL_ASSETS.kulhad}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      resizeMode="contain"
      style={[{ width: size, height: size }, style as never]}
    />
  );
}

/**
 * The stall scene. Fills its parent's width and takes its height from the
 * scene's aspect, so the KETTLE fractions land on the kettle at any width —
 * they are fractions OF THAT BOX, and the box never changes shape.
 *
 * The plume's pixel placement needs real numbers, so the box reports its size
 * via onLayout rather than the caller declaring a height. Until the first
 * layout the plume measures zero and is simply not drawn yet.
 *
 * Pass `onPress` to make the scene a door into the wallet; `accessibilityLabel`
 * is the accessible name for that button.
 */
export function ChaiStallVignette({
  style,
  onPress,
  accessibilityLabel,
  balance,
}: {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  /**
   * The learner's live Chai balance, straight from the caller's token query
   * (home already holds one for the Chai stat cell). Undefined while that
   * query is in flight, which renders the same "-" the wallet surfaces show.
   */
  balance?: number;
}) {
  const reduceMotion = useReducedMotion();
  const loop = steamLoop(!!reduceMotion);
  const phase = useSharedValue(0.5);
  const [box, setBox] = React.useState({ width: 0, height: 0 });

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

  const steamWidth = box.width * KETTLE.width;
  const chachajiWidth = box.width * CHACHAJI.width;

  // Opacity and translateY only. Animating layout props (top/left/bottom)
  // inside useAnimatedStyle crashes Expo Go on the New Architecture, so the
  // plume's placement is a plain static style and only its transform moves.
  const steamStyle = useAnimatedStyle(() => ({
    opacity:
      STEAM_MIN_OPACITY + (STEAM_MAX_OPACITY - STEAM_MIN_OPACITY) * phase.value,
    transform: [{ translateY: (0.5 - phase.value) * box.height * 0.18 }],
  }));

  const scene = (
    <View
      testID="chai-stall-vignette"
      // Never pressable on its own, and never in the a11y tree: when the
      // caller wants a tap target the Pressable below owns it, so a screen
      // reader lands on ONE node (the button) rather than on the button plus
      // the overlay's title and balance text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.vignette, onPress ? undefined : style]}
    >
      <View
        testID="chai-stall-scene-layer"
        pointerEvents="none"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setBox((prev) =>
            prev.width === width && prev.height === height
              ? prev
              : { width, height },
          );
        }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          aspectRatio: SCENE_ASPECT,
        }}
      >
        {/* width/height 100% are LOAD-BEARING, not redundant with absoluteFill.
            With only the four insets, iOS gives the Image its INTRINSIC size
            (1024x572pt) anchored top-left; overflow:hidden then crops the band
            to the art's top-left corner and resizeMode="cover" scales nothing,
            because the frame already equals the intrinsic size. Expo web is
            unaffected (RN-web maps the insets straight to CSS), so this only
            ever shows up on device. Mirrors web's `absolute inset-0 h-full
            w-full object-cover`, and matches the chachaji/steam layers below. */}
        <Image
          source={STALL_ASSETS.scene}
          testID="chai-stall-scene"
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, styles.fillImage]}
        />
        {/* Decorative layer, under the scrim like the rest of the art: he is
            the man at the stall, not a control. Not pressable, and the whole
            scene is already out of the a11y tree, so no node is added. */}
        {/* A View carries the placement and the pointerEvents rule (Image takes
            no pointerEvents prop) — the scene above is already unpressable, and
            this states the same rule on the layer itself. */}
        <View
          testID="chai-stall-chachaji"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: box.width * CHACHAJI.left,
            bottom: box.height * CHACHAJI.bottom,
            width: chachajiWidth,
            height: chachajiWidth / CHACHAJI_ASPECT,
          }}
        >
          <Image
            source={STALL_ASSETS.chachaji}
            testID="chai-stall-chachaji-image"
            resizeMode="contain"
            style={styles.fillImage}
          />
        </View>
        <Animated.View
          testID="chai-stall-steam"
          style={[
            {
              position: 'absolute',
              left: box.width * KETTLE.left,
              bottom: box.height * KETTLE.bottom,
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
      {/* Legibility scrim: the right half, fading leftward, so the top-right
          column stays readable over the bright sky end of the art. The left
          of the scene, including the plume, is untouched. */}
      <LinearGradient
        testID="chai-stall-scrim"
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.80)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.scrim}
      />
      {/* Quiet on purpose: white on the scrim, no accent fill, so it does not
          compete with the orange boarding pass directly above. */}
      <View pointerEvents="none" style={styles.overlayColumn}>
        <Text testID="chai-stall-title" style={styles.title}>
          {STALL_TITLE}
        </Text>
        <View style={styles.balanceChip}>
          <ChaiGlyph size={24} />
          <Text testID="chai-stall-balance" style={styles.balanceValue}>
            {balance === undefined ? '-' : String(balance)}
          </Text>
          <Text style={styles.balanceUnit}>Chai</Text>
        </View>
      </View>
    </View>
  );

  if (!onPress) return scene;

  return (
    <Pressable
      testID="chai-stall-button"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Open your Chai wallet'}
      style={style}
    >
      {scene}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The roadside signpost that used to sit here is gone: it covered the stall
  // art it was meant to point at. The journey map keeps its own signpost
  // (components/journey/Scenery.tsx, testID chacha-stall-sign), where there is
  // room for it and it is doing real wayfinding.
  vignette: {
    // Full-width band at the scene's own aspect: Yoga derives the height from
    // the measured width, which is what keeps the KETTLE fractions true.
    width: '100%',
    aspectRatio: VISIBLE_ASPECT,
    borderRadius: 14,
    overflow: 'hidden',
  },
  steamImage: {
    width: '100%',
    height: '100%',
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '50%',
  },
  overlayColumn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: '42%',
    alignItems: 'flex-end',
    gap: 10,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'right',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  balanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  balanceValue: {
    color: '#FFFFFF',
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
  },
  balanceUnit: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: AppFonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
