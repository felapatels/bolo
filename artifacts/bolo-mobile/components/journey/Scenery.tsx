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
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

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

/** Small trackside scene beside a station row (rendered inside a map SVG
 *  block, anchored at ground level — draws upward from y=0). Variant cycles
 *  with the global station index. */
export function TracksideDoodad({
  variant,
  x,
  y,
  accent,
  gray,
}: {
  variant: number;
  x: number;
  y: number;
  accent: string;
  gray: boolean;
}) {
  const v = ((variant % 6) + 6) % 6;
  const p = gray ? GRAYS : COLORS;
  const a = gray ? SCENERY_GRAY : accent;
  let art: React.ReactNode;
  if (v === 0) {
    // shade tree
    art = (
      <G>
        <Rect x={-2} y={-14} width={4} height={14} rx={1} fill={p.trunk} />
        <Circle cx={0} cy={-20} r={9} fill={p.leaf} />
        <Circle cx={7} cy={-15} r={6} fill={p.leaf2} opacity={0.9} />
        <Circle cx={-7} cy={-15} r={5.5} fill={p.leaf2} opacity={0.8} />
      </G>
    );
  } else if (v === 1) {
    // drifting cloud + birds
    art = (
      <G>
        <Cloud x={0} y={-26} fill={p.cloud} o={0.8} />
        <Birds x={-10} y={-11} p={p} />
      </G>
    );
  } else if (v === 2) {
    // railway signal
    art = (
      <G>
        <Rect x={-1.5} y={-26} width={3} height={26} fill={p.slate} />
        <Rect x={-5} y={-38} width={10} height={14} rx={2} fill={p.dark} />
        <Circle cx={0} cy={-34} r={2.6} fill={p.signalRed} />
        <Circle cx={0} cy={-28} r={2.6} fill={p.signalGreen} />
      </G>
    );
  } else if (v === 3) {
    // bushes + accent milestone
    art = (
      <G>
        <Ellipse cx={-8} cy={-4} rx={8} ry={5} fill={p.leaf} />
        <Ellipse cx={3} cy={-3} rx={6} ry={4} fill={p.leaf2} />
        <Rect x={10} y={-11} width={9} height={11} rx={2.5} fill="#ffffff" stroke={p.slate} strokeWidth={1} />
        <Rect x={10} y={-11} width={9} height={5} rx={2.5} fill={a} />
      </G>
    );
  } else if (v === 4) {
    // wayside hut
    art = (
      <G>
        <Rect x={-10} y={-14} width={20} height={14} fill={p.amber} opacity={0.8} />
        <Path d="M-13 -14 h26 l-13 -9 Z" fill={p.trunk} />
        <Rect x={-3} y={-8} width={6} height={8} fill={p.door} />
      </G>
    );
  } else {
    // telegraph pole with drooping wires
    art = (
      <G>
        <Rect x={-1.5} y={-30} width={3} height={30} fill={p.trunk} opacity={0.85} />
        <Rect x={-8} y={-28} width={16} height={2.5} rx={1} fill={p.trunk} opacity={0.85} />
        <Rect x={-6} y={-23} width={12} height={2.5} rx={1} fill={p.trunk} opacity={0.85} />
        <G stroke={p.slate} strokeWidth={1} fill="none" opacity={0.6}>
          <Path d="M-8 -27 q-8 6 -14 7" />
          <Path d="M8 -27 q8 6 14 7" />
        </G>
      </G>
    );
  }
  return (
    <G transform={`translate(${x} ${y})`} opacity={gray ? 0.45 : 1}>
      {art}
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
