/**
 * Miniature looping preview vignettes for the games hub cards - the
 * react-native-reanimated port of the web hub's game-previews.css (#968 +
 * #986 web parity, mobile item #990).
 *
 * Every vignette is driven by ONE sawtooth clock (0..1 over its cycle) and
 * each element samples that clock at the web CSS keyframe percentages via
 * interpolate/interpolateColor. The web file's rules carry over:
 *
 *  - Base/settled frames: the paused frame (clock t) is a meaningful pose -
 *    matched tiles lit, picked chip highlighted, tiles in order, a mostly
 *    full timer ring, the right quiz answer lit with its sparkle. Web
 *    authors these as the CSS base styles; here they are the 0% keyframe
 *    values, so a paused clock pinned to t renders exactly that frame.
 *  - Loop pacing: each cycle holds a quiet settled pose for a good chunk of
 *    its duration so the hub feels ambient, not frantic.
 *  - Phase stagger: the grid staggers cycle phases per card (web: negative
 *    animation-delay) so the five previews never pulse in unison. Mobile
 *    passes the same offset as a 0..1 `phase` fraction sampled additively.
 *  - Energy model (task 986): vignettes idle at a slow ambient tempo
 *    (2.2x duration) and wake to full energy while the card is pressed
 *    (mobile has no hover). Switching tempo restarts the loop; on these
 *    abstract shapes the snap reads as the vignette waking up.
 *  - Locked cards do not idle: they hold a static mid-cycle frame (their
 *    phase offset) and play only while pressed - look-but-locked.
 *  - Off-screen cards pause entirely (FlatList viewability feeds `playing`,
 *    the mobile stand-in for the web IntersectionObserver).
 *  - Reduced motion: the parent passes playing=false with phase 0, so every
 *    vignette renders its authored settled base frame, perfectly still.
 *
 * Deliberate port simplification: CSS applies ease-in-out per keyframe
 * segment; this port runs a linear clock with linear segment interpolation.
 * At these sizes (sub-52px shapes) the difference is imperceptible.
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Cycle lengths at full energy (tempo 1), straight from game-previews.css. */
const CYCLE_MS: Record<string, number> = {
  'word-match': 4800,
  'listen-and-pick': 4800,
  'phrase-builder': 5200,
  'speed-round': 3800,
  'bolo-quiz': 5400,
};

export type GamePreviewProps = {
  gameId: string;
  /** Grid position; staggers the loop phase by 1.1s per card (web parity). */
  index: number;
  /** False pauses the loop (off-screen, locked-idle, reduced motion). */
  playing: boolean;
  /** Duration multiplier: 2.2 ambient idle, 1 full energy (pressed). */
  tempo: number;
  /**
   * While paused, hold the card's mid-cycle phase frame (web gv--locked)
   * instead of the authored settled base frame (reduced motion, off-screen).
   */
  holdMidCycle?: boolean;
  /** Rendered when the game has no vignette (defensive; all current do). */
  fallback?: React.ReactNode;
};

type Clock = {
  progress: SharedValue<number>;
  playing: SharedValue<number>;
  phase: SharedValue<number>;
  staticT: SharedValue<number>;
};

/** Worklet: where this element's loop is right now (0..1). */
function clockT(clock: Clock, extraShift = 0): number {
  'worklet';
  if (clock.playing.value === 0) {
    return (clock.staticT.value - extraShift + 2) % 1;
  }
  return (clock.progress.value + clock.phase.value - extraShift + 2) % 1;
}

