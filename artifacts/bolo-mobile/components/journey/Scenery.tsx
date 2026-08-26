// Journey map scenery — react-native-svg port of the web pieces
// (gujarati-coach/src/components/journey-scenery.tsx): per-zone landmark
// vistas for the fare-zone postcards, small trackside doodads along the
// serpentine rail, and festival bunting for the terminus. Everything is
// hand-coded SVG in the brand palette plus the active line's accent — no
// raster artwork, nothing generated.
//
// The six vistas are keyed by ZONE INDEX (the six categories are fixed across
// all languages): gateway arch (Greetings), family homes (Family), clock
// tower (Numbers), chai stall (Food), bazaar street (Everyday Words),
// festival palace (Feelings finale).
//
// Grayscale note: the web grays locked showroom zones with a CSS
// `filter: grayscale(1)`; react-native has no such filter, so the same
// treatment is done by swapping the fixed palette for gray tones and passing
// a gray accent.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, G, Image as SvgImage, Line, Path, Rect } from 'react-native-svg';

/** Chacha-ji's delivered figure, the same isolated art components/ChaiStall.tsx
 *  composites in the home vignette (STALL_ASSETS.chachaji there). Required
 *  here directly rather than imported from that module, which pulls the
 *  wallet's own dependencies into the map: one art file, two call sites. */
const CHACHAJI_ART = require('@/assets/images/stall/chachaji.png') as number;
import { isChachaEncounterStation } from '@/lib/chachaMemory';

export const SCENERY_GRAY = '#9ca3af';

type Palette = {
  amber: string;
  leaf: string;
  leaf2: string;
  trunk: string;
  slate: string;
  cloud: string;
  pink: string;
  dark: string;
  door: string;
  signalRed: string;
  signalGreen: string;
  indigo: string;
};

const COLORS: Palette = {
  amber: '#f59e0b',
  leaf: '#10b981',
  leaf2: '#34d399',
  trunk: '#92400e',
  slate: '#64748b',
  cloud: '#cbd5e1',
  pink: '#ec4899',
  dark: '#334155',
  door: '#7c2d12',
  signalRed: '#ef4444',
  signalGreen: '#22c55e',
  indigo: '#4f46e5',
};

// Approximate grayscale of the palette above (luminance-matched by eye).
const GRAYS: Palette = {
  amber: '#b3b7bd',
  leaf: '#a2a7b0',
  leaf2: '#bcc0c7',
  trunk: '#7d8288',
  slate: '#9aa0ab',
  cloud: '#d4d7dc',
  pink: '#adb1b9',
  dark: '#6b7280',
  door: '#71767d',
  signalRed: '#a7abb2',
  signalGreen: '#b0b4bb',
  indigo: '#9297a1',
};

