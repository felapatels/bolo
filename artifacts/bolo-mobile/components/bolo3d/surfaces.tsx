// THE 3D BIRD, SHAPED FOR EACH SCREEN THAT USES HER (docs/bolo3d.md).
//
// Owner, 2026-09-16, choosing to wire her into real screens before the real
// asset lands: chat, then lessons, then the store. Each screen keeps deciding
// WHAT is happening (a phase, a score band, a previewed hat) and hands that
// over in its own terms; these components turn it into moods, clips and mouth
// tracks in the contract's names. The screens never name a clip.
//
// REQUIRED LAZILY, only when BOLO3D_IN_SCREENS is on and only while a screen
// renders (bolo3dSurfaces() in lib/bolo3dFlag.ts), so a build without the flag
// never loads react-native-webview at all, and one with it not at launch.

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { ClipName, GiftBoxSpec, GiftToken, MomentBeat, Mood } from '@workspace/bolo-character';
import { Bolo3D, type Bolo3DHandle } from '@/components/bolo3d/Bolo3D';
import type { MascotPose } from '@/components/Mascot';
import { SoundBars, type TalkingMascotMode } from '@/components/TalkingMascot';
import { useEquippedOutfit } from '@/contexts/OutfitContext';
import { useColors } from '@/hooks/useColors';
import { chatterTrack, wear3d } from '@/lib/bolo3d';

/** The equipped outfit, in 3D. The pieces follow her to every screen. */
function useWorn3d() {
  const equipped = useEquippedOutfit();
  return wear3d(equipped.garment, equipped.accessory);
}

/** Talking while `speaking`, closed the moment it stops. */
function useChatter(bird: React.RefObject<Bolo3DHandle | null>, speaking: boolean) {
  useEffect(() => {
    if (speaking) bird.current?.speak(chatterTrack());
    else bird.current?.silence();
  }, [bird, speaking]);
}

// ---------------------------------------------------------------------------
// CHAT: the twin of <TalkingMascot>, same props, same bars and dots.
// ---------------------------------------------------------------------------

const TALK_MOOD: Record<TalkingMascotMode, Mood> = {
  idle: 'idle',
  listening: 'listen',
  thinking: 'think',
  talking: 'talk',
};
const TALK_POSE: Record<TalkingMascotMode, MascotPose> = {
  idle: 'wave',
  listening: 'thinking',
  talking: 'wave',
  thinking: 'thinking',
};