function useVignetteClock(
  cycleMs: number,
  { playing, tempo, phase, staticT }: { playing: boolean; tempo: number; phase: number; staticT: number },
): Clock {
  const progress = useSharedValue(0);
  const playingSV = useSharedValue(playing ? 1 : 0);
  const phaseSV = useSharedValue(phase);
  const staticSV = useSharedValue(staticT);

  React.useEffect(() => {
    phaseSV.value = phase % 1;
    staticSV.value = staticT % 1;
    playingSV.value = playing ? 1 : 0;
    cancelAnimation(progress);
    progress.value = 0;
    if (playing) {
      progress.value = withRepeat(
        withTiming(1, { duration: cycleMs * tempo, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => {
      cancelAnimation(progress);
    };
  }, [playing, tempo, cycleMs, phase, staticT, progress, playingSV, phaseSV, staticSV]);

  return { progress, playing: playingSV, phase: phaseSV, staticT: staticSV };
}

type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  /** muted-foreground at the web's 0.3–0.45 dim alphas. */
  dim30: string;
  dim40: string;
  dim45: string;
  dim25: string;
};

function usePalette(): Palette {
  const colors = useColors();
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    dim25: `${colors.mutedForeground}40`,
    dim30: `${colors.mutedForeground}4D`,
    dim40: `${colors.mutedForeground}66`,
    dim45: `${colors.mutedForeground}73`,
  };
}

/* ----- Word Match: two tiles drift apart, slide back together, light up --- */

function WordMatchPreview({ clock, p }: { clock: Clock; p: Palette }) {
  const tile = (dir: 1 | -1) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const t = clockT(clock);
      return {
        backgroundColor: interpolateColor(
          t,
          [0, 0.14, 0.28, 0.52, 0.68, 0.76, 1],
          [p.primary, p.primary, p.dim40, p.dim40, p.dim40, p.primary, p.primary],
        ),
        transform: [
          { translateX: interpolate(t, [0, 0.14, 0.28, 0.52, 0.68, 1], [0, 0, dir * 6, dir * 6, 0, 0]) },
          { rotate: `${interpolate(t, [0, 0.14, 0.28, 0.52, 0.68, 1], [0, 0, dir * 8, dir * 8, 0, 0])}deg` },
          { scale: interpolate(t, [0, 0.68, 0.76, 0.86, 1], [1, 1, 1.12, 1, 1]) },
        ],
      };
    });
  const left = tile(-1);
  const right = tile(1);
  return (
    <View style={styles.matchRow}>
      <Animated.View style={[styles.matchTile, left]} />
      <Animated.View style={[styles.matchTile, right]} />
    </View>
  );
}

/* ----- Listen & Pick: sound wave pulses, then the right chip lights up ---- */

const WAVE_HEIGHTS = [7, 12, 9, 6];
/** Web staggers bars by 0.09s of the 4.8s cycle. */
const WAVE_STAGGER = 0.09 / 4.8;

function WaveBar({ clock, index, color }: { clock: Clock; index: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = clockT(clock, index * WAVE_STAGGER);
    return {
      transform: [
        {
          scaleY: interpolate(
            t,
            [0, 0.07, 0.14, 0.21, 0.28, 0.36, 0.44, 1],
            [0.55, 1, 0.35, 0.9, 0.45, 0.8, 0.55, 0.55],
          ),
        },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.waveBar, { height: WAVE_HEIGHTS[index], backgroundColor: color }, style]}
    />
  );
}

function ListenAndPickPreview({ clock, p }: { clock: Clock; p: Palette }) {
  const pick = useAnimatedStyle(() => {
    const t = clockT(clock);
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 0.08, 0.16, 0.5, 0.6, 0.7, 1],
        [p.primary, p.primary, p.dim30, p.dim30, p.primary, p.primary, p.primary],
      ),
      transform: [{ scale: interpolate(t, [0, 0.5, 0.6, 0.7, 1], [1, 1, 1.3, 1, 1]) }],
    };
  });
  return (
    <View style={styles.listenCol}>
      <View style={styles.waveRow}>
        {WAVE_HEIGHTS.map((_, i) => (
          <WaveBar key={i} clock={clock} index={i} color={p.secondary} />
        ))}
      </View>
      <View style={styles.chipsRow}>
        <View style={[styles.chip, { backgroundColor: p.dim30 }]} />
        <Animated.View style={[styles.chip, pick]} />
        <View style={[styles.chip, { backgroundColor: p.dim30 }]} />
      </View>
    </View>
  );
}

/* ----- Phrase Builder: word tiles shuffle back into the correct order ----- */