function Cloud({ x, y, s = 1, fill = '#ffffff', o = 0.85 }: { x: number; y: number; s?: number; fill?: string; o?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`} fill={fill} opacity={o}>
      <Ellipse cx={0} cy={0} rx={10} ry={5} />
      <Ellipse cx={8} cy={-2} rx={7} ry={4} />
      <Ellipse cx={-8} cy={-2} rx={6} ry={3.5} />
    </G>
  );
}

function Birds({ x, y, p }: { x: number; y: number; p: Palette }) {
  return (
    <G stroke={p.dark} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.7}>
      <Path d={`M${x} ${y} q2.5 -3 5 0 q2.5 -3 5 0`} />
      <Path d={`M${x + 13} ${y - 5} q2 -2.5 4 0 q2 -2.5 4 0`} />
    </G>
  );
}

function Sun({ x = 206, y = 13, p }: { x?: number; y?: number; p: Palette }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={7} fill={p.amber} opacity={0.9} />
      <Circle cx={x} cy={y} r={10} fill="none" stroke={p.amber} strokeWidth={1} opacity={0.4} strokeDasharray="2 3" />
    </G>
  );
}

function Burst({ x, y, r, ink }: { x: number; y: number; r: number; ink: string }) {
  const rays = [0, 60, 120, 180, 240, 300];
  return (
    <G stroke={ink} strokeWidth={1.6} strokeLinecap="round" opacity={0.85}>
      {rays.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <Line
            key={deg}
            x1={x + Math.cos(rad) * (r * 0.45)}
            y1={y + Math.sin(rad) * (r * 0.45)}
            x2={x + Math.cos(rad) * r}
            y2={y + Math.sin(rad) * r}
          />
        );
      })}
      <Circle cx={x} cy={y} r={1.4} fill={ink} stroke="none" />
    </G>
  );
}

function House({ x, w, h, body, roof, o = 1 }: { x: number; w: number; h: number; body: string; roof: string; o?: number }) {
  return (
    <G opacity={o}>
      <Rect x={x} y={56 - h} width={w} height={h} fill={body} />
      <Path d={`M${x - 3} ${56 - h} h${w + 6} l-${w / 2 + 3} -11 Z`} fill={roof} />
      <Rect x={x + w / 2 - 3} y={56 - h + 5} width={6} height={6} rx={1} fill="#ffffff" opacity={0.9} />
    </G>
  );
}

function Ground({ a }: { a: string }) {
  return <Rect x={0} y={54.5} width={240} height={1.5} fill={a} opacity={0.5} />;
}

/** Zone 1 — Greetings & Manners: a welcoming city gateway arch. */
function GatewayScene({ a, p }: { a: string; p: Palette }) {
  return (
    <G>
      <Sun p={p} />
      <Cloud x={40} y={14} />
      <Birds x={158} y={17} p={p} />
      <Rect x={92} y={18} width={10} height={38} rx={2} fill={a} opacity={0.9} />
      <Rect x={138} y={18} width={10} height={38} rx={2} fill={a} opacity={0.9} />
      <Rect x={86} y={12} width={68} height={7} rx={2} fill={a} opacity={0.75} />
      <Path d="M102 56 V38 Q120 22 138 38 V56" fill="none" stroke={a} strokeWidth={5} opacity={0.85} />
      <Line x1={120} y1={12} x2={120} y2={3} stroke={p.trunk} strokeWidth={1.5} />
      <Path d="M120 3 l9 3 -9 3 Z" fill={p.amber} />
      <Ellipse cx={68} cy={54} rx={10} ry={5} fill={p.leaf} opacity={0.85} />
      <Ellipse cx={172} cy={54} rx={12} ry={5.5} fill={p.leaf2} opacity={0.85} />
      <Ground a={a} />
    </G>
  );
}

/** Zone 2 — Family: a huddle of little homes with a shade tree. */
function HomesScene({ a, p }: { a: string; p: Palette }) {
  return (
    <G>
      <Sun x={210} y={12} p={p} />
      <Cloud x={56} y={12} />
      <House x={62} w={32} h={22} body={a} roof={p.trunk} o={0.85} />
      <House x={104} w={36} h={28} body={p.amber} roof={a} o={0.9} />
      <House x={150} w={30} h={20} body={a} roof={p.trunk} o={0.55} />
      {/* chimney smoke */}
      <G fill={p.cloud} opacity={0.6}>
        <Circle cx={132} cy={20} r={2.5} />
        <Circle cx={136} cy={15} r={3} />
      </G>
      <Rect x={196} y={42} width={4} height={14} fill={p.trunk} opacity={0.9} />
      <Circle cx={198} cy={36} r={9} fill={p.leaf} opacity={0.9} />
      <Circle cx={192} cy={40} r={5.5} fill={p.leaf2} opacity={0.85} />
      <Ground a={a} />
    </G>
  );
}

/** Zone 3 — Numbers 1-10: the town clock tower. */
function ClockTowerScene({ a, p }: { a: string; p: Palette }) {
  return (
    <G>
      <Cloud x={44} y={14} />
      <Birds x={180} y={14} p={p} />
      <Rect x={78} y={38} width={30} height={18} fill={a} opacity={0.4} />
      <Rect x={134} y={42} width={30} height={14} fill={a} opacity={0.3} />
      <Rect x={110} y={12} width={20} height={44} rx={2} fill={a} opacity={0.9} />
      <Path d="M108 12 h24 l-12 -9 Z" fill={a} opacity={0.75} />
      <Circle cx={120} cy={25} r={7} fill="#ffffff" opacity={0.95} />
      <G stroke={a} strokeWidth={1.6} strokeLinecap="round">
        <Line x1={120} y1={25} x2={120} y2={20.5} />
        <Line x1={120} y1={25} x2={123.5} y2={26.5} />
      </G>
      <Line x1={120} y1={3} x2={120} y2={-2} stroke={p.slate} strokeWidth={1} />
      <Path d="M120 -2 l7 2.5 -7 2.5 Z" fill={p.leaf} transform="translate(0 4)" />
      <Ellipse cx={62} cy={54} rx={9} ry={4.5} fill={p.leaf2} opacity={0.85} />
      <Ground a={a} />
    </G>
  );
}

/** Zone 4 — Food & Eating: the chai stall, steam rising. */
function ChaiStallScene({ a, p }: { a: string; p: Palette }) {
  const stripes = [0, 1, 2, 3, 4, 5];
  return (
    <G>
      <Sun x={40} y={13} p={p} />
      <Cloud x={196} y={14} s={0.9} />
      {/* awning */}
      {stripes.map((i) => (
        <Rect key={i} x={82 + i * 13} y={18} width={13} height={11} fill={i % 2 === 0 ? p.amber : '#ffffff'} opacity={0.95} />
      ))}
      <Rect x={80} y={16} width={82} height={3} rx={1.5} fill={a} opacity={0.8} />
      {/* counter + posts */}
      <Rect x={86} y={36} width={70} height={20} rx={1} fill={a} opacity={0.85} />
      <Rect x={83} y={29} width={3} height={27} fill={p.trunk} />
      <Rect x={156} y={29} width={3} height={27} fill={p.trunk} />
      {/* kettle + cups + steam */}
      <Circle cx={104} cy={33} r={4.5} fill={p.slate} />
      <Rect x={99} y={31} width={2.5} height={2} fill={p.slate} />
      <Rect x={118} y={31} width={5} height={5} rx={1} fill="#ffffff" opacity={0.95} />
      <Rect x={128} y={31} width={5} height={5} rx={1} fill="#ffffff" opacity={0.95} />
      <G stroke={p.cloud} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.9}>
        <Path d="M104 25 q-2 -3 0 -6 q2 -3 0 -5" />
        <Path d="M121 28 q-1.5 -2.5 0 -5" />
      </G>
      <Ellipse cx={186} cy={54} rx={11} ry={5} fill={p.leaf} opacity={0.85} />
      <Ground a={a} />
    </G>
  );
}

/** Zone 5 — Everyday Words: bazaar stalls under a pennant string. */
function BazaarScene({ a, p }: { a: string; p: Palette }) {
  const stall = (x: number, canopy: string) => (
    <G key={x}>
      <Path d={`M${x} 30 h30 l-4 9 h-22 Z`} fill={canopy} opacity={0.9} />
      <Line x1={x + 3} y1={39} x2={x + 3} y2={56} stroke={p.trunk} strokeWidth={2.5} />
      <Line x1={x + 27} y1={39} x2={x + 27} y2={56} stroke={p.trunk} strokeWidth={2.5} />
      <Rect x={x + 6} y={44} width={18} height={8} rx={1} fill={a} opacity={0.35} />
    </G>
  );
  // pennant string
  const flags = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84];
  const colors = [a, p.amber, p.leaf, p.pink];
  const px = (t: number) => 30 + t * 180;
  const py = (t: number) => 10 + 4 * Math.sin(Math.PI * t) + 8 * t * (1 - t);
  return (
    <G>
      <Path d="M30 10 Q120 22 210 10" fill="none" stroke={p.slate} strokeWidth={1} opacity={0.7} />
      {flags.map((t, i) => (
        <Path
          key={t}
          d={`M${px(t) - 3.2} ${py(t)} L${px(t) + 3.2} ${py(t)} L${px(t)} ${py(t) + 7.5} Z`}
          fill={colors[i % colors.length]}
          opacity={0.9}
        />
      ))}
      {stall(52, a)}
      {stall(105, p.leaf)}
      {stall(158, p.amber)}
      <Ground a={a} />
    </G>
  );
}

/** Zone 6 — Feelings, the festival-city finale: palace domes and fireworks. */
function FestivalScene({ a, p }: { a: string; p: Palette }) {
  return (
    <G>
      <Burst x={52} y={14} r={9} ink={p.amber} />
      <Burst x={188} y={12} r={11} ink={p.pink} />
      <Burst x={212} y={30} r={7} ink={p.leaf} />
      {/* palace base */}
      <Rect x={88} y={40} width={64} height={16} rx={1} fill={a} opacity={0.85} />
      {/* central onion dome */}
      <Path d="M106 40 Q106 26 120 22 Q134 26 134 40 Z" fill={a} opacity={0.95} />
      <Line x1={120} y1={22} x2={120} y2={15} stroke={a} strokeWidth={2} />
      <Circle cx={120} cy={13.5} r={2} fill={p.amber} />
      {/* side chhatris */}
      <G opacity={0.75}>
        <Path d="M88 34 q8 -8 16 0 Z" fill={a} />
        <Line x1={91} y1={34} x2={91} y2={40} stroke={a} strokeWidth={2} />
        <Line x1={101} y1={34} x2={101} y2={40} stroke={a} strokeWidth={2} />
        <Path d="M136 34 q8 -8 16 0 Z" fill={a} />
        <Line x1={139} y1={34} x2={139} y2={40} stroke={a} strokeWidth={2} />
        <Line x1={149} y1={34} x2={149} y2={40} stroke={a} strokeWidth={2} />
      </G>
      <Ellipse cx={64} cy={54} rx={10} ry={5} fill={p.leaf} opacity={0.85} />
      <Ellipse cx={178} cy={54} rx={10} ry={5} fill={p.leaf2} opacity={0.85} />
      <Ground a={a} />
    </G>
  );
}

const SCENES = [GatewayScene, HomesScene, ClockTowerScene, ChaiStallScene, BazaarScene, FestivalScene] as const;

/** Postcard picture side: accent-tinted sky + the zone's landmark scene.
 *  `grayed` swaps the palette for gray tones (locked showroom zones). */
export function ZoneVista({
  zoneIndex,
  accent,
  grayed,
}: {
  zoneIndex: number;
  accent: string;
  grayed: boolean;
}) {
  const Scene = SCENES[zoneIndex] ?? GatewayScene;
  const a = grayed ? SCENERY_GRAY : accent;
  const p = grayed ? GRAYS : COLORS;
  return (
    <View style={styles.vista} pointerEvents="none">
      <LinearGradient
        colors={[`${a}2e`, `${a}0a`]}
        style={StyleSheet.absoluteFill}
      />
      {/* `meet` (not `slice`): the band is wider than the 240-unit scene, and
          slice-filling the width crops the top of tall landmarks (clock cap,
          awning, pennants). Centered at full height, gradient fills the sides. */}
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 240 56"
        preserveAspectRatio="xMidYMax meet"
      >
        <Scene a={a} p={p} />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// India-flavored dimensional trackside scenery (web Task 985 port): a FLAT
// set with depth cues. Every asset shows a front face plus a right-hand face
// in exactly ONE darker palette step (its shade tone), lit from a single
// shared upper-left light, standing on a soft ground-contact ellipse. Purely
// decorative: no tap targets, no motion, always visually subordinate to
// stations, postcards, the train, Bolo, and the rail comet.
//
// Grayscale note: the web grays locked showroom zones with a CSS
// `filter: grayscale(1)`; react-native has no such filter, so the same
// treatment swaps the fixed palette for gray tones plus a gray accent,
// matching how the vistas above handle it.
// ---------------------------------------------------------------------------

const INK = '#0f172a'; // ground shadows + wheel rubber (both palettes)

type SceneryPalette = {
  amber: string;
  amberShade: string;
  leaf: string;
  leafShade: string;
  trunk: string;
  trunkShade: string;
  slate: string;
  slateShade: string;
  pink: string;
  pinkShade: string;
  stone: string;
  stoneShade: string;
  river: string;
  headlight: string;
};

const SCENERY_COLORS: SceneryPalette = {
  amber: '#f59e0b',
  amberShade: '#b45309',
  leaf: '#10b981',
  leafShade: '#047857',
  trunk: '#92400e',
  trunkShade: '#713f12',
  slate: '#64748b',
  slateShade: '#475569',
  pink: '#ec4899',
  pinkShade: '#be185d',
  stone: '#e7e5e4',
  stoneShade: '#a8a29e',
  river: '#7dd3fc',
  headlight: '#fef9c3',
};

// Approximate grayscale of the palette above (luminance-matched by eye,
// shades one visible step darker than their base tone).
const SCENERY_GRAYS: SceneryPalette = {
  amber: '#b3b7bd',
  amberShade: '#8e939a',
  leaf: '#a2a7b0',
  leafShade: '#7d8288',
  trunk: '#7d8288',
  trunkShade: '#666b72',
  slate: '#9aa0ab',
  slateShade: '#7d838d',
  pink: '#adb1b9',
  pinkShade: '#8b9098',
  stone: '#d4d7dc',
  stoneShade: '#a5a9b0',
  river: '#c3c7cd',
  headlight: '#e5e7eb',
};

/** Shared ground-contact ellipse: every scenery element sits on one. The
 *  center shifts slightly right (down-light from upper-left), matching the
 *  web's --depth-shadow-* CSS tokens and DEPTH_2_5D in lib/motion.tsx. */
export const SCENERY_GROUND_SHADOW = { dx: 2, ryRatio: 0.24, opacity: 0.13 } as const;

function GroundShadow({ rx, cx = 0 }: { rx: number; cx?: number }) {
  return (
    <Ellipse
      cx={cx + SCENERY_GROUND_SHADOW.dx}
      cy={1.2}
      rx={rx}
      ry={Math.max(2.2, rx * SCENERY_GROUND_SHADOW.ryRatio)}
      fill={INK}
      opacity={SCENERY_GROUND_SHADOW.opacity}
    />
  );
}

/** Auto-rickshaw: green cabin, amber canopy, parked. */
function TukTuk({ p }: { p: SceneryPalette }) {
  return (
    <G>
      <GroundShadow rx={17} />
      {/* cabin side face (right, shaded) */}
      <Path d="M8 -3.2 l4.5 -1.4 v-14.4 l-4.5 -1.8 Z" fill={p.leafShade} />
      {/* cabin front face */}
      <Rect x={-13} y={-20.8} width={21} height={17.6} rx={2.5} fill={p.leaf} />
      {/* canopy front + side */}
      <Rect x={-15} y={-27} width={25} height={6.4} rx={2} fill={p.amber} />
      <Path d="M10 -26.6 l4 1.4 v4.6 l-4 -0.2 Z" fill={p.leafShade} />
      {/* windshield */}
      <Rect x={-10.5} y={-18.6} width={8} height={6.6} rx={1} fill="#ffffff" opacity={0.92} />
      {/* wheels: rear-right first so the front pair overlaps it */}
      <Circle cx={11} cy={-2.6} r={2.6} fill={p.slateShade} />
      <Circle cx={-6.5} cy={-1.8} r={3.2} fill={INK} opacity={0.8} />
      <Circle cx={5.5} cy={-1.8} r={3.2} fill={INK} opacity={0.8} />
      {/* headlight */}
      <Circle cx={-12.8} cy={-11.5} r={1.5} fill={p.headlight} />
    </G>
  );
}

/** Standing zebu cow: stone hide, shoulder hump, gentle horns. */
function CowStanding({ p }: { p: SceneryPalette }) {
  return (
    <G>
      <GroundShadow rx={15} />
      {/* legs (far pair sits in the shade tone) */}
      <Rect x={-6.2} y={-8} width={2.2} height={8} rx={1} fill={p.stoneShade} />
      <Rect x={5.2} y={-8} width={2.2} height={8} rx={1} fill={p.stoneShade} />
      <Rect x={-8.6} y={-8} width={2.2} height={8} rx={1} fill={p.stone} />
      <Rect x={2.8} y={-8} width={2.2} height={8} rx={1} fill={p.stone} />
      {/* body + zebu hump */}
      <Rect x={-10} y={-16.5} width={20.5} height={10} rx={4.5} fill={p.stone} />
      <Path d="M1 -16.2 q3.4 -3.6 6.8 0 Z" fill={p.stone} />
      {/* shaded hindquarter (right) */}
      <Path d="M4 -16.4 q6.6 0.4 6.5 5.2 q0 4.6 -5 4.7 Z" fill={p.stoneShade} />
      {/* tail */}
      <Path d="M10.4 -14.5 q3 1.5 2.4 7.5" stroke={p.stoneShade} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      {/* head, ear, horns, muzzle */}
      <Rect x={-16.5} y={-19} width={7.6} height={7} rx={2.8} fill={p.stone} />
      <Ellipse cx={-9.6} cy={-17.6} rx={2.4} ry={1.3} fill={p.stoneShade} />
      <Path d="M-15.8 -19.2 q-1.4 -3 1.2 -4.2 M-10.8 -19.2 q1.4 -3 -1.2 -4.2" stroke={p.trunkShade} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <Rect x={-16.5} y={-14} width={4.4} height={2} rx={1} fill={p.pink} opacity={0.55} />
    </G>
  );
}

/** Wooden fruit cart on one big wheel, mounded with produce. */
function FruitCart({ p }: { p: SceneryPalette }) {
  return (
    <G>
      <GroundShadow rx={16} />
      {/* handles */}
      <Path d="M-13 -9.6 l-6 2.4" stroke={p.trunk} strokeWidth={1.6} strokeLinecap="round" />
      {/* bed front + side */}
      <Rect x={-14} y={-12} width={24} height={5} rx={1} fill={p.trunk} />
      <Path d="M10 -7 l4 -1.6 v-4.4 l-4 -1 Z" fill={p.trunkShade} />
      {/* prop leg + wheel */}
      <Rect x={6.4} y={-7} width={2} height={7} rx={1} fill={p.trunkShade} />
      <Circle cx={-6} cy={-3.4} r={4} fill="none" stroke={p.trunkShade} strokeWidth={2} />
      <Circle cx={-6} cy={-3.4} r={1.1} fill={p.trunkShade} />
      {/* fruit mounds */}
      <Circle cx={-9} cy={-13.6} r={2.4} fill={p.amber} />
      <Circle cx={-4.2} cy={-14.4} r={2.4} fill={p.amber} />
      <Circle cx={-6.6} cy={-17.2} r={2.2} fill={p.amberShade} />
      <Circle cx={1.6} cy={-13.8} r={2.3} fill={p.leaf} />
      <Circle cx={6.4} cy={-13.4} r={2.2} fill={p.pink} />
      <Circle cx={4} cy={-16.4} r={2} fill={p.leaf} />
    </G>
  );
}

/** Chacha-ji's stall, MANNED. Web parity with journey-scenery.tsx's ChaiStall,
 *  same numbers: the structure is drawn in the map's flat vector language and
 *  Chacha-ji himself is the DELIVERED figure, chachaji.png, the same layer the
 *  home vignette composites. No new character art on either platform.
 *
 *  He stands out front of the counter at full height (24 x 32.3, his own
 *  386:520 aspect), so the structure is drawn tall enough for the awning rail
 *  to clear his head. Footprint 36 wide, 49.2 tall above the ground line,
 *  which SCENERY_HALF_W.chaiStall and STALL_PLACEMENT are sized against. */
function ChaiStallTrackside({ p }: { p: SceneryPalette }) {
  return (
    <G>
      {/* Shadow re-centered under the structure (web parity): the house
          shadow's +2 down-light offset pushed this landmark's bounding box
          into the trackside signal's glyph. */}
      <GroundShadow rx={16} cx={-3} />
      {/* posts */}
      <Rect x={-15.5} y={-44} width={2} height={44} fill={p.trunk} />
      <Rect x={11.5} y={-44} width={2} height={44} fill={p.trunk} />
      {/* counter front + side */}
      <Rect x={-14} y={-18} width={26} height={14} rx={1} fill={p.trunk} />
      <Path d="M12 -4 l3.5 -1.5 v-11.4 l-3.5 -0.6 Z" fill={p.amberShade} />
      {/* counter skirt panel */}
      <Rect x={-12} y={-16} width={22} height={7} rx={1} fill={p.amber} opacity={0.35} />
      {/* striped awning front + side */}
      {[0, 1, 2, 3].map((i) => (
        <Rect key={i} x={-17 + i * 7} y={-48} width={7} height={7} fill={i % 2 === 0 ? p.amber : '#ffffff'} />
      ))}
      <Path d="M11 -48 l3.5 1.3 v5.7 h-3.5 Z" fill={p.amberShade} />
      <Rect x={-17.5} y={-49.2} width={31.5} height={1.7} rx={0.85} fill={p.amberShade} />
      {/* kettle + glass on the counter top, to his right */}
      <Circle cx={9} cy={-21.4} r={3.2} fill={p.slate} />
      <Rect x={4.4} y={-22.6} width={2.4} height={1.8} rx={0.9} fill={p.slate} />
      <Rect x={0.4} y={-21.6} width={3.2} height={3.6} rx={0.9} fill="#ffffff" opacity={0.95} />
      {/* Chacha-ji himself, drawn last so he stands in front of his counter */}
      <SvgImage
        testID="chacha-stall-figure"
        href={CHACHAJI_ART}
        x={-17}
        y={-32.3}
        width={24}
        height={32.3}
        preserveAspectRatio="xMidYMax meet"
      />
      {/* Roadside signpost, same idea as the one on the home stall card: the
          stall needs to read as somewhere you can GO, not just scenery. Board
          leans slightly and its arrow points back at the counter. Drawn last so
          it sits in front of everything. */}
      <G testID="chacha-stall-sign">
        {/* Scaled up from the first pass: at sprite size the original board was
            a smudge. Now it reads as a sign from a thumb's distance. */}
        <Rect x={22.4} y={-20} width={2.8} height={20} fill={p.trunkShade} />
        <Rect x={19.4} y={-22.4} width={9} height={2.4} rx={1.2} fill={p.trunkShade} />
        <G transform="rotate(-5 26 -28)">
          <Rect x={16.5} y={-33} width={20} height={11} rx={1.6} fill={p.trunkShade} />
          <Rect x={17.7} y={-31.8} width={17.6} height={8.6} rx={1.1} fill={p.amber} />
          {/* left-pointing arrow, back toward the counter */}
          <Path d="M21 -27.5 l4 -3 v6 Z" fill={p.trunkShade} />
          <Rect x={25.5} y={-28.5} width={8} height={2} rx={1} fill={p.trunkShade} />
        </G>
      </G>
    </G>
  );
}

/** Roadside temple: curved shikhara over a small sanctum, accent pennant. */
function TempleSilhouette({ p, accent }: { p: SceneryPalette; accent: string }) {
  return (
    <G>
      <GroundShadow rx={14} />
      {/* sanctum front + side */}
      <Rect x={-11} y={-8.5} width={19} height={8.5} fill={p.amber} />
      <Path d="M8 0 l4 -1.6 v-6.2 l-4 -0.7 Z" fill={p.amberShade} />
      {/* shikhara tower, right half shaded */}
      <Path d="M-7 -8.5 Q-5 -24 0 -26.5 Q5 -24 7 -8.5 Z" fill={p.amber} />
      <Path d="M0 -26.5 Q5 -24 7 -8.5 L0 -8.5 Z" fill={p.amberShade} />
      {/* amalaka + mast + pennant */}
      <Circle cx={0} cy={-27.5} r={1.5} fill={p.amberShade} />
      <Line x1={0} y1={-29} x2={0} y2={-33.5} stroke={p.trunkShade} strokeWidth={1.1} />
      <Path d="M0 -33.5 l5.5 1.9 -5.5 1.9 Z" fill={accent} />
      {/* doorway */}
      <Path d="M-4.6 0 v-4.6 q2.3 -2.2 4.6 0 V0 Z" fill={p.trunk} />
    </G>
  );
}

/** Banyan tree: broad canopy with a shaded right lobe and prop roots. */
function BanyanTree({ p }: { p: SceneryPalette }) {
  return (
    <G>
      <GroundShadow rx={14} />
      {/* prop roots + trunk */}
      <Rect x={-7.4} y={-9} width={1.8} height={9} rx={0.9} fill={p.trunk} opacity={0.85} />
      <Rect x={5.6} y={-8} width={1.8} height={8} rx={0.9} fill={p.trunk} opacity={0.85} />
      <Path d="M-2.6 0 h5.2 l1.2 -12.5 h-7.6 Z" fill={p.trunk} />
      {/* canopy: main mass + shaded right lobe */}
      <Ellipse cx={-2.5} cy={-19} rx={13} ry={8} fill={p.leaf} />
      <Ellipse cx={7} cy={-16} rx={8.5} ry={5.8} fill={p.leafShade} />
      {/* hanging aerial root */}
      <Line x1={9.5} y1={-12} x2={9.5} y2={-5.5} stroke={p.trunk} strokeWidth={1.2} opacity={0.8} />
    </G>
  );
}

/** String of marigolds (toran) sagging between two posts. */
function MarigoldString({ p }: { p: SceneryPalette }) {
  const blooms = [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9];
  const x1 = -15;
  const x2 = 15;
  const yTop = -15;
  const at = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * 0 + t * t * x2,
      y: mt * mt * yTop + 2 * mt * t * (yTop + 9) + t * t * yTop,
    };
  };
  return (
    <G>
      <GroundShadow rx={4} cx={x1 + 1} />
      <GroundShadow rx={4} cx={x2 + 1} />
      {/* left post lit, right post in the shade tone (upper-left light) */}
      <Rect x={x1 - 1} y={yTop} width={2.2} height={15} rx={1} fill={p.trunk} />
      <Rect x={x2 - 1} y={yTop} width={2.2} height={15} rx={1} fill={p.trunkShade} />
      <Path d={`M${x1} ${yTop} Q0 ${yTop + 9 * 2} ${x2} ${yTop}`} fill="none" stroke={p.slate} strokeWidth={1} opacity={0.7} />
      {blooms.map((t, i) => {
        const pt = at(t);
        return <Circle key={t} cx={pt.x} cy={pt.y + 1.6} r={2.1} fill={i % 2 === 0 ? p.amber : p.pink} />;
      })}
    </G>
  );
}

/** Cycle rickshaw: two spoked wheels, pink folding canopy, parked. */
function CycleRickshaw({ p }: { p: SceneryPalette }) {
  return (
    <G>
      <GroundShadow rx={15} />
      {/* wheels */}
      <Circle cx={-9} cy={-4.2} r={4.4} fill="none" stroke={p.slateShade} strokeWidth={1.6} />
      <Circle cx={7.5} cy={-4.2} r={4.4} fill="none" stroke={p.slateShade} strokeWidth={1.6} />
      <Circle cx={-9} cy={-4.2} r={1} fill={p.slateShade} />
      <Circle cx={7.5} cy={-4.2} r={1} fill={p.slateShade} />
      {/* frame + handlebar + saddle */}
      <Path d="M-9 -4.2 L-3.5 -10 L2 -4.2" stroke={p.slateShade} strokeWidth={1.4} fill="none" />
      <Path d="M-13.5 -11.5 l3 1.8" stroke={p.slateShade} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={-5.6} y={-12} width={4} height={1.8} rx={0.9} fill={p.slateShade} />
      {/* passenger bench front + canopy (right half shaded) */}
      <Rect x={2} y={-12.5} width={12} height={8.5} rx={2} fill={p.pink} />
      <Path d="M14 -4 l2.5 -1.2 v-6 l-2.5 -1.3 Z" fill={p.pinkShade} />
      <Path d="M2 -13 Q8 -21.5 15 -13 Z" fill={p.pink} />
      <Path d="M8.5 -17.6 Q12.5 -16.6 15 -13 L8.5 -13 Z" fill={p.pinkShade} />
    </G>
  );
}

/** River ghat: stone steps down to the water with a small wooden boat and a
 *  chhatri crowning the top step, the Varanasi-approach finale. */
function RiverGhat({ p, accent }: { p: SceneryPalette; accent: string }) {
  return (
    <G>
      <GroundShadow rx={19} />
      {/* water + ripple */}
      <Rect x={-21} y={-2.6} width={17} height={2.6} rx={1.2} fill={p.river} opacity={0.75} />
      <Path d="M-18 -1.2 q2 -1 4 0 q2 1 4 0" stroke="#ffffff" strokeWidth={0.8} fill="none" opacity={0.7} />
      {/* boat */}
      <Path d="M-19 -3.4 h8.5 q-1.4 2.8 -4.2 2.8 q-2.9 0 -4.3 -2.8 Z" fill={p.trunk} />
      {/* steps rising rightward, right slab shaded */}
      <Path d="M-4 0 v-2.7 h5 v-2.7 h5 v-2.7 h5 v-2.7 h5 V0 Z" fill={p.slate} opacity={0.9} />
      <Rect x={13} y={-10.8} width={3} height={10.8} fill={p.slateShade} />
      {/* chhatri on the top step */}
      <Line x1={11} y1={-10.8} x2={11} y2={-14.6} stroke={p.slateShade} strokeWidth={1.1} />
      <Path d="M7.6 -14.6 q3.4 -3 6.8 0 Z" fill={accent} />
    </G>
  );
}

export type SceneryKind =
  | 'tuktuk'
  | 'cow'
  | 'fruitCart'
  | 'chaiStall'
  | 'temple'
  | 'banyan'
  | 'marigolds'
  | 'cycleRickshaw'
  | 'ghat';

const SCENERY_ASSETS: Record<
  SceneryKind,
  (args: { p: SceneryPalette; accent: string }) => React.ReactElement
> = {
  tuktuk: ({ p }) => <TukTuk p={p} />,
  cow: ({ p }) => <CowStanding p={p} />,
  fruitCart: ({ p }) => <FruitCart p={p} />,
  chaiStall: ({ p }) => <ChaiStallTrackside p={p} />,
  temple: ({ p, accent }) => <TempleSilhouette p={p} accent={accent} />,
  banyan: ({ p }) => <BanyanTree p={p} />,
  marigolds: ({ p }) => <MarigoldString p={p} />,
  cycleRickshaw: ({ p }) => <CycleRickshaw p={p} />,
  ghat: ({ p, accent }) => <RiverGhat p={p} accent={accent} />,
};

/** Approximate half-width of each asset (SVG px, including its ground
 *  shadow), used by placement geometry tests to prove no overlap with
 *  station markers, cards, postcards, or the rail at supported widths. */
export const SCENERY_HALF_W: Record<SceneryKind, number> = {
  tuktuk: 19,
  cow: 17,
  fruitCart: 20,
  chaiStall: 18,
  temple: 16,
  banyan: 16,
  marigolds: 19,
  cycleRickshaw: 18,
  ghat: 21,
};

/** Tallest asset extent above its ground line (SVG px, the temple's pennant
 *  mast), used by placement tests to prove scenery stays inside its station
 *  row band and never bleeds into postcard rows. */
export const SCENERY_MAX_H = 40;

/** Placement anchors relative to the serpentine geometry: scenery centers in
 *  the free strip beside a station row (same side as the marker, opposite
 *  its card), at the same edge inset and ground line the old doodads used,
 *  so future layout changes move scenery together with the stations. */
export const SCENERY_PLACEMENT = {
  /** Distance from the map edge to a scenery element's center x. */
  edgeX: 42,
  /** Ground line offset below a station row's center y. */
  groundDy: 22,
} as const;

/** Chacha-ji's stall is a LANDMARK, not decoration: it marks every encounter
 *  station so the learner sees him coming, and it stands on the RIGHT of the
 *  track in that station's HALT ROW (`SERPENTINE.HALT_H`), the scenery-only
 *  row the map inserts after every encounter stop. Both platforms use these
 *  numbers, and both seat the stall off the halt point, never off the station:
 *
 *  - The halt keeps the rail on the encounter station's own flank (always the
 *    LEFT, since encounter stations are odd stops and so even-indexed), which
 *    is what frees the right side of the row.
 *  - `laneDx` is measured RIGHT from the rail at the halt point. The rail
 *    sweeps back out toward the next station across the lower half of the
 *    row, so the lane has to clear that sweep, not just the halt point.
 *  - `groundDy` centers the stall in the halt row, clear of the encounter
 *    station's card above it and the next row's card below it.
 *
 *  RENDERING IS NOT TRIGGERING: this is scenery in the pointer-events-none
 *  layer. The gift, the phrase and the offer still fire only on arrival.
 */
export const STALL_PLACEMENT = {
  /** Center x of the stall lane, measured RIGHT from the rail at the halt
   *  point. The stall spans -19..+15.5 around its center, so this puts it at
   *  x 153..187.5 on a full-width map: 18px clear of the rail at the stall's
   *  lowest point (where the sweep toward the next station has carried the
   *  track furthest right), and further clear at every point above that. */
  laneDx: 80,
  /** Center x of the stall lane measured LEFT from the marker, used since the
   *  halt row was retired on 2026-08-26.
   *
   *  THE STALL MOVED SIDES, and that is what let the row go. Encounter stations
   *  are always on the LEFT flank, so the station card sits to their RIGHT: the
   *  old lane put the stall on the same side as the card, which is exactly why
   *  it needed a row of its own and why HALT_H had to grow from 74 to 96 when a
   *  card's second line reached it. The left of a left-flank marker is empty.
   *
   *  46 is the middle of the space that is actually free. The stall spans
   *  -19..+15.5 around its center, the map's left edge is 0 and the rail's left
   *  edge at LEFT_X 92 is about 84.5, so the center has to sit between 24 and
   *  69. 46 puts the stall at x 27..61.5: 27 clear of the map edge and 23 clear
   *  of the rail. */
  laneDxLeft: 46,
  /** Ground line offset below the HALT POINT (the halt row's center y). The
   *  stall stands 49.2 above its ground line and its shadow pools 5.1 below
   *  it, so this centers the whole landmark in the halt row at
   *  y-27.2..y+27.1, with room to spare at each end. HALT_H went 74 to 96 on
   *  2026-08-25, taking that clearance from about 10px to about 21px,
   *  because a neighbouring card's second line was reaching the stall. */
  groundDy: 22,
  /** How far the stall reaches ABOVE its ground line (the awning rail), so
   *  the geometry tests can prove the whole landmark, not just its footprint,
   *  stays inside the gap. */
  extentH: 49.2,
  /** How far the ground shadow pools BELOW that line (cy 1.2 + ry 3.84). It is
   *  part of the drawing, so it is part of the clearance budget. */
  shadowH: 5.1,
} as const;

/** The stations Chacha-ji's stall stands at, 1-based on the flattened global
 *  station list. Pure and deterministic, and it reads the interval off the
 *  same predicate the arrival check uses, so the landmark can never drift
 *  from the stop that actually pays. */
export function planChachaStalls(totalStations: number): number[] {
  const out: number[] = [];
  for (let station = 1; station <= totalStations; station += 1) {
    if (isChachaEncounterStation(station)) out.push(station);
  }
  return out;
}

/** Zone themes progress Delhi-urban toward Varanasi-riverine: early zones
 *  urban-weighted, middle zones market-and-town, final zones river-and-temple.
 *  Keyed by zone INDEX (fixed across all 22 lines). */
export const ZONE_SCENERY_THEMES: readonly (readonly SceneryKind[])[] = [
  ['tuktuk', 'fruitCart', 'banyan'],
  ['cycleRickshaw', 'tuktuk', 'marigolds'],
  ['fruitCart', 'cow', 'marigolds'],
  ['cow', 'fruitCart', 'cycleRickshaw'],
  ['temple', 'banyan', 'marigolds'],
  ['ghat', 'temple', 'marigolds'],
];

/** Deterministic per-zone plan: 1-3 elements depending on how many stations
 *  the zone has, spread evenly across its station rows (`row` is the 0-based
 *  station index within the zone). Pure function of the zone layout, no
 *  per-render randomness, so screenshots and tests are stable. */
export function planZoneScenery(
  zoneIndex: number,
  stationCount: number,
): { kind: SceneryKind; row: number }[] {
  if (stationCount <= 0) return [];
  const theme = ZONE_SCENERY_THEMES[Math.min(zoneIndex, ZONE_SCENERY_THEMES.length - 1)]!;
  const count = Math.max(1, Math.min(3, Math.floor(stationCount / 3)));
  const plan = Array.from({ length: count }, (_, i) => ({
    kind: theme[i % theme.length]!,
    row: Math.min(stationCount - 1, Math.floor(((i + 0.5) * stationCount) / count)),
  }));
  // A COW IN EVERY ZONE (owner ruling, Aug 18 2026). The themes carry the
  // Delhi-urban to Varanasi-riverine progression and only zones 3 and 4 had a
  // cow in them, so most of the line had none. Substituted into the LAST slot
  // rather than appended, so counts, rows and the rail-clearance geometry are
  // untouched and the zone's primary character survives. Web says the same.
  if (!plan.some((p) => p.kind === 'cow')) {
    plan[plan.length - 1] = { ...plan[plan.length - 1]!, kind: 'cow' };
  }
  return plan;
}

/** One placed scenery element (rendered inside a map SVG block, anchored at
 *  ground level, drawing upward from y=0). Locked showroom zones gray out
 *  via the palette swap, matching the postcards. */
export function SceneryElement({
  kind,
  x,
  y,
  accent,
  gray,
  testID,
}: {
  kind: SceneryKind;
  x: number;
  y: number;
  accent: string;
  gray: boolean;
  /** Overrides the generic scenery test id for placed landmarks (the
   *  Chacha-ji stall), which tests locate by station. */
  testID?: string;
}) {
  const p = gray ? SCENERY_GRAYS : SCENERY_COLORS;
  return (
    <G testID={testID ?? 'scenery-item'} transform={`translate(${x} ${y})`} opacity={gray ? 0.45 : 0.95}>
      {SCENERY_ASSETS[kind]({ p, accent: gray ? SCENERY_GRAY : accent })}
    </G>
  );
}

/** Festival bunting strung across the map above the terminus. */
export function Bunting({ x1, x2, y, accent }: { x1: number; x2: number; y: number; accent: string }) {
  const colors = [accent, COLORS.amber, COLORS.leaf, COLORS.indigo, COLORS.pink];
  const cx = (x1 + x2) / 2;
  const sag = 14;
  const flags = [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88];
  const at = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
      y: mt * mt * y + 2 * mt * t * (y + sag * 2) + t * t * y,
    };
  };
  return (
    <G>
      <Path d={`M${x1} ${y} Q${cx} ${y + sag * 2} ${x2} ${y}`} fill="none" stroke={COLORS.slate} strokeWidth={1.2} opacity={0.7} />
      {flags.map((t, i) => {
        const p = at(t);
        return (
          <Path
            key={t}
            d={`M${p.x - 4} ${p.y} L${p.x + 4} ${p.y} L${p.x} ${p.y + 9} Z`}
            fill={colors[i % colors.length]}
            opacity={0.9}
          />
        );
      })}
    </G>
  );
}

const styles = StyleSheet.create({
  vista: {
    height: 56,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
});