export function TalkingBolo3D({
  mode,
  size = 160,
  showBars = true,
}: {
  mode: TalkingMascotMode;
  size?: number;
  showBars?: boolean;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const bird = useRef<Bolo3DHandle>(null);
  const wear = useWorn3d();
  useChatter(bird, mode === 'talking');

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || mode !== 'listening') {
      pulse.value = withTiming(0, { duration: 200 });
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
  }, [mode, reduceMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + 0.35 * pulse.value }],
  }));

  return (
    <View style={styles.center} testID="talking-bolo-3d">
      {mode === 'listening' && (
        <Animated.View
          style={[
            styles.pulseRing,
            { width: size * 1.1, height: size * 1.1, borderRadius: (size * 1.1) / 2, borderColor: colors.primary },
            pulseStyle,
          ]}
        />
      )}
      {/* IN CHAT SHE TAKES NO TOUCHES. The box she sits in is the screen's
          hold-to-talk button ("Hold your finger on Bolo to record"), so a
          finger on her must reach it; a bird that spun instead would break
          recording. Every other screen lets her react. */}
      <View pointerEvents="none" style={{ width: size, height: size }}>
        <Bolo3D
          ref={bird}
          mood={TALK_MOOD[mode]}
          interactive={false}
          wear={wear}
          posterPose={TALK_POSE[mode]}
          posterSize={size}
          style={{ width: size, height: size }}
        />
      </View>
      {mode === 'talking' && showBars && <SoundBars />}
      {mode === 'listening' && !reduceMotion && (
        <View style={[styles.micDot, { backgroundColor: colors.destructive ?? '#EF4444' }]} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// LESSONS: the reacting bird over the phrase card, and the summary's bird.
// ---------------------------------------------------------------------------

/** What just happened in the lesson, in the screen's own terms. */
export type LessonMoment = 'idle' | 'recording' | 'evaluating' | 'great' | 'good' | 'nocatch' | 'miss' | 'compare' | 'error';

/**
 * One reaction per result, never a disappointed bird: the brief's own words
 * for tryagain are "encouraging, never scolding", and a missed catch is the
 * system's miss, not the learner's (Spec 1 rule 16), so she looks curious.
 */
const LESSON_REACTION: Partial<Record<LessonMoment, ClipName>> = {
  great: 'cheer',
  good: 'correct',
  nocatch: 'head_tilt',
  miss: 'tryagain',
  compare: 'nod',
  error: 'shrug',
};
const LESSON_POSE: Record<LessonMoment, MascotPose> = {
  idle: 'wave',
  recording: 'thinking',
  evaluating: 'thinking',
  great: 'cheer',
  good: 'thumbsup',
  nocatch: 'thinking',
  miss: 'tryagain',
  compare: 'thumbsup',
  error: 'tryagain',
};

/** The lesson bird's box is this much taller than it is wide. */
export const LESSON_BIRD_ASPECT = 1.15;
/** Her size while a result is up: the outcome layout's (build 19). */
export const LESSON_BIRD_COMPACT = 72;
const LESSON_BIRD_MIN = 104;
const LESSON_BIRD_MAX = 260;

/**
 * THE LESSON BIRD'S SIZE. Owner, 2026-09-16, on the first signed-in look at her
 * in a lesson: "we will need to make bolo3d bigger and the lesson card smaller
 * and move it down." She takes the height the word card leaves her (`room`),
 * so a short phrase gets a big bird and a long one never pushes the card under
 * the record button. Never smaller than the 104 pt bird the lesson had, and a
 * result keeps the compact bird so the feedback still lands on one screen.
 * Steps of 4 pt, so a card a point taller does not resize her.
 */
export function lessonBirdSize(room: number, showingOutcome: boolean): number {
  if (showingOutcome) return LESSON_BIRD_COMPACT;
  const fit = Math.floor(room / LESSON_BIRD_ASPECT / 4) * 4;
  return Math.min(LESSON_BIRD_MAX, Math.max(LESSON_BIRD_MIN, fit));
}

/**
 * The lesson row she stands in, whose measured height is the `room` above:
 * it grows into whatever the word card leaves while practising (which is what
 * pushes the card down to the record button), and holds her compact box while
 * a result is up.
 */
export function lessonBirdRow(showingOutcome: boolean): ViewStyle {
  return showingOutcome
    ? { height: Math.round(LESSON_BIRD_COMPACT * LESSON_BIRD_ASPECT) }
    : { flexGrow: 1, minHeight: Math.round(LESSON_BIRD_MIN * LESSON_BIRD_ASPECT) };
}

export function LessonBolo3D({
  moment,
  speaking = false,
  celebrate = 0,
  size,
  style,
}: {
  moment: LessonMoment;
  /** The phrase audio is playing: she says it. */
  speaking?: boolean;
  /** Bumped by the screen on a milestone, as for <Mascot celebrateBounce>. */
  celebrate?: number;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const bird = useRef<Bolo3DHandle>(null);
  const wear = useWorn3d();
  useChatter(bird, speaking);

  useEffect(() => {
    const clip = LESSON_REACTION[moment];
    if (clip) bird.current?.play(clip);
  }, [moment]);

  const firstCelebrate = useRef(celebrate);
  useEffect(() => {
    if (celebrate !== firstCelebrate.current) bird.current?.play('celebrate_big');
  }, [celebrate]);

  const mood: Mood = moment === 'recording' ? 'listen' : moment === 'evaluating' ? 'think' : speaking ? 'talk' : 'idle';

  return (
    <Bolo3D
      ref={bird}
      testID="lesson-bolo-3d"
      mood={mood}
      wear={wear}
      posterPose={LESSON_POSE[moment]}
      posterSize={size}
      style={[{ width: size, height: Math.round(size * LESSON_BIRD_ASPECT) }, style]}
    />
  );
}

export type SummaryMoment = 'celebrate' | 'perfect' | 'passed' | 'not-yet' | 'checking' | 'error';

const SUMMARY_CLIP: Record<SummaryMoment, ClipName | null> = {
  celebrate: 'cheer',
  perfect: 'celebrate_big',
  passed: 'win',
  'not-yet': 'encourage',
  checking: null,
  error: 'shrug',
};
const SUMMARY_POSE: Record<SummaryMoment, MascotPose> = {
  celebrate: 'cheer',
  perfect: 'cheer',
  passed: 'cheer',
  'not-yet': 'thumbsup',
  checking: 'thinking',
  error: 'tryagain',
};

/** The end of a session: one moment, played once she is up. */
export function SummaryBolo3D({ moment, size }: { moment: SummaryMoment; size: number }) {
  const bird = useRef<Bolo3DHandle>(null);
  const wear = useWorn3d();
  useEffect(() => {
    const clip = SUMMARY_CLIP[moment];
    if (clip) bird.current?.play(clip);
  }, [moment]);
  return (
    <Bolo3D
      ref={bird}
      testID="summary-bolo-3d"
      mood={moment === 'checking' ? 'think' : 'idle'}
      wear={wear}
      posterPose={SUMMARY_POSE[moment]}
      posterSize={size}
      style={{ width: size, height: Math.round(size * 1.15) }}
    />
  );
}

// ---------------------------------------------------------------------------
// THE DAILY GIFT: her and the box (owner's pick two).
// ---------------------------------------------------------------------------

/**
 * What the gift moment is showing, in the card's own terms: a box that is not
 * earned yet, a claim on the wire, a claim that came back opened, one that
 * failed, and a box somebody already opened today.
 */
export type GiftMomentPhase = 'locked' | 'waiting' | 'opened' | 'failed' | 'already';

const GIFT_POSE: Record<GiftMomentPhase, MascotPose> = {
  locked: 'thinking',
  waiting: 'wave',
  opened: 'cheer',
  failed: 'tryagain',
  already: 'thumbsup',
};

export function GiftBolo3D({
  phase,
  box,
  token,
  count,
  width,
  height,
  onReady,
  onBeat,
  onUnavailable,
}: {
  phase: GiftMomentPhase;
  box: GiftBoxSpec;
  /** What pops out of an opened box: the fork's own currency (lib/bolo3dGift.ts). */
  token: GiftToken;
  /** How many pop out (lib/bolo3dGift.ts giftTokenCount). */
  count: number;
  width: number;
  height: number;
  onReady?: () => void;
  onBeat?: (beat: MomentBeat) => void;
  /** The 3D bird could not be shown; the still one stands in and nothing will beat. */
  onUnavailable?: () => void;
}) {
  const bird = useRef<Bolo3DHandle>(null);
  const wear = useWorn3d();
  // Counted, not a flag: a page that died and was reloaded is ready AGAIN, and
  // the scene it lost has to be sent again.
  const [readyCount, setReadyCount] = useState(0);
  const boxKey = `${box.day ?? ''}|${box.size}|${box.bow}`;

  useEffect(() => {
    if (!readyCount) return;
    const handle = bird.current;
    if (!handle) return;
    if (phase === 'locked') handle.moment({ type: 'moment', moment: 'gift-locked', box });
    else if (phase === 'waiting') handle.moment({ type: 'moment', moment: 'gift-waiting', box });
    else if (phase === 'opened') handle.moment({ type: 'moment', moment: 'gift-open', box, token, count });
    // A failed claim leaves the box as it was, still asking, and she shrugs:
    // "try again" is true. Never a disappointed bird.
    else if (phase === 'failed') handle.play('shrug');
    else {
      handle.moment({ type: 'moment', moment: null });
      handle.play('nod');
    }
    // `box` is read through boxKey: a new object with the same box is the same box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, readyCount, boxKey, token, count]);

  return (
    <Bolo3D
      ref={bird}
      testID="gift-bolo-3d"
      wear={wear}
      posterPose={GIFT_POSE[phase]}
      posterSize={Math.round(height * 0.6)}
      style={{ width, height }}
      onReady={() => {
        setReadyCount((n) => n + 1);
        onReady?.();
      }}
      onMoment={(_, beat) => onBeat?.(beat)}
      onError={() => onUnavailable?.()}
    />
  );
}

// ---------------------------------------------------------------------------
// THE STORE: try it on, then turn her round to look (owner's pick three).
// ---------------------------------------------------------------------------

export function OutfitPreview3D({
  garment,
  accessory,
  size,
}: {
  garment: string | null | undefined;
  accessory: string | null | undefined;
  size: number;
}) {
  const bird = useRef<Bolo3DHandle>(null);
  const shown = `${garment ?? ''}|${accessory ?? ''}`;
  const firstShown = useRef(shown);
  // She presents each new piece: the brief lists the shop under `show`.
  useEffect(() => {
    if (shown !== firstShown.current) bird.current?.play('show');
  }, [shown]);
  return (
    <Bolo3D
      ref={bird}
      testID="outfit-preview-3d"
      interactive
      // She stays where the learner turned her, to look at the back of a hat.
      returnToFront={false}
      wear={wear3d(garment, accessory)}
      posterPose="cheer"
      posterSize={size}
      style={{ width: Math.round(size * 1.1), height: Math.round(size * 1.2) }}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', borderWidth: 3 },
  micDot: { width: 10, height: 10, borderRadius: 5, marginTop: 10 },
});
