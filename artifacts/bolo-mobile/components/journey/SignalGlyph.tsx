// Build 35 mobile parity: the trackside crossing signal, ported from the web
// glyph in gujarati-coach/src/components/journey-scenery.tsx.
//
// RATIFIED STATE MODEL — read before editing. There is ONE geometry here and
// four states, and the states differ in exactly two things:
//
//   upcoming  bar DOWN, lamp RED     (crossing ahead, not yet reachable)
//   active    bar DOWN, lamp RED     (+ halo: the crossing is blocking you)
//   waved     bar UP,   lamp AMBER   (you waved through; Chai still unclaimed)
//   cleared   bar UP,   lamp GREEN   (played and paid)
//
// The arm is drawn ONCE, pointing left from its pivot, and the bar-up states
// rotate that same group about the pivot. Do not add a second arm shape, and
// do not branch into four glyphs: the whole point is that a learner reads the
// change (arm angle + lamp color) rather than a different picture.

import React from 'react';
import Svg, { Circle, G, Rect } from 'react-native-svg';

export type SignalState = 'upcoming' | 'active' | 'waved' | 'cleared';

// Palette lifted verbatim from the web scenery module so the two crossings
// are the same object in two renderers.
const SLATE_SHADE = '#475569'; // post
const INDIGO = '#5048e5'; // crossbuck trim
const TEAL = '#0d9488'; // base + pivot hub
const INK = '#0f172a'; // lamp box
const AMBER = '#f59e0b'; // active halo ring
const SIGNAL_RED = '#ef4444';
const SIGNAL_AMBER = '#ffb300';
const SIGNAL_GREEN = '#22c55e';

/** The striped gate arm, drawn pointing left from its pivot on the post. */
function GateArm() {
  return (
    <G>
      <Rect x={1} y={20.9} width={16.4} height={3} rx={1.5} fill="#ffffff" stroke={SLATE_SHADE} strokeWidth={0.6} />
      <Rect x={2.4} y={21.4} width={3.4} height={2} rx={0.6} fill={SIGNAL_RED} />
      <Rect x={8.2} y={21.4} width={3.4} height={2} rx={0.6} fill={SIGNAL_RED} />
      <Rect x={14} y={21.4} width={2.4} height={2} rx={0.6} fill={SIGNAL_RED} />
    </G>
  );
}

export function SignalGlyph({
  state,
  testID,
}: {
  state: SignalState;
  testID?: string;
}) {
  const barDown = state === 'upcoming' || state === 'active';
  const lamp = barDown ? SIGNAL_RED : state === 'waved' ? SIGNAL_AMBER : SIGNAL_GREEN;

  return (
    <Svg
      testID={testID}
      width={40}
      height={50}
      viewBox="0 0 32 40"
      // Decorative: the tappable wrapper carries the label, so the glyph
      // itself must not add a second announcement.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* post + base */}
      <Rect x={15} y={7} width={2.8} height={29} rx={1.2} fill={SLATE_SHADE} />
      <Rect x={10.4} y={35.4} width={12} height={3} rx={1.5} fill={TEAL} />
      {/* crossbuck (X sign): the same bar twice, mirrored about the post */}
      <G rotation={26} originX={16.4} originY={5.4}>
        <Rect x={8.4} y={4} width={16} height={2.9} rx={1.45} fill="#ffffff" stroke={INDIGO} strokeWidth={1} />
      </G>
      <G rotation={-26} originX={16.4} originY={5.4}>
        <Rect x={8.4} y={4} width={16} height={2.9} rx={1.45} fill="#ffffff" stroke={INDIGO} strokeWidth={1} />
      </G>
      {/* lamp box */}
      <Rect x={12.2} y={10.4} width={8.4} height={8.4} rx={2.6} fill={INK} opacity={0.85} />
      {/* ACTIVE blocking emphasis: amber halo ring + red glow behind the lit
          lamp. upcoming gets the same red lamp with NO halo, which is what
          separates "ahead of you" from "blocking you right now". */}
      {state === 'active' && (
        <G testID="signal-active-halo">
          <Circle cx={16.4} cy={14.6} r={6.6} fill="none" stroke={AMBER} strokeWidth={1.6} opacity={0.9} />
          <Circle cx={16.4} cy={14.6} r={5.2} fill={SIGNAL_RED} opacity={0.35} />
        </G>
      )}
      <Circle testID="signal-lamp" cx={16.4} cy={14.6} r={3} fill={lamp} />
      {/* gate arm: down blocks the track, up clears it */}
      {barDown ? (
        <G testID="signal-arm-down">
          <GateArm />
        </G>
      ) : (
        <G testID="signal-arm-up" rotation={75} originX={16.4} originY={22.4}>
          <GateArm />
        </G>
      )}
      {/* pivot hub */}
      <Circle cx={16.4} cy={22.4} r={1.7} fill={TEAL} />
    </Svg>
  );
}
