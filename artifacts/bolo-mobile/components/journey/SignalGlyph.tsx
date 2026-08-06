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
//
// The arm semantics are OURS, not the real world's: here the bar is DOWN while
// the crossing still owes you something and UP once it does not. Reference art
// showing the opposite (up on green) has been ruled against — do not "fix" it.
//
// Every coordinate below is shared verbatim with the web glyph; the two files
// are the same drawing in two renderers, so any edit has to land in both.

import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export type SignalState = 'upcoming' | 'active' | 'waved' | 'cleared';

// Palette lifted verbatim from the web scenery module so the two crossings
// are the same object in two renderers.
const SLATE = '#64748b'; // concrete base + arm outline
const SLATE_SHADE = '#475569'; // mast, hood, housing, footing
const INDIGO = '#5048e5'; // crossbuck trim
const TEAL = '#0d9488'; // hardware accents (housing door + pivot hub)
const INK = '#0f172a'; // lamp housing + ground shadow
const AMBER = '#f59e0b'; // bell + housing bolts + active halo ring
const AMBER_SHADE = '#b45309'; // bell rim + clapper
const SIGNAL_RED = '#ef4444';
const SIGNAL_AMBER = '#ffb300';
const SIGNAL_GREEN = '#22c55e';

/** The striped gate arm, drawn pointing left from its pivot on the post. */
function GateArm() {
  return (
    <G>
      <Rect x={1} y={20.9} width={16.4} height={3} rx={1.5} fill="#ffffff" stroke={SLATE} strokeWidth={0.6} />
      <Rect x={2.1} y={21.35} width={3.2} height={2.1} rx={0.5} fill={SIGNAL_RED} />
      <Rect x={7.9} y={21.35} width={3.2} height={2.1} rx={0.5} fill={SIGNAL_RED} />
      <Rect x={13.5} y={21.35} width={2.7} height={2.1} rx={0.5} fill={SIGNAL_RED} />
      {/* gate lamps, in the white gaps between stripes. Fixed colour in every
          state: the STATE lamp is the one on the mast, and a second colour
          here would give the learner two things to read. */}
      <G testID="signal-arm-lamps">
        <Circle cx={6.6} cy={22.4} r={1.15} fill={INK} opacity={0.8} />
        <Circle cx={6.6} cy={22.4} r={0.6} fill={SIGNAL_RED} />
        <Circle cx={12.3} cy={22.4} r={1.15} fill={INK} opacity={0.8} />
        <Circle cx={12.3} cy={22.4} r={0.6} fill={SIGNAL_RED} />
      </G>
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
      {/* ground shadow (shared scenery convention: down-light from upper-left) */}
      <Ellipse cx={16.4} cy={38.4} rx={9.6} ry={1.5} fill={INK} opacity={0.12} />
      {/* concrete base + footing */}
      <G testID="signal-base">
        <Rect x={9.4} y={33.6} width={14} height={3.2} rx={1.2} fill={SLATE} />
        <Rect x={8.6} y={36} width={15.6} height={1.8} rx={0.9} fill={SLATE_SHADE} opacity={0.9} />
      </G>
      {/* mast */}
      <Rect x={15} y={3.2} width={2.8} height={31} rx={1.2} fill={SLATE_SHADE} />
      {/* mechanism housing: the box that swings the arm, bolted to the mast */}
      <G testID="signal-housing">
        <Rect x={11.3} y={24.9} width={10.2} height={7} rx={1.8} fill={SLATE_SHADE} />
        <Rect x={12.6} y={26.1} width={7.6} height={4.6} rx={1.1} fill={TEAL} />
        <Rect x={13.6} y={27.2} width={5.6} height={0.5} rx={0.25} fill={INK} opacity={0.35} />
        <Rect x={13.6} y={28.4} width={5.6} height={0.5} rx={0.25} fill={INK} opacity={0.35} />
        <Circle cx={12.1} cy={26} r={0.5} fill={AMBER} />
        <Circle cx={20.7} cy={26} r={0.5} fill={AMBER} />
        <Circle cx={12.1} cy={30.7} r={0.5} fill={AMBER} />
        <Circle cx={20.7} cy={30.7} r={0.5} fill={AMBER} />
      </G>
      {/* warning bell atop the mast */}
      <G testID="signal-bell">
        <Path d="M13.9 4.3 C13.9 1.9 15 0.8 16.4 0.8 C17.8 0.8 18.9 1.9 18.9 4.3 Z" fill={AMBER} />
        <Rect x={13.3} y={4.1} width={6.2} height={1.2} rx={0.6} fill={AMBER_SHADE} />
        <Circle cx={16.4} cy={5.8} r={0.65} fill={AMBER_SHADE} />
      </G>
      {/* crossbuck (X sign): the same bar twice, mirrored about the mast */}
      <G testID="signal-crossbuck">
        <G rotation={26} originX={16.4} originY={8.2}>
          <Rect x={8.9} y={6.85} width={15} height={2.7} rx={1.35} fill="#ffffff" stroke={INDIGO} strokeWidth={1} />
        </G>
        <G rotation={-26} originX={16.4} originY={8.2}>
          <Rect x={8.9} y={6.85} width={15} height={2.7} rx={1.35} fill="#ffffff" stroke={INDIGO} strokeWidth={1} />
        </G>
      </G>
      {/* lamp head: hood + housing */}
      <Rect x={12.6} y={9.5} width={7.6} height={1.6} rx={0.8} fill={SLATE_SHADE} />
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
      {/* hinge bracket, behind the arm */}
      <Rect x={14.6} y={20.2} width={3.6} height={4.4} rx={1.3} fill={SLATE_SHADE} />
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
      <Circle cx={16.4} cy={22.4} r={0.65} fill={SLATE_SHADE} />
    </Svg>
  );
}
