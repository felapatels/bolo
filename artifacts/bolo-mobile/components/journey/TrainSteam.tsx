/**
 * THE TRAIN'S STEAM (owner, 2026-09-05, with the particle spec handed over).
 *
 * Puffs leave the locomotive's chimney on the boarding pass, drift up with a
 * wobble, swell, thin out and vanish behind the blue stats band. The owner's
 * architecture, and it is the right one:
 *
 *     stats band        zIndex 30   the plume disappears BEHIND this
 *     steam             zIndex 20   here, outside anything clipped
 *     journey card      zIndex 10   the train is in here
 *
 * IT CANNOT LIVE INSIDE THE PASS. The pass clips its own content (the film,
 * the torn paper, the ticket's notches all depend on `overflow: hidden`), so
 * steam drawn in there is chopped off at the card's edge. This layer is a
 * sibling of the card, absolutely positioned over it, and its canvas is far
 * taller than the chimney it starts at.
 *
 * ON THE LOOP, AND THIS IS THE ONE PLACE I DEPARTED FROM THE SPEC. The spec
 * uses a bespoke useEffect + withRepeat per puff. This uses `useLoopProgress`,
 * which is the same reanimated loop the pass's own shimmer and glow already
 * ride, for two reasons: one definition of "a loop" in this app rather than
 * two, and it RESTS AT 0 while disabled, so the reduced-motion still frame
 * comes free instead of needing its own branch.
 *
 * AND IT MUST BE JUDGED ON TESTFLIGHT, NOT HERE. This app has a documented
 * history of animation that runs perfectly in a dev build and comes out dead
 * flat in release; CLAUDE.md's measurement rules are blunt that only store
 * builds tell the truth. The simulator will call this beautiful either way.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useLoopProgress } from '@/lib/useLoopProgress';

/**
 * One puff's character. Independent duration, drift and phase is the whole
 * trick: a single animated cloud is what makes steam read as fake.
 */
const PUFFS = [
  { cycle: 5200, drift: 10, phase: 0.0, size: 22 },
  { cycle: 5900, drift: -16, phase: 0.17, size: 26 },
  { cycle: 5500, drift: 20, phase: 0.35, size: 20 },
  { cycle: 6300, drift: -11, phase: 0.52, size: 28 },
  { cycle: 5700, drift: 15, phase: 0.68, size: 24 },
  { cycle: 6100, drift: -19, phase: 0.84, size: 30 },
] as const;

/**
 * ONE ORIGIN, WHICH IS THE POINT (owner, 2026-09-05: "single point from smoke
 * stack"). Every puff starts centred on the same spot and only DRIFT moves it
 * sideways as it climbs, so the plume opens out of the chimney instead of
 * appearing as six separate columns. The first pass gave each puff its own
 * starting offset and it read as a row of clouds.
 */
const ORIGIN_LEFT = '50%';

/**
 * The discs inside one puff, as fractions of its size. SEVEN, NOT THREE, and
 * heavily overlapped: three hard circles read as bubbles, which is exactly
 * what the owner saw. Overlapping seven at low individual opacity with a wide
 * white shadow on each lets the edges dissolve into one another, which is the
 * only way to get a soft irregular mass out of Views.
 *
 * IT CANNOT BE AN SVG. A react-native-svg overlay eats every touch beneath it
 * even with pointerEvents none, and this layer sits directly over the pass's
 * own Pressable; an Svg here would swallow taps meant for the boarding pass.
 * That is a standing rule in CLAUDE.md, paid for by the stop cards.
 */
const DISCS = [
  { dx: 0.0, dy: 0.0, r: 1.0 },
  { dx: -0.34, dy: 0.16, r: 0.74 },
  { dx: 0.36, dy: 0.2, r: 0.68 },
  { dx: -0.16, dy: -0.28, r: 0.62 },
  { dx: 0.22, dy: -0.24, r: 0.58 },
  { dx: -0.44, dy: -0.06, r: 0.46 },
  { dx: 0.48, dy: -0.02, r: 0.44 },
] as const;

export function TrainSteam({
  enabled,
  height,
  style,
  testID,
}: {
  enabled: boolean;
  /** How far the plume climbs. The canvas is this tall; the chimney is at its foot. */
  height: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View pointerEvents="none" style={style} testID={testID}>
      {PUFFS.map((p, i) => (
        <Puff key={i} {...p} rise={height} enabled={enabled} />
      ))}
    </View>
  );
}

function Puff({
  cycle,
  drift,
  phase,
  size,
  rise,
  enabled,
}: {
  cycle: number;
  drift: number;
  phase: number;
  size: number;
  rise: number;
  enabled: boolean;
}) {
  const progress = useLoopProgress(cycle, enabled);
  const anim = useAnimatedStyle(() => {
    // The phase is what staggers the six without six delays. Wrapping here
    // rather than delaying the loop means every puff is already mid-flight on
    // the first frame, so the plume never starts empty.
    const p = (progress.value + phase) % 1;
    // THE PLUME LEANS UPPER-LEFT, not straight up. The train sits at the
    // card's right edge, so a vertical plume walks off the screen; leaning it
    // back sends the steam into the composition instead.
    const lean = -18 * p;
    return {
      // THICK AT THE STACK, GONE AT THE BAND (owner, 2026-09-05: "thicker to
      // start", "hit the blue stats bar"). It leaves the chimney at nearly
      // full strength over a very short ramp, holds, and only lets go in the
      // last fifth, which is where the stats card is already covering it.
      opacity:
        p < 0.04
          ? (p / 0.04) * 0.95
          : p > 0.8
            ? Math.max(0, (1 - (p - 0.8) / 0.2) * 0.95)
            : 0.95 - (p - 0.04) * 0.22,
      transform: [
        { translateY: -rise * p },
        { translateX: lean + Math.sin(p * Math.PI * 2) * drift },
        // Small and dense at the stack, wide and thin by the band.
        { scale: 0.28 + p * 1.75 },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.puff, { marginLeft: -size / 2, width: size, height: size }, anim]}
    >
      {DISCS.map((d, k) => (
        <View
          key={k}
          style={[
            styles.disc,
            {
              width: size * d.r,
              height: size * d.r,
              borderRadius: (size * d.r) / 2,
              left: size * (0.5 + d.dx) - (size * d.r) / 2,
              top: size * (0.5 + d.dy) - (size * d.r) / 2,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  puff: { position: 'absolute', bottom: 0, left: ORIGIN_LEFT },
  /**
   * WARM GREY, NOT WHITE, and this is why the first two attempts looked thin.
   * The plume crosses cream ticket stock and then the frame's white header, so
   * white steam on it has almost no contrast: it was not too transparent, it
   * was the wrong colour. rgb(219,208,204) is the MEAN of the smoke the
   * artwork itself had painted on this locomotive, sampled off the asset
   * before that smoke was erased, with the shadow taken from its own shading.
   * Real steam against a light ground reads grey, which is what the original
   * illustrator drew.
   *
   * Low per-disc alpha with a wide soft shadow: seven of these overlapping
   * read as one mass, where three opaque ones read as bubbles.
   */
  disc: {
    position: 'absolute',
    backgroundColor: 'rgba(219, 208, 204, 0.62)',
    shadowColor: '#8F8481',
    shadowOpacity: 0.38,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 1 },
  },
});
