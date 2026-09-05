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
  { cycle: 5200, drift: 12, phase: 0.0, size: 26, left: 0 },
  { cycle: 5900, drift: -19, phase: 0.17, size: 30, left: -6 },
  { cycle: 5500, drift: 24, phase: 0.35, size: 24, left: 5 },
  { cycle: 6300, drift: -13, phase: 0.52, size: 32, left: -3 },
  { cycle: 5700, drift: 18, phase: 0.68, size: 28, left: 7 },
  { cycle: 6100, drift: -22, phase: 0.84, size: 34, left: -8 },
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
  left,
  rise,
  enabled,
}: {
  cycle: number;
  drift: number;
  phase: number;
  size: number;
  left: number;
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
      opacity:
        p < 0.1 ? (p / 0.1) * 0.6 : p > 0.62 ? Math.max(0, (1 - (p - 0.62) / 0.38) * 0.6) : 0.6,
      transform: [
        { translateY: -rise * p },
        { translateX: lean + Math.sin(p * Math.PI * 2) * drift },
        { scale: 0.35 + p * 1.35 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.puff, { left, width: size, height: size }, anim]}>
      {/* THREE DISCS, NOT ONE. A single circle reads as a bubble; three
          overlapping at slight offsets give the lumpy edge steam actually has,
          and they cost nothing next to a blur or an image. */}
      <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]} />
      <View
        style={[
          styles.disc,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size * 0.36,
            left: -size * 0.28,
            top: size * 0.2,
          },
        ]}
      />
      <View
        style={[
          styles.disc,
          {
            width: size * 0.64,
            height: size * 0.64,
            borderRadius: size * 0.32,
            left: size * 0.55,
            top: size * 0.26,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  puff: { position: 'absolute', bottom: 0 },
  disc: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
});