function PhraseBuilderPreview({ clock, p }: { clock: Clock; p: Palette }) {
  const prim85 = `${p.primary}D9`;
  const shuffled = (tx: number, ty: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const t = clockT(clock);
      return {
        backgroundColor: interpolateColor(
          t,
          [0, 0.16, 0.32, 0.56, 0.74, 1],
          [prim85, prim85, p.dim45, p.dim45, prim85, prim85],
        ),
        transform: [
          { translateX: interpolate(t, [0, 0.16, 0.32, 0.56, 0.74, 1], [0, 0, tx, tx, 0, 0]) },
          { translateY: interpolate(t, [0, 0.16, 0.32, 0.56, 0.74, 1], [0, 0, ty, ty, 0, 0]) },
        ],
      };
    });
  const a = shuffled(12, -5);
  const b = shuffled(-9, 4);
  const c = useAnimatedStyle(() => {
    const t = clockT(clock);
    return {
      transform: [
        { translateY: interpolate(t, [0, 0.74, 0.8, 0.88, 1], [0, 0, -2.5, 0, 0]) },
      ],
    };
  });
  return (
    <View style={styles.buildRow}>
      <Animated.View style={[styles.buildTile, { width: 8 }, a]} />
      <Animated.View style={[styles.buildTile, { width: 12 }, b]} />
      <Animated.View style={[styles.buildTile, { width: 9, backgroundColor: prim85 }, c]} />
    </View>
  );
}

/* ----- Speed Round: a ticking timer ring with rapid-fire answer flashes --- */

function SpeedRoundPreview({ clock, p }: { clock: Clock; p: Palette }) {
  const ringProps = useAnimatedProps(() => {
    const t = clockT(clock);
    return {
      // Settled/static frame (t=0 → offset 6): most of the time left.
      strokeDashoffset: interpolate(t, [0, 0.76, 0.82, 0.88, 1], [6, 84, 88, 6, 6]),
      opacity: interpolate(t, [0, 0.76, 0.82, 0.88, 0.94, 1], [1, 1, 0, 0, 1, 1]),
    };
  });
  // Flashes run a 1.9s loop - exactly half the ring's 3.8s cycle.
  const flashA = useAnimatedStyle(() => {
    const t = (clockT(clock) * 2) % 1;
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 0.4, 0.5, 0.9, 1],
        [p.accent, p.accent, p.dim30, p.dim30, p.accent],
      ),
    };
  });
  const flashB = useAnimatedStyle(() => {
    const t = (clockT(clock) * 2) % 1;
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 0.4, 0.5, 0.9, 1],
        [p.dim30, p.dim30, p.accent, p.accent, p.dim30],
      ),
    };
  });
  return (
    <View style={styles.speedBox}>
      <Svg width={34} height={34} viewBox="0 0 34 34" style={styles.speedSvg}>
        <Circle cx={17} cy={17} r={14} stroke={p.dim25} strokeWidth={3} fill="none" />
        <AnimatedCircle
          cx={17}
          cy={17}
          r={14}
          stroke={p.primary}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="88"
          fill="none"
          animatedProps={ringProps}
        />
      </Svg>
      <View style={styles.speedFlashes}>
        <Animated.View style={[styles.speedFlash, flashA]} />
        <Animated.View style={[styles.speedFlash, flashB]} />
      </View>
    </View>
  );
}

/* ----- Bolo Quiz: choices cycle, the right one lands with a sparkle ------- */

