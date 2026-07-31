// Characterful side-profile steam engine — a react-native-svg port of the web
// component (gujarati-coach/src/components/train-svg.tsx). Multi-color brand
// character (indigo body, teal trim, slate chassis) with spoked wheels and
// steam puffs, matching the web art exactly. Faces right — the direction of
// travel down the line.
//
// Motion (web parity, same keyframe fractions as index.css):
// - motion="drive": home-ticket drive-and-settle on a 4s cycle — the engine
//   noses forward 7px, recoils −1.5px, settles; wheels roll through the
//   drive; steam puffs pop at the settle.
// - motion="bob": journey rail-marker bounce on a 2.2s cycle with the same
//   wheel roll + steam.
// - motion="none" (default): parked engine, clean static frame.
// Reduced motion collapses every variant to the parked frame (steam rests at
// opacity 0, wheels at 0deg, wrapper at identity).
//
// SIZING: `width`/`height` describe the ENGINE BODY box (64×42 aspect), so
// existing call sites keep their layout. The Svg itself is absolutely
// positioned with numeric dimensions (TicketParts sizing contract: nothing
// percentage-sized, absolute children can never grow the card) and carries
// 14 viewBox units of steam headroom above the body, drawn upward out of the
// layout box — RN views don't clip children, matching the web svg's
// `overflow: visible`.
import React from 'react';
import { View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { useLoopProgress } from '@/lib/useLoopProgress';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const BODY_W = 64;
const BODY_H = 42;
const STEAM_HEADROOM = 14; // viewBox units above y=0 for the rising puffs
const VIEW_H = BODY_H + STEAM_HEADROOM;

// Web cycle constants (index.css --train-drive-cycle / --station-bounce-cycle).
const DRIVE_CYCLE_MS = 4000;
const BOB_CYCLE_MS = 2200;
// Web steam delays: puffs 2/3 lag 0.16s/0.3s behind puff 1.
const STEAM_DELAYS_S = [0, 0.16, 0.3] as const;

export type TrainMotion = 'drive' | 'bob' | 'none';

/** One spoked wheel; rotates about its own center while the train moves
 *  (web: .train-wheel + train-wheel-spin keyframes). */
function Wheel({
  cx,
  cy,
  r,
  spokeW,
  spokeL,
  hubR,
  dotR,
  chassis,
  progress,
  animated,
}: {
  cx: number;
  cy: number;
  r: number;
  spokeW: number;
  spokeL: number;
  hubR: number;
  dotR: number;
  chassis: string;
  progress: ReturnType<typeof useLoopProgress>;
  animated: boolean;
}) {
  const animatedProps = useAnimatedProps(() => ({
    rotation: animated
      ? interpolate(progress.value, [0, 0.48, 0.84, 1], [0, 0, 290, 360])
      : 0,
  }));
  return (
    <AnimatedG origin={`${cx}, ${cy}`} animatedProps={animatedProps}>
      <Circle cx={cx} cy={cy} r={r} fill={chassis} />
      <Rect
        x={cx - spokeW / 2}
        y={cy - spokeL / 2}
        width={spokeW}
        height={spokeL}
        rx={spokeW / 2}
        fill="white"
        opacity={0.7}
      />
      <Rect
        x={cx - spokeL / 2}
        y={cy - spokeW / 2}
        width={spokeL}
        height={spokeW}
        rx={spokeW / 2}
        fill="white"
        opacity={0.7}
      />
      <Circle cx={cx} cy={cy} r={hubR} fill="white" opacity={0.9} />
      <Circle cx={cx} cy={cy} r={dotR} fill={chassis} />
    </AnimatedG>
  );
}

/** One steam puff: invisible at rest, pops at the cycle's settle, rising and
 *  fading (web: .train-steam + train-steam-puff keyframes). */
function SteamPuff({
  cx,
  cy,
  r,
  delayFrac,
  fill,
  progress,
  animated,
}: {
  cx: number;
  cy: number;
  r: number;
  delayFrac: number;
  fill: string;
  progress: ReturnType<typeof useLoopProgress>;
  animated: boolean;
}) {
  const animatedProps = useAnimatedProps(() => {
    if (!animated) return { opacity: 0, cy, r: r * 0.6 };
    const p = (progress.value - delayFrac + 1) % 1;
    return {
      opacity: interpolate(p, [0, 0.64, 0.78, 1], [0, 0, 0.9, 0]),
      cy: cy + interpolate(p, [0, 0.64, 1], [0, 0, -11]),
      r: r * interpolate(p, [0, 0.64, 1], [0.6, 0.6, 1.15]),
    };
  });
  return <AnimatedCircle cx={cx} animatedProps={animatedProps} fill={fill} />;
}

export function TrainEngine({
  tint,
  width = 64,
  height = 42,
  motion = 'none',
}: {
  /** Headlamp tint — the one surface-tinted part (web: currentColor).
   *  White on the accent ticket, line accent inside the marker pill. */
  tint: string;
  width?: number;
  height?: number;
  motion?: TrainMotion;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const animated = motion !== 'none' && !reduceMotion;
  const cycleMs = motion === 'bob' ? BOB_CYCLE_MS : DRIVE_CYCLE_MS;
  const progress = useLoopProgress(cycleMs, animated);

  // Whole-engine travel: drive-and-settle (home ticket) or bob (rail
  // marker). Transform-only — never layout props (Expo Go New Arch crash).
  const wrapperStyle = useAnimatedStyle(() => {
    if (!animated) return { transform: [{ translateX: 0 }, { translateY: 0 }] };
    if (motion === 'drive') {
      return {
        transform: [
          {
            translateX: interpolate(
              progress.value,
              [0, 0.5, 0.68, 0.84, 1],
              [0, 0, 7, -1.5, 0],
            ),
          },
          { translateY: 0 },
        ],
      };
    }
    return {
      transform: [
        { translateX: 0 },
        {
          translateY: interpolate(
            progress.value,
            [0, 0.45, 0.55, 0.65, 0.75, 0.85, 1],
            [0, 0, -4, 1.5, -1.8, 0.5, 0],
          ),
        },
      ],
    };
  });

  const svgH = (height * VIEW_H) / BODY_H;
  const steam = colors.cardBorder;
  const chassis = colors.foreground;
  const body = colors.primary;
  const trim = colors.secondary;
  const steamDelayFracs = STEAM_DELAYS_S.map((d) => (d * 1000) / cycleMs);

  return (
    <Animated.View
      testID="train-engine"
      pointerEvents="none"
      style={[{ width, height, position: 'relative' }, wrapperStyle]}
    >
      {/* Absolute + numeric size per the TicketParts sizing contract; the
          steam headroom hangs above the layout box (RN doesn't clip). */}
      <Svg
        viewBox={`0 -${STEAM_HEADROOM} ${BODY_W} ${VIEW_H}`}
        width={width}
        height={svgH}
        fill="none"
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      >
        {/* steam puffs above the funnel (rest state: invisible) */}
        <SteamPuff cx={45} cy={1.5} r={2.6} delayFrac={steamDelayFracs[0]!} fill={steam} progress={progress} animated={animated} />
        <SteamPuff cx={48.2} cy={-0.8} r={2} delayFrac={steamDelayFracs[1]!} fill={steam} progress={progress} animated={animated} />
        <SteamPuff cx={42.4} cy={-0.2} r={1.6} delayFrac={steamDelayFracs[2]!} fill={steam} progress={progress} animated={animated} />
        {/* cab roof */}
        <Rect x={0} y={4} width={21} height={4.5} rx={2.25} fill={chassis} />
        {/* cab body */}
        <Rect x={2} y={7.5} width={17} height={21} rx={2} fill={body} />
        {/* cab window */}
        <Rect x={5} y={11} width={11} height={8} rx={2} fill="white" opacity={0.95} />
        {/* boiler */}
        <Rect x={17} y={14} width={33} height={14.5} rx={7} fill={body} />
        {/* boiler bands */}
        <Rect x={25} y={14.5} width={2} height={13.5} fill="white" opacity={0.22} />
        <Rect x={35} y={14.5} width={2} height={13.5} fill="white" opacity={0.22} />
        {/* smokebox front */}
        <Rect x={45} y={12.5} width={9.5} height={16} rx={3.5} fill={chassis} />
        {/* funnel (flared) with teal lip */}
        <Path d="M40.5 6.5h9l-1.6 7h-5.8z" fill={chassis} />
        <Rect x={39.5} y={4.5} width={11} height={3} rx={1.5} fill={trim} />
        {/* steam dome */}
        <Path d="M27 14v-3.2a4 4 0 0 1 8 0V14z" fill={trim} />
        {/* friendly eye on the smokebox */}
        <Circle cx={50.5} cy={17.5} r={2.6} fill="white" opacity={0.95} />
        <Circle cx={51.3} cy={17.9} r={1.2} fill={chassis} />
        {/* headlamp (tinted by the surface) */}
        <Rect x={54} y={18.5} width={2.5} height={4} rx={1} fill={tint} />
        {/* running board */}
        <Rect x={1} y={28.5} width={56} height={3} rx={1.5} fill={chassis} />
        {/* cowcatcher */}
        <Path d="M56 28.5 63.5 36H56z" fill={trim} />
        {/* spoked wheels (rotate while driving/bobbing) */}
        <Wheel cx={11} cy={35.5} r={5.5} spokeW={1.2} spokeL={9.2} hubR={2.2} dotR={0.9} chassis={chassis} progress={progress} animated={animated} />
        <Wheel cx={26} cy={35.5} r={5.5} spokeW={1.2} spokeL={9.2} hubR={2.2} dotR={0.9} chassis={chassis} progress={progress} animated={animated} />
        <Wheel cx={40} cy={35.5} r={5.5} spokeW={1.2} spokeL={9.2} hubR={2.2} dotR={0.9} chassis={chassis} progress={progress} animated={animated} />
        <Wheel cx={51.5} cy={36.5} r={4.5} spokeW={1.1} spokeL={7.6} hubR={1.8} dotR={0.8} chassis={chassis} progress={progress} animated={animated} />
        {/* coupling rod */}
        <Rect x={9} y={34.5} width={33} height={2} rx={1} fill="white" opacity={0.55} />
      </Svg>
    </Animated.View>
  );
}
