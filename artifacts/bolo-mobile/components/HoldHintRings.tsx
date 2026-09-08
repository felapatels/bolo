/**
 * RINGS THAT TRAVEL OUTWARD FROM THE RECORD BUTTON, SAYING "HOLD THIS".
 *
 * ASKED FOR 2026-09-07, from watching a real learner: "everyone always asks,
 * now what do i do. or they tap the mic button and let go." The caption under
 * the button has always read "Hold and say it out loud" and people still tap,
 * because nobody reads a caption before touching the thing it captions. Motion
 * on the button itself is what gets looked at.
 *
 * WHY RINGS HERE WHEN A RING WAS REJECTED THERE. AttentionPulse's own comment
 * records the owner turning down "a thin 2pt ring shooting outward and fading"
 * as too faint to register, and a breathing glow replaced it. Two things differ
 * and both matter: these rings are the walkie-talkie idiom, which is exactly the
 * gesture being taught rather than decoration on a pill; and they are drawn
 * THICK and travelling far rather than thin and shy, which is what "too faint"
 * was about. A breath would say "look here". Rings say "press and hold".
 *
 * THREE RINGS, STAGGERED ON ONE LAP. A single ring reads as a throb. Three at a
 * third of a lap apart read as something radiating outward continuously, which
 * is the sense of a live microphone.
 *
 * ON useLoopProgress, WHICH IS NOT A STYLE CHOICE. The native animation driver
 * is dead in this app's release builds (CLAUDE.md, build 270, measured on
 * device): a native-driven animation comes out flat in the store while animating
 * perfectly in a simulator. Every idle loop in this app goes through
 * useLoopProgress, which the jest setup mocks wholesale, so it is inert in tests
 * by construction. An RN Animated loop here would also be a live loop on the
 * practice screen, and AttentionPulse's comment records what one of those did:
 * it hung a suite.
 *
 * OPACITY AND TRANSFORM ONLY in the animated styles. Layout props through
 * useAnimatedStyle are the New Architecture crash NextBadgeSpotlight warns
 * about, and a ring needs neither.
 *
 * REDUCED MOTION GETS NOTHING, AND LOSES NOTHING. The instruction itself lives
 * in the words under the button, which are not decorative and do not move. The
 * rings only make them looked at sooner.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { useLoopProgress } from '@/lib/useLoopProgress';

/** One ring's whole journey, edge of the button to gone. */
export const HOLD_RING_CYCLE_MS = 2200;
/** How far past the button a ring reaches before it fades out. */
export const HOLD_RING_MAX_SCALE = 1.9;
/** Opacity at the moment a ring leaves the button's edge. */
export const HOLD_RING_PEAK_OPACITY = 0.45;
/** Three rings, a third of a lap apart. */
const RING_OFFSETS = [0, 1 / 3, 2 / 3] as const;

export function HoldHintRings({
  color,
  size,
  active,
}: {
  /** The ring colour. The caller passes the button's own paint. */
  color: string;
  /** The button's diameter in points; a ring starts exactly at its edge. */
  size: number;
  /** False parks everything: no rings, no loop, no work. */
  active: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const running = active && !reduceMotion;
  const lap = useLoopProgress(HOLD_RING_CYCLE_MS, running);

  if (!running) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="hold-hint-rings">
      {RING_OFFSETS.map((offset) => (
        <Ring key={offset} lap={lap} offset={offset} color={color} size={size} />
      ))}
    </View>
  );
}

function Ring({
  lap,
  offset,
  color,
  size,
}: {
  lap: ReturnType<typeof useLoopProgress>;
  offset: number;
  color: string;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    // Each ring runs the same lap, started a third of one earlier.
    const t = (lap.value + offset) % 1;
    return {
      transform: [{ scale: 1 + t * (HOLD_RING_MAX_SCALE - 1) }],
      // Full at the edge, gone by the end of its reach. Linear rather than
      // eased: a ring that lingers at the outside reads as a halo, and a halo
      // is the thing that was already rejected.
      opacity: HOLD_RING_PEAK_OPACITY * (1 - t),
    };
  });

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    alignSelf: 'center',
    top: 0,
    // THICK, because thin was the rejection. Three points reads as a pulse of
    // sound leaving the microphone rather than a hairline.
    borderWidth: 3,
  },
});