function BoloQuizPreview({ clock, p }: { clock: Clock; p: Palette }) {
  const prim55 = `${p.primary}8C`;
  const row1 = useAnimatedStyle(() => {
    const t = clockT(clock);
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 0.12, 0.17, 0.27, 0.32, 1],
        [p.dim30, p.dim30, prim55, prim55, p.dim30, p.dim30],
      ),
    };
  });
  const row2 = useAnimatedStyle(() => {
    const t = clockT(clock);
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 0.3, 0.35, 0.45, 0.5, 1],
        [p.dim30, p.dim30, prim55, prim55, p.dim30, p.dim30],
      ),
    };
  });
  const correct = useAnimatedStyle(() => {
    const t = clockT(clock);
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 0.08, 0.14, 0.48, 0.56, 0.64, 1],
        [p.primary, p.primary, p.dim30, p.dim30, p.primary, p.primary, p.primary],
      ),
      transform: [{ scale: interpolate(t, [0, 0.48, 0.56, 0.64, 1], [1, 1, 1.08, 1, 1]) }],
    };
  });
  const sparkle = useAnimatedStyle(() => {
    const t = clockT(clock);
    return {
      opacity: interpolate(t, [0, 0.08, 0.14, 0.5, 0.58, 0.68, 1], [0.9, 0.9, 0, 0, 1, 0.9, 0.9]),
      transform: [
        { scale: interpolate(t, [0, 0.08, 0.14, 0.5, 0.58, 0.68, 1], [1, 1, 0.4, 0.4, 1.3, 1, 1]) },
        { rotate: `${interpolate(t, [0, 0.5, 0.58, 0.68, 1], [0, 0, 20, 0, 0])}deg` },
      ],
    };
  });
  return (
    <View style={styles.quizCol}>
      <Animated.View style={[styles.quizRow, { width: '100%' }, row1]} />
      <Animated.View style={[styles.quizRow, { width: '78%' }, row2]} />
      <Animated.View style={[styles.quizRow, { width: '90%' }, correct]} />
      {/* 4-point star, the RN stand-in for the web clip-path polygon. */}
      <Animated.View style={[styles.quizSparkle, sparkle]}>
        <Svg width={7} height={7} viewBox="0 0 7 7">
          <Polygon
            points="3.5,0 4.34,2.66 7,3.5 4.34,4.34 3.5,7 2.66,4.34 0,3.5 2.66,2.66"
            fill={p.accent}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const VIGNETTES: Record<
  string,
  React.ComponentType<{ clock: Clock; p: Palette }>
> = {
  'word-match': WordMatchPreview,
  'listen-and-pick': ListenAndPickPreview,
  'phrase-builder': PhraseBuilderPreview,
  'speed-round': SpeedRoundPreview,
  'bolo-quiz': BoloQuizPreview,
};

export function GamePreview({
  gameId,
  index,
  playing,
  tempo,
  holdMidCycle,
  fallback,
}: GamePreviewProps) {
  const p = usePalette();
  const cycle = CYCLE_MS[gameId] ?? 4800;
  const phase = ((index * 1100) % cycle) / cycle;
  const clock = useVignetteClock(cycle, {
    playing,
    tempo,
    phase,
    staticT: holdMidCycle ? phase : 0,
  });
  const Vignette = VIGNETTES[gameId];
  if (!Vignette) return <>{fallback ?? null}</>;
  return (
    <View style={styles.gv} testID={`game-preview-${gameId}`}>
      <Vignette clock={clock} p={p} />
    </View>
  );
}

const styles = StyleSheet.create({
  gv: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  matchRow: { flexDirection: 'row', gap: 3 },
  matchTile: { width: 13, height: 17, borderRadius: 4 },
  listenCol: { alignItems: 'center', gap: 5 },
  waveRow: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 13 },
  waveBar: { width: 2.5, borderRadius: 1 },
  chipsRow: { flexDirection: 'row', gap: 3 },
  chip: { width: 9, height: 5, borderRadius: 2.5 },
  buildRow: { flexDirection: 'row', gap: 2.5 },
  buildTile: { height: 9, borderRadius: 2.5 },
  speedBox: { width: 34, height: 34 },
  speedSvg: { position: 'absolute', top: 0, left: 0, transform: [{ rotate: '-90deg' }] },
  speedFlashes: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
  },
  speedFlash: { width: 10, height: 3, borderRadius: 1.5 },
  quizCol: { width: 24, gap: 3 },
  quizRow: { height: 4, borderRadius: 2 },
  quizSparkle: { position: 'absolute', right: -7, bottom: -2, width: 7, height: 7 },
});
