/**
 * A SLOW GLOW THAT SAYS "NEW HERE". Wrap a control in it and a soft glow in
 * the given colour breathes in and out behind it, once every
 * ATTENTION_PULSE_CYCLE_MS, while the control lifts a few percent with it.
 * Asked for on 2026-08-29 for home's View Map pill: "i want view map button
 * on web and ios to be slowly pulsing since its a new area, i want to draw
 * attention to it."
 *
 * A BREATH, NOT A RIPPLE. The first cut was a thin 2pt ring shooting outward
 * and fading, and the owner's verdict on the simulator was "pulse isn't
 * good": too faint to register as anything. Two filled glow layers that
 * swell and fade TOGETHER with the pill's lift read as the pill itself
 * breathing, which is the gesture wanted.
 *
 * Web twin: `.animate-view-map-pulse` in gujarati-coach/src/index.css. Same
 * cycle, same 1.06 lift, same glow strengths; keep the numbers in step. Web
 * also tints the pill's own fill at the peak; here the pill keeps its paint
 * and the inner glow layer, sitting just outside its edge, does that job.
 *
 * ON useLoopProgress, LIKE THE PASS BENEATH IT. The first cut was an RN
 * Animated.loop on the JS driver, which is the codebase's rule for RN
 * Animated ports (native driver dead in release, CLAUDE.md). It was also the
 * only always-on RN Animated loop on the home screen, and RN Animated is
 * REAL under jest: every home suite that drives fake timers then ticked the
 * halo outside act() on each flush, and one suite hung. Every other idle
 * loop in the app is reanimated through useLoopProgress, which the jest
 * setup mocks wholesale, so the heartbeat is inert in tests by construction.
 * The same loop that breathes the pass in the shipped 1.0.5 build is the
 * one under this glow.
 *
 * OPACITY AND TRANSFORM ONLY in the animated styles: layout props through
 * useAnimatedStyle are the New Architecture crash NextBadgeSpotlight warns
 * about, and a glow needs neither.
 *
 * Reduce Motion gets the control exactly as it was: no glow, no lift. What
 * the glow carries ("this is new") is decorative, unlike the feed dot's, so
 * there is nothing to hold still in its place.
 */
import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { useLoopProgress } from '@/lib/useLoopProgress';
import { PASS_CYCLE_MS } from '@/components/journey/JourneyPassCard';

/** One breath, in and out, in ms: THE PASS'S OWN HEARTBEAT, not a cycle of
 *  this glow's own (owner: "its on a different pulse rate then the boarding
 *  card feels messy"). Both loops start at mount and peak mid-lap, so the
 *  glow and the pass's breathe rise and fall together. */
export const ATTENTION_PULSE_CYCLE_MS = PASS_CYCLE_MS;
/** How far the control lifts at the top of the breath. HALF STRENGTH from
 *  the first breath, glow included (owner: "more subtle, its taking
 *  attention away from the actual CTA"): a hint at a new door, with the
 *  pass's Resume beneath it still the loudest thing on the screen. */
export const ATTENTION_PULSE_LIFT = 1.03;
/** The inner glow, hugging the control's edge: peak opacity, reach, and how
 *  far it sits below the control so it reads as glowing UNDERNEATH (owner:
 *  "same color as text is glowing underneath"). */
export const ATTENTION_PULSE_INNER = { opacity: 0.16, scale: 1.1, drop: 2 } as const;
/** The outer glow, the soft spill beyond it. */
export const ATTENTION_PULSE_OUTER = { opacity: 0.08, scale: 1.28, drop: 4 } as const;

export function AttentionPulse({
  color,
  active = true,
  radius = 999,
  style,
  children,
}: {
  /** The glow's colour: the app's accent for a pill in the accent. */
  color: string;
  /** False parks the control still, glow gone, e.g. once the area is no longer new. */
  active?: boolean;
  /** The glow follows the control's corners; a pill is 999. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const pulsing = active && !reduceMotion;
  // Linear 0 to 1 per lap; the breath is shaped by hand inside the worklets
  // (a raised cosine, 0 at both ends and 1 mid-lap, ease-in-out either way)
  // so the two platforms trace one curve.
  const lap = useLoopProgress(ATTENTION_PULSE_CYCLE_MS, pulsing);

  const liftStyle = useAnimatedStyle(() => {
    const breath = pulsing ? 0.5 - 0.5 * Math.cos(2 * Math.PI * lap.value) : 0;
    return { transform: [{ scale: interpolate(breath, [0, 1], [1, ATTENTION_PULSE_LIFT]) }] };
  });
  const innerStyle = useAnimatedStyle(() => {
    const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * lap.value);
    return {
      opacity: interpolate(breath, [0, 1], [0, ATTENTION_PULSE_INNER.opacity]),
      transform: [
        { translateY: interpolate(breath, [0, 1], [0, ATTENTION_PULSE_INNER.drop]) },
        { scale: interpolate(breath, [0, 1], [1, ATTENTION_PULSE_INNER.scale]) },
      ],
    };
  });
  const outerStyle = useAnimatedStyle(() => {
    const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * lap.value);
    return {
      opacity: interpolate(breath, [0, 1], [0, ATTENTION_PULSE_OUTER.opacity]),
      transform: [
        { translateY: interpolate(breath, [0, 1], [0, ATTENTION_PULSE_OUTER.drop]) },
        { scale: interpolate(breath, [0, 1], [1, ATTENTION_PULSE_OUTER.scale]) },
      ],
    };
  });

  const glowBase = { borderRadius: radius, backgroundColor: color };

  return (
    <Animated.View style={[style, liftStyle]}>
      {pulsing && (
        <>
          <Animated.View
            testID="attention-pulse-halo"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, glowBase, outerStyle]}
          />
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, glowBase, innerStyle]}
          />
        </>
      )}
      {children}
    </Animated.View>
  );
}
