/**
 * Review Practice Screen
 *
 * A spaced-repetition session sourced from the learner's due-for-review
 * phrases (via /api/review/phrases). The session flow is identical to the
 * category practice screen but uses the review queue as its phrase list.
 *
 * Navigated to directly from the "Review Now" badge on the home screen so
 * learners can start a session without an extra tap through the progress tab.
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { hapticLight, hapticMedium, hapticHeavy, hapticNotify } from '@/lib/haptics';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeOutUp,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BandPill, type Band } from '@/components/BandPill';
import { BandLadder } from '@/components/BandLadder';
import {
  isAdvanceUnlocked,
  isFullCreditBand,
  isGoodOrBetterBand,
  isHalfCreditBand,
  isPassingBand,
  normalizeBand,
} from '@/lib/ui';
import { ResultActions } from '@/components/ResultActions';
import { XpCounter } from '@/components/XpCounter';
import { ChaiPill } from '@/components/SessionStats';
import { EmptyState } from '@/components/EmptyState';
import { appear, appearDown, appearPlain, appearZoom, useAppearSkip } from '@/lib/entrance';
import {
  useListReviewPhrases,
  getListReviewPhrasesQueryKey,
  useSynthesizeSpeech,
  useEvaluatePronunciation,
  useCreateAttempt,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListBadgesQueryKey,
  type PronunciationResult,
  type EarnedBadge,
} from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { applyOptimisticTodayXp } from '@workspace/train-class';
import { Screen } from '@/components/Screen';
import { BadgeUnlock } from '@/components/BadgeUnlock';
import { ChunkyButton } from '@/components/ChunkyButton';
import { FunFactLoader } from '@/components/FunFactLoader';
import { Mascot, type MascotPose } from '@/components/Mascot';
import { Confetti } from '@/components/Confetti';
import { MilestoneToast } from '@/components/MilestoneToast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import {
  prepareRecordingSession,
  prepareRecorderInSession,
  ensureRecordingMode,
  stopAndReadRecording,
  playBase64Audio,
  RECORDING_PRESET,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  SPEECH_MIN_DB,
  SILENCE_DROP_DB,
  meteringToAmplitude,
  reportAudioSessionFailure,
  type PlaybackHandle,
} from '@/lib/audio';
import { Waveform } from '@/components/Waveform';
import { prefersReducedMotion } from '@/lib/motionPrefs';
import { loadSpokenFeedback, saveSpokenFeedback, loadSilentMode, saveSilentMode, loadApproxNoticeSeen, saveApproxNoticeSeen } from '@/lib/settings';
import { loadMeaningAudio, saveMeaningAudio, meaningSpeechText } from '@/lib/meaning-audio';
import {
  LessonSettingsMenu,
  LanguageChip,
  LESSON_AUDIO_LABELS,
  type LessonSettingsItem,
} from '@/components/LessonSettingsMenu';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';
import { playCue } from '@/lib/sound';
import { XpArc } from '@/components/XpArc';
import { CountUpText } from '@/components/CountUpText';
import { glyphsForLanguage } from '@/lib/scriptGlyphs';

// 'compare' is the unsupported-language stage: the learner recorded but we
// never sent an evaluation, so instead of a scored 'result' they get a
// listen-record-compare card (no band, no XP).
type Phase = 'idle' | 'recording' | 'evaluating' | 'result' | 'compare' | 'error' | 'done';

// Toggle confirmations for the header settings menu. Deliberately a local copy
// of the practice screen's TOGGLE_TOAST strings (same house pattern as
// BAND_LABEL below), so the two screens confirm a flip in identical words.
const TOGGLE_TOAST = {
  phraseAudioOn: 'Phrase audio on. Bolo reads each phrase first.',
  phraseAudioOff: 'Phrase audio off. You speak first.',
  feedbackAloudOn: 'Feedback aloud on. Your score is read out.',
  feedbackAloudOff: 'Feedback aloud off.',
  meaningAloudOn: 'Meaning aloud on. English after each phrase.',
  meaningAloudOff: 'Meaning aloud off.',
} as const;

// Beat between the phrase clip and the spoken English meaning. Same constant
// as the practice screen (which took it from web's MEANING_SEGMENT_PAUSE_MS,
// Task 1003) so all three surfaces leave the same gap.
// 220ms SINCE BUILD 29, down from 400. The owner, testing 1.0.11: "so can we
// shorten the gap between word and meaning?". 400 was chosen as a speech beat
// before anyone had heard it with the synthesis latency removed; once the clip
// is pre-fetched, 400ms of true silence between a one-word phrase and "means..."
// is a long time to wait. 220 still reads as a beat rather than the two clips
// running together.
//
// THE PLAYER'S OWN START-UP SITS ON TOP OF THIS and is the real floor: writing
// the base64 out and loading it costs its own moment on a device, so the felt
// gap is always somewhat longer than this number. Cutting this below about 150
// buys very little and starts to sound like a stumble.
//
// Changed on BOTH platforms in one commit. This constant exists three times,
// and today has already cost three separate bugs from twins fixed a day apart.
const MEANING_SEGMENT_PAUSE_MS = 220;

const BAND_LABEL: Record<Band, string> = {
  perfect: 'Perfect',
  great: 'Great',
  good: 'Good',
  almost: 'Almost',
  retry: 'Try again',
  nocatch: "Didn't catch that",
};

// Five-band ladder gradient from brand tokens (top to bottom): success green,
// accent teal, primary indigo, muted slate, destructive red. retry keeps its
// destructive treatment; nocatch renders neutral (system miss, Spec 1 rule 16).
// NOTE: deliberately kept as a local copy mirroring practice/[id].tsx
// (documented debt — extraction is a separate task).
function bandColor(
  band: Band,
  colors: {
    success: string;
    accent: string;
    primary: string;
    mutedForeground: string;
    destructive: string;
  },
): string {
  if (band === 'perfect') return colors.success;
  if (band === 'great') return colors.accent;
  if (band === 'good') return colors.primary;
  if (band === 'almost') return colors.mutedForeground;
  if (band === 'nocatch') return colors.mutedForeground;
  return colors.destructive;
}

// ── Score dot / trail ────────────────────────────────────────────────────────

function ScoreDot({
  band,
  isCurrent,
  dotColor,
  onPress,
  isSelected,
}: {
  band: Band | null;
  isCurrent: boolean;
  dotColor: string;
  onPress?: () => void;
  isSelected: boolean;
}) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (isCurrent) {
      scale.value = withRepeat(
        withSequence(withTiming(1.35, { duration: 650 }), withTiming(0.85, { duration: 650 })),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [isCurrent, scale]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={band !== null ? onPress : undefined}
      disabled={band === null}
      hitSlop={6}
      accessibilityRole={band !== null ? 'button' : undefined}
      accessibilityLabel={band !== null ? BAND_LABEL[band] : undefined}
    >
      <Animated.View
        style={[
          styles.scoreDot,
          { backgroundColor: dotColor, borderWidth: isSelected ? 1.5 : 0, borderColor: '#fff' },
          animStyle,
        ]}
      />
    </Pressable>
  );
}

function ScoreTrail({
  total,
  bands,
  currentIndex,
  colors,
}: {
  total: number;
  bands: Record<number, Band>;
  currentIndex: number;
  colors: {
    success: string;
    accent: string;
    destructive: string;
    muted: string;
    primary: string;
    mutedForeground: string;
    foreground: string;
  };
}) {
  const [tooltip, setTooltip] = React.useState<{ idx: number; band: Band } | null>(null);
  const tooltipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipOpacity = useSharedValue(0);

  const showTooltip = React.useCallback(
    (idx: number, band: Band) => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      setTooltip({ idx, band });
      tooltipOpacity.value = withTiming(1, { duration: 150 });
      tooltipTimer.current = setTimeout(() => {
        tooltipOpacity.value = withTiming(0, { duration: 200 });
        setTimeout(() => setTooltip(null), 210);
      }, 1800);
    },
    [tooltipOpacity],
  );

  React.useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  const tooltipStyle = useAnimatedStyle(() => ({ opacity: tooltipOpacity.value }));

  if (total === 0) return null;

  return (
    <View style={styles.scoreTrailOuter}>
      {tooltip !== null && (
        <Animated.Text
          style={[styles.scoreTrailTooltip, { color: colors.mutedForeground }, tooltipStyle]}
        >
          Phrase {tooltip.idx + 1}: {BAND_LABEL[tooltip.band]}
        </Animated.Text>
      )}
      <View style={styles.scoreTrailRow}>
        {Array.from({ length: total }, (_, i) => {
          const band = bands[i] ?? null;
          const isCurrent = i === currentIndex;
          const dotColor =
            band !== null
              ? bandColor(band, colors)
              : isCurrent
                ? colors.primary + '70'
                : colors.muted;
          return (
            <ScoreDot
              key={i}
              band={band}
              isCurrent={isCurrent}
              dotColor={dotColor}
              onPress={() => showTooltip(i, band!)}
              isSelected={tooltip?.idx === i}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── Error description ────────────────────────────────────────────────────────

function describeEvaluationError(error: unknown): string {
  if (error instanceof ApiError) {
    const status = (error as { status?: number }).status;
    if (status === 502) return "Bolo hit a snag 🦜 — give it another try!";
    if (status === 429) return "Whoa, that's a lot of practice! Wait a moment, then try again.";
    return 'Something went wrong while scoring. Please try again.';
  }
  if (error instanceof TypeError) return "Bolo flew out for a mango lassi 🥭 — check your connection and try again!";
  return 'Something went wrong while scoring. Please try again.';
}

// ── Header ───────────────────────────────────────────────────────────────────

function ReviewHeader({
  onClose,
  label,
  settingsItems,
  languageCode,
  rightAction,
}: {
  onClose: () => void;
  label: string;
  /** The flashback's Skip (build 20): a worded button in the right slot,
   *  in place of the gear, because three phrases do not need a settings
   *  menu and a learner in a hurry needs the door. */
  rightAction?: { label: string; onPress: () => void };
  /** When provided, shows the settings gear + menu as the rightmost control.
   *  Review is a practice screen, so it carries the same gear, menu and
   *  language chip the practice header does — all three audio items included,
   *  since Task 1046 gave review its own meaning segment. The loading / empty
   *  / summary header variants pass nothing and keep the plain spacer. */
  settingsItems?: LessonSettingsItem[];
  /** Active language code for the display-only chip left of the gear. */
  languageCode?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Close review"
        onPress={onClose}
        style={[styles.closeBtn, { backgroundColor: colors.card }]}
      >
        <Feather name="x" size={22} color={colors.foreground} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <XpCounter variant="session" />
          <ChaiPill compact />
        </View>
      </View>
      {rightAction ? (
        <Pressable
          testID="review-right-action"
          accessibilityRole="button"
          accessibilityLabel={rightAction.label}
          onPress={rightAction.onPress}
          style={[styles.closeBtn, { backgroundColor: colors.card, width: undefined, paddingHorizontal: 14 }]}
        >
          <Text style={{ color: colors.foreground, fontFamily: AppFonts.bold, fontSize: 14 }}>
            {rightAction.label}
          </Text>
        </Pressable>
      ) : settingsItems ? (
        <View style={styles.headerRight}>
          {languageCode ? <LanguageChip code={languageCode} /> : null}
          <LessonSettingsMenu items={settingsItems} />
        </View>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}

// ── Record button ────────────────────────────────────────────────────────────

function RecordButton({
  phase,
  unsupported,
  onPressIn,
  onPressOut,
  amplitude,
  ampLevel,
  noInput,
}: {
  phase: Phase;
  /** Unsupported languages record without scoring, so the hint copy changes. */
  unsupported?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  amplitude: SharedValue<number>;
  ampLevel: number;
  noInput: boolean;
}) {
  const colors = useColors();
  const pulse = useSharedValue(0);
  const ringPhaseVal = useSharedValue(0);

  React.useEffect(() => {
    if (phase === 'recording') {
      pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [phase, pulse]);

  React.useEffect(() => {
    if (phase === 'evaluating') {
      ringPhaseVal.value = withSpring(1, { damping: 14, stiffness: 180 });
    } else {
      ringPhaseVal.value = withTiming(0, { duration: 300 });
    }
  }, [phase, ringPhaseVal]);

  const primaryColor = colors.primary;
  const amberColor = '#F59E0B';

  const ringStyle = useAnimatedStyle(() => {
    const ringBg = interpolateColor(ringPhaseVal.value, [0, 1], [primaryColor, amberColor]);
    return {
      transform: [{ scale: 1 + pulse.value * 0.25 }],
      opacity: 0.35 - pulse.value * 0.25,
      backgroundColor: ringBg,
    };
  });

  const evaluating = phase === 'evaluating';
  const recording = phase === 'recording';
  // Barge-in (#913, web Task 907 parity): the mic stays live while the coach
  // is speaking — a hold stops the audio and records on the same gesture
  // (startRecording calls stopPlayback first). Only evaluation blocks it.
  const blocked = evaluating;

  return (
    <View style={styles.recordWrap}>
      <View style={styles.recordCenter}>
        <Animated.View style={[styles.pulseRing, ringStyle]} />
        <Pressable
          disabled={blocked}
          testID="record-button"
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Hold to record'}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[
            styles.recordBtn,
            { backgroundColor: recording ? colors.accent : colors.primary },
          ]}
        >
          {evaluating ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Feather name={recording ? 'square' : 'mic'} size={34} color="#fff" />
          )}
        </Pressable>
      </View>
      {/* Spec D2: live waveform — only while actually recording. The slot
          keeps its height in every phase so the button never shifts under a
          holding finger when recording starts (frame-stability contract). */}
      <View style={styles.waveSlot} testID="waveform-slot">
        {recording ? (
          <Waveform amplitude={amplitude} level={ampLevel} height={22} />
        ) : null}
      </View>
      <View style={styles.hintSlot} testID="record-hint-slot">
        <Text style={[styles.recordHint, { color: colors.mutedForeground }]}>
          {evaluating
            ? unsupported
              ? 'Saving your recording...'
              : 'Scoring your pronunciation...'
            : recording
              ? noInput
                ? "We can't hear you - check your mic"
                : unsupported
                  ? 'Release to compare'
                  : 'Release to score'
              : 'Hold and say it out loud'}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

/**
 * THE FLASHBACK BETWEEN STOPS (build 20, owner ruling 2026-08-29): how many
 * due phrases a finished stop brings back on the way to the next one. Three
 * or fewer is the server's free door (FLASHBACK_FREE_SIZE in learning.ts);
 * the full drill above it stays Plus. Web twin: pages/practice.tsx.
 */
const FLASHBACK_SIZE = 3;

export default function ReviewScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const router = useRouter();
  // The flashback IS this screen in every respect but three: it asks for
  // FLASHBACK_SIZE phrases, it can be skipped, and leaving it (done, skipped,
  // or nothing due) goes BACK to wherever the finished stop was opened from,
  // which is the journey. A finished journey stop replaces itself with this
  // route (practice/[id].tsx), so back lands on the map, between stops.
  const searchParams = useLocalSearchParams<{ flashback?: string }>();
  const isFlashback = searchParams.flashback === '1';
  const leave = React.useCallback(() => {
    if (isFlashback) router.back();
    else router.replace('/(app)/(tabs)');
  }, [isFlashback, router]);
  const queryClient = useQueryClient();
  const { activeLang, activeLanguage, speechCapability } = useLanguage();
  // Speech-recognition gating (server-classified, defaults to full scoring):
  //  • 'unsupported' → listen-record-compare only, never send an evaluation.
  //  • 'degraded'    → scored practice continues, plus a one-time approx notice.
  const isUnsupported = speechCapability === 'unsupported';
  const isDegraded = speechCapability === 'degraded';
  const languageName = activeLanguage?.name ?? 'this language';

  const reviewParams = isFlashback
    ? { lang: activeLang, limit: FLASHBACK_SIZE }
    : { lang: activeLang };
  const phrases = useListReviewPhrases(reviewParams, {
    query: {
      enabled: !!activeLang,
      queryKey: getListReviewPhrasesQueryKey(reviewParams),
    },
  });
  const list = phrases.data ?? [];
  // Nothing due means no flashback: straight on, no empty screen. A failed
  // load counts too (a server without the free door answers 402): a
  // flashback that cannot load steps aside rather than standing in the way.
  const flashbackOver = !phrases.isLoading && (phrases.isError || list.length === 0);
  React.useEffect(() => {
    if (isFlashback && flashbackOver) leave();
  }, [isFlashback, flashbackOver, leave]);

  const recorder = useAudioRecorder(RECORDING_PRESET);
  const synth = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();

  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const phaseRef = React.useRef<Phase>('idle');
  const setPhaseSync = React.useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const [result, setResult] = React.useState<PronunciationResult | null>(null);
  const [bands, setBands] = React.useState<Record<number, Band>>({});
  // Unsupported languages record no bands, so the summary count comes from the
  // set of phrase indices the learner reached the compare stage on.
  const [comparedIdx, setComparedIdx] = React.useState<Set<number>>(new Set());
  const [xpData, setXpData] = React.useState<Record<number, { xp: number; breakdown: string | null }>>({});
  // Every take on a phrase, whatever the band, keyed by list index like bands
  // and xpData. Drives the advance gate (Task #1040). Review has no zero-XP
  // encore, so attempts are all this screen needs to tally.
  const [attempts, setAttempts] = React.useState<Record<number, number>>({});
  const [xpExpanded, setXpExpanded] = React.useState(false);
  const [coachPlaying, setCoachPlaying] = React.useState(false);
  const [selfPlaying, setSelfPlaying] = React.useState(false);
  const lastRecordingBase64Ref = React.useRef<string | null>(null);
  const selfPlaybackRef = React.useRef<PlaybackHandle | null>(null);
  const selfPlayTokenRef = React.useRef(0);
  const [unlockedBadges, setUnlockedBadges] = React.useState<EarnedBadge[]>([]);
  const [celebrate, setCelebrate] = React.useState(false);
  const [evalError, setEvalError] = React.useState<string | null>(null);
  const [saveFailed, setSaveFailed] = React.useState(false);

  // One-time "feedback is approximate" notice for degraded-recognition
  // languages. Shown once per language code, then persisted so it never
  // reappears. Scored practice is otherwise unchanged.
  const [showApproxNotice, setShowApproxNotice] = React.useState(false);
  React.useEffect(() => {
    if (!isDegraded) return;
    let cancelled = false;
    loadApproxNoticeSeen(activeLang).then((seen) => {
      if (!cancelled && !seen) setShowApproxNotice(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isDegraded, activeLang]);
  const dismissApproxNotice = React.useCallback(() => {
    setShowApproxNotice(false);
    void saveApproxNoticeSeen(activeLang);
  }, [activeLang]);

  const consecutiveGoodRef = React.useRef(0);
  const [toastMessage, setToastMessage] = React.useState('');
  const [toastKey, setToastKey] = React.useState(0);
  const [celebrateBounceCount, setCelebrateBounceCount] = React.useState(0);
  const halfwayFiredRef = React.useRef(false);
  const lastPhraseFiredRef = React.useRef(false);

  const flashOpacity = useSharedValue(0);
  const [flashColor, setFlashColor] = React.useState('#10B981');
  const flashOverlayStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  // ── Wrong-answer shake (Spec 1 rule: retry band only, never nocatch) ─────
  const reduceMotion = useReducedMotion();
  const shakeX = useSharedValue(0);
  const triggerShake = React.useCallback(() => {
    if (reduceMotion) return; // outcome is instant under reduced motion
    // 3 horizontal cycles ≈80ms each, ≤8px, transform-only.
    shakeX.value = withSequence(
      withTiming(-8, { duration: 40 }),
      withTiming(8, { duration: 80 }),
      withTiming(-8, { duration: 80 }),
      withTiming(8, { duration: 80 }),
      withTiming(0, { duration: 40 }),
    );
  }, [reduceMotion, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // ── XP arc (Spec 1: nailed only; badge arcs from result to XP counter) ──
  const xpArcTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
    },
    [],
  );
  const [xpArc, setXpArc] = React.useState<{
    key: number;
    amount: number;
    from: { x: number; y: number };
  } | null>(null);
  const resultCardRef = React.useRef<View>(null);

  const isPressingRef = React.useRef(false);

  const celebrateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireConfetti = React.useCallback((durationMs = 2600) => {
    setCelebrate(true);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrate(false), durationMs);
  }, []);
  React.useEffect(
    () => () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    },
    [],
  );

  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const phrase = list[index];
  const nativeProps = nativeTextStyle(activeLanguage, { bold: true });
  const playTokenRef = React.useRef(0);
  const feedbackAudioRef = React.useRef<Promise<{ audioBase64: string; format?: string } | null> | null>(null);

  const [spokenEnabled, setSpokenEnabled] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadSpokenFeedback().then((enabled) => {
      if (!cancelled) setSpokenEnabled(enabled);
    });
    return () => { cancelled = true; };
  }, []);

  // Coach voice master gate: when off, all Bolo speech is silent regardless
  // of the more granular spoken-feedback setting.
  const [coachVoiceEnabled, setCoachVoiceEnabled] = React.useState(true);
  const coachVoiceRef = React.useRef(true);
  React.useEffect(() => {
    let cancelled = false;
    loadCoachVoicePref().then((enabled) => {
      if (!cancelled) {
        coachVoiceRef.current = enabled;
        setCoachVoiceEnabled(enabled);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const stopPlayback = React.useCallback(() => {
    playTokenRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setCoachPlaying(false);
  }, []);

  const stopSelfPlayback = React.useCallback(() => {
    selfPlayTokenRef.current += 1;
    selfPlaybackRef.current?.stop();
    selfPlaybackRef.current = null;
    setSelfPlaying(false);
  }, []);

  const playSelf = React.useCallback(async () => {
    const b64 = lastRecordingBase64Ref.current;
    if (!b64) return;
    if (selfPlaybackRef.current) {
      stopSelfPlayback();
      return;
    }
    stopPlayback();
    setSelfPlaying(true);
    const myToken = ++selfPlayTokenRef.current;
    try {
      const handle = await playBase64Audio(b64, 'm4a', () => {
        if (selfPlayTokenRef.current === myToken) {
          selfPlaybackRef.current = null;
          setSelfPlaying(false);
        }
      });
      if (selfPlayTokenRef.current !== myToken) {
        handle.stop();
        return;
      }
      selfPlaybackRef.current = handle;
    } catch {
      if (selfPlayTokenRef.current === myToken) setSelfPlaying(false);
    }
  }, [stopPlayback, stopSelfPlayback]);

  const toggleSpokenFeedback = React.useCallback(() => {
    setSpokenEnabled((enabled) => {
      const nextEnabled = !enabled;
      void saveSpokenFeedback(nextEnabled);
      if (!nextEnabled) stopPlayback();
      return nextEnabled;
    });
  }, [stopPlayback]);

  // Silent-mode preference — review already honours it at every coach autoplay
  // (it re-reads the stored value there), but had no control for it. Mirrored
  // in state so the header menu can show its on/off condition; the autoplay
  // reads stay fresh, so a flip applies from the very next phrase.
  const [silentModeUI, setSilentModeUI] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    loadSilentMode().then((v) => {
      if (!cancelled) setSilentModeUI(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleSilentMode = React.useCallback(() => {
    const next = !silentModeUI;
    setSilentModeUI(next);
    void saveSilentMode(next);
    setToastMessage(next ? TOGGLE_TOAST.phraseAudioOff : TOGGLE_TOAST.phraseAudioOn);
    setToastKey((k) => k + 1);
  }, [silentModeUI]);

  // Meaning-aloud preference (Task 1046, practice parity): the English meaning
  // is spoken right after each phrase clip. Mirrored in state for the header
  // item. The ref starts null (unknown) because AsyncStorage is async: the
  // first play awaits the stored value through readMeaningPref so a saved
  // "off" is never raced by an optimistic default, and every later read is
  // synchronous. The ref is read fresh at each step of the play chain so a
  // flip applies to the very next segment without waiting for a re-render.
  const [meaningAudioUI, setMeaningAudioUI] = React.useState(true);
  const meaningPrefRef = React.useRef<boolean | null>(null);
  const readMeaningPref = React.useCallback(async () => {
    if (meaningPrefRef.current === null) {
      meaningPrefRef.current = await loadMeaningAudio();
    }
    return meaningPrefRef.current;
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    loadMeaningAudio().then((enabled) => {
      if (cancelled) return;
      if (meaningPrefRef.current === null) meaningPrefRef.current = enabled;
      setMeaningAudioUI(meaningPrefRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleMeaningAudio = React.useCallback(() => {
    const next = !meaningAudioUI;
    setMeaningAudioUI(next);
    meaningPrefRef.current = next;
    void saveMeaningAudio(next);
    setToastMessage(next ? TOGGLE_TOAST.meaningAloudOn : TOGGLE_TOAST.meaningAloudOff);
    setToastKey((k) => k + 1);
  }, [meaningAudioUI]);

  // The three audio items behind the header gear, matching practice (Task 1046
  // gave review its own meaning segment, so the item is real here now). Every
  // item reads and writes the screen's own state, so the Feedback item and the
  // result-card mute are one value, not two copies.
  const settingsItems = React.useMemo<LessonSettingsItem[]>(
    () => [
      {
        key: 'phrase',
        label: LESSON_AUDIO_LABELS.phrase,
        description: silentModeUI
          ? 'You speak first'
          : 'Bolo reads each phrase first',
        enabled: !silentModeUI,
        iconOn: 'volume-2',
        iconOff: 'volume-x',
        onToggle: toggleSilentMode,
      },
      {
        key: 'feedback',
        label: LESSON_AUDIO_LABELS.feedback,
        description: spokenEnabled
          ? 'Your score is read out'
          : 'Your score is not read out',
        enabled: spokenEnabled,
        iconOn: 'headphones',
        iconOff: 'headphones',
        onToggle: () => {
          const next = !spokenEnabled;
          toggleSpokenFeedback();
          setToastMessage(
            next ? TOGGLE_TOAST.feedbackAloudOn : TOGGLE_TOAST.feedbackAloudOff,
          );
          setToastKey((k) => k + 1);
        },
      },
      {
        key: 'meaning',
        label: LESSON_AUDIO_LABELS.meaning,
        description: meaningAudioUI
          ? 'English after each phrase'
          : 'No English after each phrase',
        enabled: meaningAudioUI,
        iconOn: 'message-circle',
        iconOff: 'message-circle',
        // Same rule as practice: the coach-voice master gate silences the
        // segment outright, so the item reads as unavailable rather than
        // claiming a control that would do nothing.
        disabled: !coachVoiceEnabled,
        onToggle: toggleMeaningAudio,
      },
    ],
    [
      silentModeUI,
      spokenEnabled,
      meaningAudioUI,
      coachVoiceEnabled,
      toggleSilentMode,
      toggleSpokenFeedback,
      toggleMeaningAudio,
    ],
  );

  const audioCacheRef = React.useRef(new Map<number, { audioBase64: string; format: string }>());

  // Per-session cache for the synthesized English meaning clips, keyed by
  // phrase id alone: the meaning segment always speaks English, so the phrase
  // cache's key shape does not apply. Practice parity (meaningCacheRef there).
  const meaningCacheRef = React.useRef(
    new Map<number, { audioBase64: string; format: string }>(),
  );

  const playCoach = React.useCallback(async () => {
    if (!phrase) return;
    if (!coachVoiceRef.current) return; // Coach voice master gate
    stopPlayback();
    const token = playTokenRef.current;
    try {
      setCoachPlaying(true);
      const cached = audioCacheRef.current.get(phrase.id);
      const res =
        cached ??
        (await synth.mutateAsync({
          data: { text: phrase.nativeScript, languageName: activeLanguage?.name },
        }));
      audioCacheRef.current.set(phrase.id, {
        audioBase64: res.audioBase64,
        format: res.format || 'mp3',
      });
      if (token !== playTokenRef.current) return;
      // Second segment of the play chain (Task 1046, practice parity): after
      // the phrase clip ends, a short pause, then the English meaning in an
      // English voice. Best-effort by design: any synthesis or playback
      // failure here falls back silently to the phrase-only behavior.
      const synthMeaning = async () => {
        const cachedMeaning = meaningCacheRef.current.get(phrase.id);
        if (cachedMeaning) return cachedMeaning;
        const fresh = await synth.mutateAsync({
          data: {
            // Review has no stage flag on its phrases, so the shared helper's
            // own rules (sentence-final punctuation, six-or-more words) decide
            // whether the meaning is prefixed.
            text: meaningSpeechText(phrase.english),
            languageName: 'English',
            languageCode: 'en',
          },
        });
        const entry = {
          audioBase64: fresh.audioBase64,
          format: fresh.format || 'mp3',
        };
        meaningCacheRef.current.set(phrase.id, entry);
        return entry;
      };
      // Pre-warm the meaning clip while the phrase clip plays so the beat
      // after it stays near MEANING_SEGMENT_PAUSE_MS even on a cold cache. On
      // failure the handle resets so playMeaning retries fresh and keeps
      // owning the fail-silent fallback.
      let meaningPrewarm: ReturnType<typeof synthMeaning> | null = null;
      const meaningOn = await readMeaningPref();
      if (token !== playTokenRef.current) return;
      if (meaningOn && phrase.english) {
        const prewarm = synthMeaning();
        meaningPrewarm = prewarm;
        prewarm.catch(() => {
          if (meaningPrewarm === prewarm) meaningPrewarm = null;
        });
      }
      const playMeaning = async () => {
        if (token !== playTokenRef.current) return;
        // Read the preference fresh at play time so a toggle flip applies to
        // the very next play without a reload (practice parity).
        if (!meaningPrefRef.current || !phrase.english) {
          setCoachPlaying(false);
          return;
        }
        try {
          // The pause and the (pre-warmed or fresh) synthesis overlap so the
          // gap between the two segments stays close to the intended beat.
          const [meaningRes] = await Promise.all([
            meaningPrewarm ?? synthMeaning(),
            new Promise((resolve) =>
              setTimeout(resolve, MEANING_SEGMENT_PAUSE_MS),
            ),
          ]);
          if (token !== playTokenRef.current) return;
          playbackRef.current = await playBase64Audio(
            meaningRes.audioBase64,
            meaningRes.format || 'mp3',
            () => {
              if (token === playTokenRef.current) setCoachPlaying(false);
            },
          );
          if (token !== playTokenRef.current) {
            playbackRef.current?.stop();
            playbackRef.current = null;
          }
        } catch {
          // Fail silent to phrase-only: the phrase clip already played in
          // full, so simply drop back as if the meaning were off.
          if (token === playTokenRef.current) setCoachPlaying(false);
        }
      };
      playbackRef.current = await playBase64Audio(res.audioBase64, res.format || 'mp3', () => {
        // coachPlaying (and the disabled listen buttons) span the meaning
        // segment too, so the whole chain rides one playback token: barge-in
        // and iOS routing need no extra handling.
        void playMeaning();
      });
      if (token !== playTokenRef.current) {
        playbackRef.current?.stop();
        playbackRef.current = null;
      }
    } catch {
      if (token === playTokenRef.current) setCoachPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id, activeLanguage?.name]);

  React.useEffect(() => {
    if (!phrase) return;
    let cancelled = false;
    void (async () => {
      const silent = await loadSilentMode();
      if (cancelled) return;
      if (phaseRef.current !== 'idle') return;
      if (!silent) playCoach();
    })();
    return () => {
      cancelled = true;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  React.useEffect(() => {
    let cancelled = false;
    const upcoming = list[index + 1];
    if (!upcoming) return;
    void (async () => {
      const silent = await loadSilentMode();
      if (cancelled || silent) return;
      if (audioCacheRef.current.has(upcoming.id)) return;
      try {
        const res = await synth.mutateAsync({
          data: { text: upcoming.nativeScript, languageName: activeLanguage?.name },
        });
        if (cancelled) return;
        audioCacheRef.current.set(upcoming.id, {
          audioBase64: res.audioBase64,
          format: res.format || 'mp3',
        });
      } catch {
        // Best-effort prefetch — playCoach handles on-demand synthesis.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, list.length, activeLanguage?.name]);

  React.useEffect(() => () => stopPlayback(), [stopPlayback]);
  React.useEffect(() => () => stopSelfPlayback(), [stopSelfPlayback]);

  React.useEffect(() => {
    if (phase !== 'result' || !result) return;
    if (!spokenEnabled || !coachVoiceEnabled) return;
    const pending = feedbackAudioRef.current;
    if (!pending) return;
    stopPlayback();
    const token = playTokenRef.current;
    void (async () => {
      try {
        const res = await pending;
        if (!res) return;
        if (token !== playTokenRef.current) return;
        playbackRef.current = await playBase64Audio(res.audioBase64, res.format || 'mp3', () => {});
        if (token !== playTokenRef.current) {
          playbackRef.current?.stop();
          playbackRef.current = null;
        }
      } catch {
        // A missed read-aloud shouldn't interrupt practice.
      }
    })();
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result, spokenEnabled, coachVoiceEnabled]);

  // Session-end celebration — confetti only when at least half of the phrases
  // ended in a passing band (Spec 1 gating; no confetti on rough sessions).
  React.useEffect(() => {
    if (phase === 'done') {
      const vals = Object.values(bands);
      const good = vals.filter((b) => isPassingBand(b)).length;
      if (vals.length > 0 && good * 2 >= vals.length) {
        // Celebratory sound gated on the same condition as confetti.
        playCue('session_complete');
        fireConfetti(4000);
      }
      if (vals.length > 0 && vals.every((b) => isFullCreditBand(b))) {
        hapticHeavy();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fireConfetti]);

  const sessionReadyRef = React.useRef(false);
  const recorderPreparedRef = React.useRef(false);
  const preparePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const prepareRecorder = React.useCallback((): Promise<boolean> => {
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const run = async (): Promise<boolean> => {
      try {
        if (!sessionReadyRef.current) {
          const ok = await prepareRecordingSession();
          if (!ok) return false;
          sessionReadyRef.current = true;
        }
        if (!recorderPreparedRef.current) {
          await prepareRecorderInSession(recorder);
          recorderPreparedRef.current = true;
        }
        return true;
      } catch (err) {
        // Bound, not swallowed. Which half threw is readable from the flag:
        // the session step sets it before the recorder step runs.
        reportAudioSessionFailure(
          sessionReadyRef.current ? 'prepare_recorder' : 'prepare_session',
          err,
        );
        return false;
      } finally {
        preparePromiseRef.current = null;
      }
    };
    preparePromiseRef.current = run();
    return preparePromiseRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  React.useEffect(() => {
    if (phase === 'idle') {
      void prepareRecorder();
    }
  }, [phase, prepareRecorder]);

  // 60ms poll (Spec D2): live waveform needs it; silence auto-stop is
  // wall-clock based so its timing is unaffected by the poll rate.
  const recorderState = useAudioRecorderState(recorder, 60);

  // ── Spec D2: live amplitude (see practice/[id].tsx for the pattern) ───
  const liveAmp = useSharedValue(0);
  const [ampLevel, setAmpLevel] = React.useState(0);
  const [noInput, setNoInput] = React.useState(false);
  const lastLoudAtRef = React.useRef(0);
  const meteringForAmp = recorderState?.metering;
  React.useEffect(() => {
    if (phase !== 'recording') {
      liveAmp.value = withTiming(0, { duration: 120 });
      setAmpLevel(0);
      setNoInput(false);
      lastLoudAtRef.current = 0;
      return;
    }
    if (typeof meteringForAmp !== 'number') return;
    const amp = meteringToAmplitude(meteringForAmp);
    liveAmp.value = withTiming(amp, { duration: 80 });
    if (prefersReducedMotion()) {
      setAmpLevel(Math.round(amp * 5) / 5);
    }
    const now = Date.now();
    if (lastLoudAtRef.current === 0) lastLoudAtRef.current = now;
    if (amp > 0.08) lastLoudAtRef.current = now;
    setNoInput(now - lastLoudAtRef.current > 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, meteringForAmp]);

  // Spec D2: mascot scale rides the live amplitude (1.0–1.08); disabled
  // under reduced motion, settles to 1 when liveAmp resets outside recording.
  const mascotAmpDisabled = prefersReducedMotion();
  const mascotAmpStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: mascotAmpDisabled
          ? 1
          : 1 + Math.min(1, Math.max(0, liveAmp.value)) * 0.08,
      },
    ],
  }));
  const silenceSinceRef = React.useRef<number | null>(null);
  const peakDbRef = React.useRef(-160);
  const metering = recorderState?.metering;

  React.useEffect(() => {
    if (phase !== 'recording') {
      silenceSinceRef.current = null;
      peakDbRef.current = -160;
      return;
    }
    if (typeof metering !== 'number') return;
    const now = Date.now();
    if (metering > peakDbRef.current) peakDbRef.current = metering;
    if (peakDbRef.current < SPEECH_MIN_DB) {
      silenceSinceRef.current = null;
      return;
    }
    const threshold = Math.max(SILENCE_THRESHOLD_DB, peakDbRef.current - SILENCE_DROP_DB);
    if (metering > threshold) {
      silenceSinceRef.current = now;
      return;
    }
    if (silenceSinceRef.current == null) {
      silenceSinceRef.current = now;
      return;
    }
    if (now - silenceSinceRef.current >= SILENCE_DURATION_MS) {
      silenceSinceRef.current = null;
      void stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, metering, recorderState]);

  const finishingRef = React.useRef(false);

  const startRecording = async () => {
    if (phase !== 'idle') return;
    stopPlayback();
    setEvalError(null);
    if (!recorderPreparedRef.current) {
      const ok = await prepareRecorder();
      if (!ok) {
        if (!sessionReadyRef.current) {
          Alert.alert('Microphone needed', 'Please allow microphone access to practice speaking.');
        } else {
          // Same copy as the catch below, deliberately. The tag is what
          // separates them: prepare came back false without throwing.
          reportAudioSessionFailure(
            'prepare_recorder',
            new Error('prepareRecorder returned false'),
            'prepare_failed',
          );
          Alert.alert('Recording failed', 'Could not start recording. Try again.');
        }
        return;
      }
    }
    try {
      await ensureRecordingMode();
      recorder.record();
      recorderPreparedRef.current = false;
      setPhaseSync('recording');
      hapticMedium();
      if (!isPressingRef.current) {
        void stopRecording();
      }
    } catch (err) {
      recorderPreparedRef.current = false;
      reportAudioSessionFailure('start_record', err, 'record_threw');
      Alert.alert('Recording failed', 'Could not start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhaseSync('evaluating');
    setEvalError(null);
    setSaveFailed(false);
    try {
      const audioBase64 = await stopAndReadRecording(recorder);
      lastRecordingBase64Ref.current = audioBase64;

      // Unsupported language: recognition can't hear it reliably, so we never
      // send an evaluation. Move straight to the compare stage — no score,
      // no band, no XP — where the learner listens, records, and compares.
      if (isUnsupported) {
        setComparedIdx((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(index);
          return nextSet;
        });
        setPhaseSync('compare');
        finishingRef.current = false;
        return;
      }

      const resRaw = await evaluate.mutateAsync({
        data: {
          phraseId: phrase.id,
          targetNative: phrase.nativeScript,
          targetRomanized: phrase.romanized,
          targetEnglish: phrase.english,
          languageName: activeLanguage?.name,
          audioBase64,
          mimeType: 'audio/m4a',
        },
      });
      // Normalize defensively: a stale/mixed-version server may still emit
      // legacy band names, which would leave the ladder with no highlighted
      // rung and fall through every band branch below.
      const res = { ...resRaw, band: normalizeBand(resRaw.band, resRaw.score) };

      const spokenText = [res.feedback, res.tip].filter(Boolean).join(' ');
      feedbackAudioRef.current =
        spokenText && spokenEnabled
          ? synth.mutateAsync({ data: { text: spokenText } }).catch(() => null)
          : null;

      setResult(res);
      setBands((prev) => ({ ...prev, [index]: res.band }));
      // The single write site for the attempt tally behind the advance gate.
      setAttempts((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + 1 }));
      // Accumulate across retries so the session chip matches the server's
      // per-attempt xp_ledger writes (overwriting under-reports on retakes).
      setXpData((prev) => ({
        ...prev,
        [index]: {
          xp: (prev[index]?.xp ?? 0) + res.xpAwarded,
          breakdown: res.xpBreakdown ?? null,
        },
      }));
      setPhaseSync('result');

      // Full-bleed color flash keyed to the five-band ladder color (nocatch
      // resolves to the neutral muted tone — a system miss is never red).
      const fColor = bandColor(res.band, colors);
      setFlashColor(fColor);
      flashOpacity.value = withSequence(
        withTiming(0.18, { duration: 150 }),
        withTiming(0, { duration: 250 }),
      );

      if (isPassingBand(res.band)) {
        consecutiveGoodRef.current += 1;
        const streak = consecutiveGoodRef.current;
        if (streak === 3 || streak === 5 || streak === 10) {
          const msg =
            streak === 3 ? '🔥 3 in a row!' : streak === 5 ? '🔥🔥 On a roll!' : '🔥🔥🔥 UNSTOPPABLE!';
          setToastMessage(msg);
          setToastKey((k) => k + 1);
          setCelebrateBounceCount((c) => c + 1);
        }
      } else {
        consecutiveGoodRef.current = 0;
      }

      // Band-driven feedback: full-credit bands (legacy 'nailed' group)
      // celebrate, half-credit bands get a gentle tap, retry warns. nocatch
      // is a system miss, not a learner error (Spec 1 rule 16): no negative
      // haptic, no wrong cue, no shake.
      if (isFullCreditBand(res.band)) {
        hapticNotify(Haptics.NotificationFeedbackType.Success);
        playCue('correct');
      } else if (isHalfCreditBand(res.band)) {
        hapticLight();
      } else if (res.band === 'retry') {
        hapticNotify(Haptics.NotificationFeedbackType.Warning);
        playCue('wrong');
        triggerShake();
      }

      // Confetti is reserved for the TOP band only.
      if (res.band === 'perfect') {
        fireConfetti();
        setTimeout(() => hapticHeavy(), 140);
      }
      // XP arc fires whenever XP was actually awarded (any passing band —
      // the half-credit group earns at the 0.5 band factor). retry/nocatch
      // award no XP.
      if (isPassingBand(res.band) && res.xpAwarded > 0) {
        // Measure where the result card lands, then launch the arc from it.
        if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
        xpArcTimerRef.current = setTimeout(() => {
          resultCardRef.current?.measureInWindow((x, y, w) => {
            setXpArc({
              key: Date.now(),
              amount: res.xpAwarded,
              from: { x: x + w / 2, y: y + 20 },
            });
          });
        }, 250);
      }

      try {
        const attempt = await createAttempt.mutateAsync({
          // canClaimGift: this build draws the gift box, so the server leaves
          // the day's Chai for the tap. A build without it sends nothing and
          // keeps being paid on its first attempt. Comes out with the shim.
          data: { evaluationToken: res.evaluationToken, canClaimGift: true },
        });
        // Invalidate review list so the badge count updates immediately when
        // the learner returns to the home screen.
        queryClient.invalidateQueries({ queryKey: getListReviewPhrasesQueryKey(reviewParams) });
        // Optimistic: increment todayXp immediately so the XP strip (and the
        // train class derived from it) reacts before the background refetch
        // resolves. THE one writer, shared with both practice screens — see
        // applyOptimisticTodayXp in @workspace/train-class.
        applyOptimisticTodayXp(queryClient, activeLang, res.xpAwarded);
        queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
        queryClient.invalidateQueries({ queryKey: getListRecentAttemptsQueryKey({ lang: activeLang }) });
        queryClient.invalidateQueries({ queryKey: getListBadgesQueryKey({ lang: activeLang }) });

        if (attempt.newlyEarnedBadges?.length) {
          setUnlockedBadges(attempt.newlyEarnedBadges);
        }
      } catch {
        setSaveFailed(true);
      }
    } catch (error) {
      // WHAT THE SERVER ACTUALLY SAID, for Metro and Sentry. The learner's
      // message is deliberately generic; this line is not (build 21: "i keep
      // seeing this" on the simulator, and nothing in any log to read).
      console.warn(
        '[review] scoring failed:',
        error instanceof ApiError
          ? `${error.status} ${error.method} ${error.url} ${JSON.stringify(error.data)}`
          : String(error),
      );
      setEvalError(describeEvaluationError(error));
      setPhaseSync('error');
      hapticNotify(Haptics.NotificationFeedbackType.Error);
    } finally {
      finishingRef.current = false;
    }
  };

  const next = () => {
    stopPlayback();
    stopSelfPlayback();
    lastRecordingBase64Ref.current = null;
    feedbackAudioRef.current = null;
    setResult(null);
    setSaveFailed(false);
    if (index + 1 < list.length) {
      const nextIdx = index + 1;
      if (!halfwayFiredRef.current && nextIdx === Math.floor(list.length / 2) && list.length > 2) {
        halfwayFiredRef.current = true;
        setToastMessage('Halfway there! 💪');
        setToastKey((k) => k + 1);
      } else if (!lastPhraseFiredRef.current && nextIdx === list.length - 1 && list.length > 1) {
        lastPhraseFiredRef.current = true;
        setToastMessage('Last one! 🦜 Finish strong!');
        setToastKey((k) => k + 1);
      }
      setIndex((i) => i + 1);
      setPhaseSync('idle');
    } else {
      setPhaseSync('done');
    }
  };

  const tryAgain = () => {
    stopSelfPlayback();
    lastRecordingBase64Ref.current = null;
    feedbackAudioRef.current = null;
    setResult(null);
    setSaveFailed(false);
    setPhaseSync('idle');
    void (async () => {
      const silent = await loadSilentMode();
      if (phaseRef.current !== 'idle') return;
      if (!silent) playCoach();
    })();
  };

  const retryAfterError = () => {
    setEvalError(null);
    setPhaseSync('idle');
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (phrases.isLoading) {
    return (
      <Screen>
        <ReviewHeader onClose={leave} label={isFlashback ? 'Flashback' : 'Review'} />
        <FunFactLoader color={colors.primary} style={{ marginTop: 80 }} />
      </Screen>
    );
  }

  // ── Empty — no phrases due ───────────────────────────────────────────────
  if (!phrases.isLoading && list.length === 0) {
    if (isFlashback) {
      // The effect above is already leaving; show nothing that could be read.
      return (
        <Screen>
          <FunFactLoader color={colors.primary} style={{ marginTop: 80 }} />
        </Screen>
      );
    }
    return (
      <Screen>
        <ReviewHeader onClose={leave} label={isFlashback ? 'Flashback' : 'Review'} />
        <View style={styles.emptyWrap}>
          <EmptyState
            title="Nothing due right now"
            body="Everything's still fresh."
            mascotPose="thumbsup"
          />
          <ChunkyButton
            title="Back to home"
            icon="home"
            onPress={leave}
            style={{ marginTop: 28, width: '100%' }}
          />
        </View>
      </Screen>
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const bandVals = Object.values(bands);
    const totalXp = Object.values(xpData).reduce((sum, d) => sum + d.xp, 0);
    // "Perfect session" = every phrase ended full-credit (legacy 'nailed'
    // group, unchanged behavior under the five-band split).
    const isPerfect = bandVals.length > 0 && bandVals.every((b) => isFullCreditBand(b));
    const anyPassed = bandVals.some((b) => isPassingBand(b));
    // Unsupported languages score nothing; the count comes from the ear-training
    // compare stages the learner completed.
    const reviewedCount = isUnsupported ? comparedIdx.size : bandVals.length;

    return (
      <Screen>
        <ReviewHeader onClose={leave} label="All done!" />
        <View style={styles.summaryWrap}>
          <Animated.View entering={appear(appearZoom(0))}>
            <Mascot pose="cheer" size={168} motion="bounce" />
          </Animated.View>
          <Animated.Text
            entering={skipEnter ? undefined : appearDown(120)}
            style={[
              styles.summaryTitle,
              isPerfect ? { color: '#D97706' } : { color: colors.foreground },
            ]}
          >
            {isUnsupported
              ? 'Nice practice! 🎧'
              : isPerfect
                ? isFlashback
                  ? 'PERFECT FLASHBACK! 🏆'
                  : 'PERFECT REVIEW! 🏆'
                : anyPassed
                  ? isFlashback
                    ? 'Flashback done!'
                    : 'Review complete!'
                  : 'Great effort!'}
          </Animated.Text>
          <Animated.Text
            entering={skipEnter ? undefined : appearDown(240)}
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            You reviewed {reviewedCount} {reviewedCount === 1 ? 'phrase' : 'phrases'}.
          </Animated.Text>
          {totalXp > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : appearDown(360)}
              style={[styles.xpChip, { backgroundColor: `${'#7C3AED'}18`, borderColor: '#7C3AED' }]}
            >
              <CountUpText
                value={totalXp}
                prefix="+"
                suffix=" XP"
                style={[styles.xpChipText, { color: '#7C3AED' }]}
              />
            </Animated.View>
          )}
          {Object.values(xpData).some((d) => d.breakdown) && (
            <Pressable
              onPress={() => setXpExpanded((x) => !x)}
              style={styles.xpBreakdownToggle}
              accessibilityRole="button"
            >
              <Text style={[styles.xpBreakdownLabel, { color: colors.mutedForeground }]}>
                {xpExpanded ? '▲ XP breakdown' : '▼ XP breakdown'}
              </Text>
            </Pressable>
          )}
          {xpExpanded && (
            <Animated.View
              entering={appearPlain()}
              style={[styles.xpBreakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {list.map((phrase, i) => {
                const d = xpData[i];
                if (!d) return null;
                return (
                  <View key={phrase.id} style={styles.xpBreakdownRow}>
                    <Text style={[styles.xpBreakdownPhrase, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {phrase.english}
                    </Text>
                    <Text style={[styles.xpBreakdownValue, { color: colors.foreground }]}>
                      {d.breakdown ?? (d.xp > 0 ? `+${d.xp} XP` : '0 XP')}
                    </Text>
                  </View>
                );
              })}
            </Animated.View>
          )}
          <ScoreTrail
            total={list.length}
            bands={bands}
            currentIndex={-1}
            colors={colors}
          />
          <ChunkyButton
            title={isFlashback ? 'On to the next stop' : 'Back to home'}
            icon={isFlashback ? 'arrow-right' : 'home'}
            onPress={leave}
            style={{ width: '100%', marginTop: 28 }}
          />
        </View>
        {celebrate ? (
          <Confetti
            variant={isPerfect ? 'perfect' : 'default'}
            glyphs={glyphsForLanguage(activeLang)}
          />
        ) : null}
        <BadgeUnlock badges={unlockedBadges} onDismiss={() => setUnlockedBadges([])} />
      </Screen>
    );
  }

  // ── Practice card ────────────────────────────────────────────────────────
  const progress =
    ((index + (phase === 'result' || phase === 'compare' ? 1 : 0)) / list.length) * 100;

  const mascotPose: MascotPose =
    phase === 'recording' || phase === 'evaluating'
      ? 'thinking'
      : phase === 'error'
        ? 'tryagain'
        : phase === 'compare'
          ? 'thumbsup' // ear-training practice always "counts" — never blame
          : phase === 'result' && result
            ? isFullCreditBand(result.band)
              ? 'cheer'
              : isHalfCreditBand(result.band)
                ? 'thumbsup'
                : result.band === 'nocatch'
                  ? 'thinking' // system miss, not learner error (Spec 1 rule 16)
                  : 'tryagain'
            : 'wave';

  const mascotMotion =
    phase === 'recording'
      ? 'sway'
      : phase === 'result' && result && isFullCreditBand(result.band)
        ? 'bounce'
        : 'float';

  return (
    <Screen>
      <ReviewHeader
        onClose={leave}
        label={isFlashback ? `Flashback ${index + 1} of ${list.length}` : `${index + 1} of ${list.length}`}
        settingsItems={settingsItems}
        languageCode={activeLang}
        rightAction={isFlashback ? { label: 'Skip', onPress: leave } : undefined}
      />

      <View style={styles.progressOuter}>
        <ScoreTrail total={list.length} bands={bands} currentIndex={index} colors={colors} />
        <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
          <View
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: colors.primary,
              borderRadius: 999,
            }}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.mascotRow}>
          <Animated.View style={mascotAmpStyle}>
            <Mascot
              pose={mascotPose}
              size={104}
              motion={mascotMotion}
              entering
              celebrateBounce={celebrateBounceCount}
            />
          </Animated.View>
        </View>

        <Animated.View
          key={phrase.id}
          entering={skipEnter ? undefined : appearPlain()}
          exiting={FadeOutUp.duration(200)}
          style={[styles.phraseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[nativeProps, styles.phraseNative, { color: colors.foreground }]}>
            {phrase.nativeScript}
          </Text>
          {/* Guarded like the game screens' romanized hints (#914): a phrase
              that ships no romanized form must not leave an empty slot.
              Curated content populates romanized for every language today,
              so this is a defensive rail, not a live gap. */}
          {phrase.romanized ? (
            <Text
              testID="review-phrase-romanized"
              style={[styles.phraseRoman, { color: colors.secondary }]}
            >
              {phrase.romanized}
            </Text>
          ) : null}
          <Text style={[styles.phraseEng, { color: colors.mutedForeground }]}>{phrase.english}</Text>

          <Pressable
            onPress={() => playCoach()}
            disabled={coachPlaying}
            style={[styles.listenBtn, { borderColor: colors.border }]}
          >
            <Feather name={coachPlaying ? 'volume-2' : 'play'} size={18} color={colors.primary} />
            <Text style={[styles.listenText, { color: colors.primary }]}>
              {coachPlaying ? 'Listening...' : 'Hear it'}
            </Text>
          </Pressable>
        </Animated.View>

        {phrase.hint && phase !== 'result' && phase !== 'compare' ? (
          <View style={styles.hintRow}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{phrase.hint}</Text>
          </View>
        ) : null}

        {/* Degraded recognition: one-time, dismissible "feedback is
            approximate" heads-up. Scored practice continues unchanged. */}
        {isDegraded && showApproxNotice ? (
          <View
            testID="approx-notice"
            accessibilityRole="alert"
            style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="info" size={16} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>
              Heads up: speech recognition is still learning {languageName}, so
              feedback may be approximate.
            </Text>
            <Pressable
              onPress={dismissApproxNotice}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notice"
              hitSlop={10}
              testID="approx-notice-dismiss"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}

        {/* Unsupported recognition: listen-record-compare card. No band, no
            score, no XP — supportive ear-training copy only. */}
        {phase === 'compare' ? (
          <Animated.View
            entering={appearPlain()}
            testID="compare-card"
            style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.gradeLabel, { color: colors.primary }]}>
              Nice, you recorded it! 🎧
            </Text>
            <Text style={[styles.feedback, { color: colors.foreground }]}>
              Speech recognition can't hear {languageName} reliably yet, so this
              is ear-training practice: listen, record, and compare. It still
              counts!
            </Text>

            <Pressable
              onPress={() => playCoach()}
              disabled={coachPlaying}
              accessibilityRole="button"
              accessibilityLabel={coachPlaying ? 'Listening to coach' : 'Play the target phrase'}
              testID="compare-play-target"
              style={[styles.listenBtn, { borderColor: colors.border, marginTop: 12 }]}
            >
              <Feather name={coachPlaying ? 'volume-2' : 'play'} size={18} color={colors.primary} />
              <Text style={[styles.listenText, { color: colors.primary }]}>
                {coachPlaying ? 'Listening...' : 'Play target'}
              </Text>
            </Pressable>

            <Pressable
              onPress={playSelf}
              accessibilityRole="button"
              accessibilityLabel={selfPlaying ? 'Stop playback' : 'Hear yourself'}
              testID="hear-yourself-button"
              style={[
                styles.hearSelfBtn,
                {
                  borderColor: selfPlaying ? colors.primary : colors.border,
                  backgroundColor: selfPlaying ? `${colors.primary}14` : 'transparent',
                },
              ]}
            >
              <Feather
                name={selfPlaying ? 'pause' : 'mic'}
                size={15}
                color={selfPlaying ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.hearSelfText,
                  { color: selfPlaying ? colors.primary : colors.mutedForeground },
                ]}
              >
                {selfPlaying ? 'Playing...' : 'Hear yourself'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {phase === 'error' && evalError ? (
          <View
            accessibilityRole="alert"
            testID="eval-error-card"
            style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.destructive }]}
          >
            <Text style={[styles.errorTitle, { color: colors.destructive }]}>Oops, that didn't work</Text>
            <Text style={[styles.feedback, { color: colors.foreground }]}>{evalError}</Text>
          </View>
        ) : null}

        {phase === 'result' && result ? (
          <Animated.View
            ref={resultCardRef}
            entering={appearPlain()}
            style={[
              styles.resultCard,
              {
                backgroundColor: `${bandColor(result.band, colors)}12`,
                borderColor: bandColor(result.band, colors),
              },
              shakeStyle,
            ]}
          >
            <Text style={[styles.gradeLabel, { color: bandColor(result.band, colors) }]}>
              {/* Headline copy is deliberately NOT BAND_LABEL: the ladder keeps
                saying Perfect/Great/Good/Almost/Try again. The bare else is the
                nocatch arm: a system miss is not a weak attempt, so it keeps
                the encouraging wording. Mirrored verbatim in practice/[id].tsx. */}
            {result.band === 'perfect'
                ? 'Peak 🗿'
                : result.band === 'great'
                  ? 'Goated 🐐'
                  : result.band === 'good'
                    ? 'Fire 🔥'
                    : result.band === 'almost'
                      ? 'Valid 👍'
                      : result.band === 'retry'
                        ? 'Mid 😐'
                        : 'Good try, keep going!'}
            </Text>

            {/* Five-band ladder for scored attempts; nocatch keeps its
                neutral pill below and never shows the ladder (rule 16). */}
            {result.band !== 'nocatch' ? <BandLadder band={result.band} /> : null}

            <View style={styles.resultTop}>
              {result.band === 'nocatch' ? <BandPill band={result.band} /> : null}
              <Pressable
                onPress={toggleSpokenFeedback}
                accessibilityRole="button"
                accessibilityLabel={spokenEnabled ? 'Turn off spoken feedback' : 'Turn on spoken feedback'}
                hitSlop={12}
                style={styles.muteBtn}
                testID="spoken-feedback-quick-toggle"
              >
                <Feather
                  name={spokenEnabled ? 'volume-2' : 'volume-x'}
                  size={22}
                  color={spokenEnabled ? bandColor(result.band, colors) : colors.mutedForeground}
                />
              </Pressable>
              {isFullCreditBand(result.band) ? (
                <Feather name="check-circle" size={40} color={bandColor(result.band, colors)} />
              ) : isHalfCreditBand(result.band) ? (
                // Half credit is not a failure — neutral icon, band-colored, no
                // retry affordance here (matches the practice screen's treatment).
                <Feather name="thumbs-up" size={40} color={bandColor(result.band, colors)} />
              ) : (
                <Pressable
                  onPress={tryAgain}
                  accessibilityRole="button"
                  accessibilityLabel="Try this phrase again"
                  hitSlop={12}
                  style={styles.resultRetryIcon}
                  testID="result-retry-icon"
                >
                  <Feather
                    name="refresh-cw"
                    size={40}
                    // nocatch is a system miss, not a learner error: keep the
                    // retry affordance but drop the destructive red so it
                    // doesn't read as blame.
                    color={
                      result.band === 'nocatch'
                        ? colors.mutedForeground
                        : bandColor(result.band, colors)
                    }
                  />
                </Pressable>
              )}
            </View>

            {result.transcript ? (
              <Text style={[styles.heard, { color: colors.foreground }]}>
                We heard: "{result.transcript}"
              </Text>
            ) : null}
            {/* Card-style romanized form of the transcript (#914, same rules
                as practice per Task 907): the server sends "" for scripts it
                cannot romanize cleanly and on nocatch, and an already-Latin
                transcript would just repeat — hide the line in both cases. */}
            {result.transcript &&
            result.transcriptRomanized &&
            result.transcriptRomanized.toLowerCase() !== result.transcript.toLowerCase() ? (
              <Text style={[styles.heardRomanized, { color: colors.mutedForeground }]}>
                "{result.transcriptRomanized}"
              </Text>
            ) : null}
            {result.feedback ? (
              <Text style={[styles.feedback, { color: colors.foreground }]}>{result.feedback}</Text>
            ) : null}
            {result.tip ? (
              <View style={[styles.tipBox, { backgroundColor: colors.card }]}>
                <Feather name="zap" size={14} color={colors.accent} />
                <Text style={[styles.tip, { color: colors.mutedForeground }]}>{result.tip}</Text>
              </View>
            ) : null}
            {saveFailed ? (
              <Text style={[styles.saveFailed, { color: colors.destructive }]}>
                Heads up — this attempt couldn't be saved to your progress.
              </Text>
            ) : null}

            <Pressable
              onPress={playSelf}
              accessibilityRole="button"
              accessibilityLabel={selfPlaying ? 'Stop playback' : 'Hear yourself'}
              testID="hear-yourself-button"
              style={[
                styles.hearSelfBtn,
                {
                  borderColor: selfPlaying ? bandColor(result.band, colors) : colors.border,
                  backgroundColor: selfPlaying ? `${bandColor(result.band, colors)}14` : 'transparent',
                },
              ]}
            >
              <Feather
                name={selfPlaying ? 'pause' : 'mic'}
                size={15}
                color={selfPlaying ? bandColor(result.band, colors) : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.hearSelfText,
                  { color: selfPlaying ? bandColor(result.band, colors) : colors.mutedForeground },
                ]}
              >
                {selfPlaying ? 'Playing...' : 'Hear yourself'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.controls, { backgroundColor: colors.background }]}>
        {phase === 'result' || phase === 'compare' || phase === 'error' ? (
          /* The same constant two-slot row as practice — same order, same
             labels, same gate (Task #1040). The ear-training compare stage
             produces no band, so it is ungated; the error card has nothing to
             advance from, so its advance slot stays inactive. */
          <ResultActions
            onRetry={phase === 'error' ? retryAfterError : tryAgain}
            onAdvance={next}
            advanceLabel={index + 1 < list.length ? 'Next phrase' : 'Finish'}
            retryPrimary={
              phase === 'error' ||
              (phase === 'result' && (!result || !isGoodOrBetterBand(result.band)))
            }
            advanceDisabled={
              phase === 'error' ||
              (phase === 'result' && !isAdvanceUnlocked(result?.band, attempts[index] ?? 0))
            }
          />
        ) : (
          <RecordButton
            phase={phase}
            unsupported={isUnsupported}
            onPressIn={() => {
              isPressingRef.current = true;
              if (phase === 'idle') void startRecording();
            }}
            onPressOut={() => {
              isPressingRef.current = false;
              if (phase === 'recording') void stopRecording();
            }}
            amplitude={liveAmp}
            ampLevel={ampLevel}
            noInput={noInput}
          />
        )}
      </View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: flashColor, zIndex: 50 }, flashOverlayStyle]}
      />
      {celebrate ? <Confetti /> : null}
      {xpArc ? (
        <XpArc
          key={xpArc.key}
          amount={xpArc.amount}
          from={xpArc.from}
          onDone={() => setXpArc(null)}
        />
      ) : null}
      <BadgeUnlock badges={unlockedBadges} onDismiss={() => setUnlockedBadges([])} />
      <MilestoneToast
        message={toastMessage}
        toastKey={toastKey}
        backgroundColor="#312E81"
        color="#FFFFFF"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  progressOuter: { paddingHorizontal: 20, paddingBottom: 8 },
  progressBg: { height: 8, borderRadius: 999, overflow: 'hidden' },
  scoreTrailOuter: { marginBottom: 8 },
  scoreTrailTooltip: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  scoreTrailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  scoreDot: { width: 10, height: 10, borderRadius: 5 },
  body: { padding: 20, paddingBottom: 24 },
  mascotRow: { alignItems: 'center', marginBottom: 4 },
  phraseCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },
  phraseNative: { fontSize: 40, textAlign: 'center', lineHeight: 56 },
  phraseRoman: {
    fontFamily: AppFonts.bold,
    fontSize: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  phraseEng: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    marginTop: 6,
    textAlign: 'center',
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  listenText: { fontFamily: AppFonts.bold, fontSize: 15 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  hint: { fontFamily: AppFonts.regular, fontSize: 13, flex: 1 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  noticeText: { fontFamily: AppFonts.regular, fontSize: 13, flex: 1, lineHeight: 19 },
  resultCard: { marginTop: 20, borderRadius: 20, borderWidth: 1.5, padding: 20 },
  gradeLabel: { fontFamily: AppFonts.extrabold, fontSize: 18, marginBottom: 8 },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muteBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    marginRight: 8,
  },
  resultRetryIcon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heard: { fontFamily: AppFonts.semibold, fontSize: 15, marginTop: 12, fontStyle: 'italic' },
  heardRomanized: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2, fontStyle: 'italic' },
  feedback: { fontFamily: AppFonts.regular, fontSize: 15, lineHeight: 22, marginTop: 10 },
  tipBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  tip: { fontFamily: AppFonts.regular, fontSize: 14, flex: 1, lineHeight: 20 },
  saveFailed: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 12 },
  hearSelfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 18,
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  hearSelfText: { fontFamily: AppFonts.semibold, fontSize: 14 },
  errorTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  controls: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  recordWrap: { alignItems: 'center', gap: 14 },
  recordCenter: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 88, height: 88, borderRadius: 44 },
  recordBtn: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  // Frame-stability contract: waveform and hint render in reserved fixed-
  // height slots so phase changes never move the record button mid-hold.
  waveSlot: { height: 22, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  hintSlot: { height: 40, alignSelf: 'stretch', alignItems: 'center' },
  recordHint: { fontFamily: AppFonts.semibold, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  emptyTitle: { fontFamily: AppFonts.extrabold, fontSize: 24, marginTop: 24, textAlign: 'center' },
  emptySub: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 280,
  },
  summaryWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 },
  summaryTitle: { fontFamily: AppFonts.extrabold, fontSize: 26, marginTop: 24 },
  summarySub: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 6, textAlign: 'center' },
  xpBreakdownToggle: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  xpBreakdownLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
  xpBreakdownCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    marginTop: 4,
  },
  xpBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  xpBreakdownPhrase: {
    flex: 1,
    fontFamily: AppFonts.regular,
    fontSize: 12,
  },
  xpBreakdownValue: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
  avgCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  avgLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
  avgValue: { fontFamily: AppFonts.extrabold, fontSize: 52, marginTop: 4 },
  xpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    marginTop: 12,
  },
  xpChipText: { fontFamily: AppFonts.extrabold, fontSize: 18 },
});
