// The Signalman, a react-native-svg TRANSCRIPTION of the web glyph in
// gujarati-coach/src/components/journey-scenery.tsx (SignalmanGlyph). Same
// 26×40 viewBox, same shapes in the same paint order, same coordinates, same
// brand-palette fills. This is not a redesign: if the web glyph changes, this
// file is edited to match it, never the other way around.
//
// He is the friendly crossing keeper the encounter copy already names ("the
// signalman kept your Chai warm"), so his job here is personality at exactly
// the moment the words invoke him.
//
// Follows the Inline-SVG character pattern (docs/CODEBASE-FACTS.md House
// Patterns) as TrainEngine does: flat brand-palette shapes, no gradients, no
// raster, whole-glyph motion only. He has no animation because the web glyph
// has none, do not add per-limb motion.
//
// Decorative only: the encounter's scene header is hidden from assistive tech
// and this Svg hides itself too, matching its sibling SignalGlyph.
import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// Palette lifted verbatim from the web scenery module.
const SKIN = '#f5c99b'; // face/hands (warm step of the AMBER family)
const INK = '#0f172a'; // ground shadow, eyes, smile
const SLATE_SHADE = '#475569'; // flag pole
const SIGNAL_RED = '#ef4444'; // pennant
const TRUNK_SHADE = '#713f12'; // boots
const INDIGO = '#5048e5'; // uniform + cap
const TEAL = '#0d9488'; // belt + cap band
const AMBER = '#f59e0b'; // brass buttons

export function SignalmanGlyph() {
  return (
    <Svg
      width={26}
      height={40}
      viewBox="0 0 26 40"
      testID="signalman-glyph"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* ground shadow (shared scenery convention: down-light from upper-left) */}
      <Ellipse cx={13} cy={36.2} rx={8} ry={1.9} fill={INK} opacity={0.13} />
      {/* flag pole, held high, drawn first so the hand overlaps the grip */}
      <Rect x={21.2} y={2.4} width={1.5} height={17} rx={0.75} fill={SLATE_SHADE} />
      {/* red pennant, pointing back toward the track */}
      <Path d="M22.7 2.8 L22.7 8.8 L15.2 5.8 Z" fill={SIGNAL_RED} />
      {/* legs + boots */}
      <Rect x={7.6} y={23.6} width={2.6} height={9.6} rx={1.2} fill={INK} />
      <Rect x={12.2} y={23.6} width={2.6} height={9.6} rx={1.2} fill={INK} />
      <Rect x={6.9} y={32.6} width={4} height={2.8} rx={1.3} fill={TRUNK_SHADE} />
      <Rect x={11.5} y={32.6} width={4} height={2.8} rx={1.3} fill={TRUNK_SHADE} />
      {/* uniform jacket, belt, brass buttons */}
      <Rect x={6.4} y={12.8} width={9.4} height={11} rx={3} fill={INDIGO} />
      <Rect x={6.4} y={21.2} width={9.4} height={1.6} fill={TEAL} />
      <Circle cx={11.1} cy={16} r={0.7} fill={AMBER} />
      <Circle cx={11.1} cy={19} r={0.7} fill={AMBER} />
      {/* resting arm + hand */}
      <Rect x={4.4} y={13.6} width={2.4} height={7.6} rx={1.2} fill={INDIGO} />
      <Circle cx={5.6} cy={21.8} r={1.1} fill={SKIN} />
      {/* raised arm gripping the pole */}
      <Path
        d="M15.2 15.2 L21.4 10"
        stroke={INDIGO}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={21.9} cy={9.6} r={1.2} fill={SKIN} />
      {/* friendly face */}
      <Circle cx={11} cy={8.5} r={4.2} fill={SKIN} />
      <Circle cx={9.6} cy={8.4} r={0.55} fill={INK} />
      <Circle cx={12.5} cy={8.4} r={0.55} fill={INK} />
      <Path
        d="M9.6 10.2 q1.4 1.3 2.9 0"
        stroke={INK}
        strokeWidth={0.8}
        strokeLinecap="round"
        fill="none"
      />
      {/* peaked cap with teal band */}
      <Rect x={6.6} y={2.8} width={8.8} height={3.4} rx={1.6} fill={INDIGO} />
      <Rect x={6.6} y={5.3} width={8.8} height={1.2} fill={TEAL} />
      <Rect x={5.4} y={6.1} width={7.2} height={1.2} rx={0.6} fill={INDIGO} />
    </Svg>
  );
}
