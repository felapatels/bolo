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
import { hapticMedium, hapticHeavy, hapticNotify } from '@/lib/haptics';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutUp,
  ZoomIn,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { appear, useAppearSkip } from '@/lib/entrance';
import {
  useListCategoryPhrases,
  useListCategorySentences,
  getListCategorySentencesQueryKey,
  useSynthesizeSpeech,
  useEvaluatePronunciation,
  useCreateAttempt,
  useGetAccount,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListCategoryPhrasesQueryKey,
  getListBadgesQueryKey,
  type PronunciationResult,
  type EarnedBadge,
} from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { BadgeUnlock } from '@/components/BadgeUnlock';
import { ChunkyButton } from '@/components/ChunkyButton';
import { LessonError } from '@/components/LessonError';
import { FunFactLoader } from '@/components/FunFactLoader';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
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
  type PlaybackHandle,
} from '@/lib/audio';
import { loadSpokenFeedback, saveSpokenFeedback, loadSilentMode } from '@/lib/settings';
import { scoreColor } from '@/lib/ui';

type Phase = 'idle' | 'recording' | 'evaluating' | 'result' | 'error' | 'done';

// ── Score trail ──────────────────────────────────────────────────────────────

/**
 * One circular dot in the score trail.
 * The current-phrase dot breathes with a gentle scale pulse.
 */
function ScoreDot({
  score,
  isCurrent,
  dotColor,
  onPress,
  isSelected,
}: {
  score: number | null;
  isCurrent: boolean;
  dotColor: string;
  onPress?: () => void;
  isSelected: boolean;
}) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (isCurrent) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 650 }),
          withTiming(0.85, { duration: 650 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [isCurrent, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={score !== null ? onPress : undefined}
      disabled={score === null}
      hitSlop={6}
      accessibilityRole={score !== null ? 'button' : undefined}
      accessibilityLabel={score !== null ? `Score: ${score}` : undefined}
    >
      <Animated.View
        style={[
          styles.scoreDot,
          {
            backgroundColor: dotColor,
            borderWidth: isSelected ? 1.5 : 0,
            borderColor: '#fff',
          },
          animStyle,
        ]}
      />
    </Pressable>
  );
}

/** Row of colored dots — one per phrase — above the progress bar. */
function ScoreTrail({
  total,
  scores,
  currentIndex,
  colors,
}: {
  total: number;
  /** Keyed by phrase index; a missing key means that phrase hasn't been attempted yet. */
  scores: Record<number, number>;
  currentIndex: number;
  colors: { success: string; gold: string; destructive: string; muted: string; primary: string; mutedForeground: string; foreground: string };
}) {
  const [tooltip, setTooltip] = React.useState<{ idx: number; score: number } | null>(null);
  const tooltipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipOpacity = useSharedValue(0);

  const showTooltip = React.useCallback((idx: number, score: number) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip({ idx, score });
    tooltipOpacity.value = withTiming(1, { duration: 150 });
    tooltipTimer.current = setTimeout(() => {
      tooltipOpacity.value = withTiming(0, { duration: 200 });
      setTimeout(() => setTooltip(null), 210);
    }, 1800);
  }, [tooltipOpacity]);

  React.useEffect(() => {
    return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
  }, []);

  const tooltipStyle = useAnimatedStyle(() => ({ opacity: tooltipOpacity.value }));

  // Don't render at all until there's at least one phrase
  if (total === 0) return null;

  return (
    <View style={styles.scoreTrailOuter}>
      {tooltip !== null && (
        <Animated.Text style={[styles.scoreTrailTooltip, { color: colors.mutedForeground }, tooltipStyle]}>
          Phrase {tooltip.idx + 1}: {tooltip.score} / 100
        </Animated.Text>
      )}
      <View style={styles.scoreTrailRow}>
        {Array.from({ length: total }, (_, i) => {
          const score = scores[i] ?? null;
          const isCurrent = i === currentIndex;
          const dotColor =
            score !== null
              ? score >= 70
                ? colors.success
                : score >= 50
                  ? colors.gold
                  : colors.destructive
              : isCurrent
                ? colors.primary + '70'
                : colors.muted;
          return (
            <ScoreDot
              key={i}
              score={score}
              isCurrent={isCurrent}
              dotColor={dotColor}
              onPress={() => showTooltip(i, score!)}
              isSelected={tooltip?.idx === i}
            />
          );
        })}
      </View>
    </View>
  );
}

// ScoreRing — circular SVG arc that animates from 0 to the earned score,
// with a count-up number centred inside. Colors shift by band:
// green ≥80, amber 60–79, red below 60.
const RING_R = 48;
const RING_STROKE = 9;
const RING_CIRCUM = 2 * Math.PI * RING_R;
const RING_SIZE = RING_R * 2 + RING_STROKE;
function ScoreRing({ score, color }: { score: number; color: string }) {
  // createAnimatedComponent inside useMemo: avoids module-level Reanimated+SVG
  // evaluation on iOS New Architecture which can crash before any JS runs.
  const AnimatedCircle = React.useMemo(() => Animated.createAnimatedComponent(Circle), []);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(score / 100, { duration: 850 });
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUM * (1 - progress.value),
  }));

  // Count-up display for the centre number
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    if (score === 0) { setDisplay(0); return; }
    const DURATION = 700;
    const STEPS = 35;
    const intervalMs = DURATION / STEPS;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setDisplay(Math.round((score * step) / STEPS));
      if (step >= STEPS) clearInterval(timer);
    }, intervalMs);
    return () => { clearInterval(timer); setDisplay(score); };
  }, [score]);

  const center = RING_SIZE / 2;
  const trackColor = color + '28'; // ~16 % opacity track

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        accessibilityElementsHidden
      >
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={RING_R}
          fill="none"
          stroke={trackColor}
          strokeWidth={RING_STROKE}
        />
        {/* Animated progress arc */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUM}
          animatedProps={animatedProps}
        />
      </Svg>
      {/* Centred score number */}
      <View style={{ alignItems: 'center' }} accessibilityLabel={`Pronunciation result: ${score} out of 100`}>
        <Text style={{ fontFamily: AppFonts.extrabold, fontSize: 30, color, lineHeight: 34 }}>
          {display}
        </Text>
        <Text style={{ fontFamily: AppFonts.semibold, fontSize: 11, color, opacity: 0.65 }}>
          / 100
        </Text>
      </View>
    </View>
  );
}

// Turns whatever the evaluation pipeline threw into a short, actionable
// message for the learner (mirrors the web practice flow).
function describeEvaluationError(error: unknown): string {
  if (error instanceof ApiError) {
    const status = (error as { status?: number }).status;
    if (status === 502) {
      return "Bolo's squawker hit a snag 🦜 — give it another try!";
    }
    if (status === 429) {
      return "Whoa, that's a lot of practice! Wait a moment, then try again.";
    }
    return 'Something went wrong while scoring. Please try again.';
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the network is unreachable.
    return "Bolo flew out for a mango lassi 🥭 — check your connection and try again!";
  }
  return 'Something went wrong while scoring. Please try again.';
}

export default function PracticeScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id, phrase: startPhraseId, stage, skipMastered } = useLocalSearchParams<{
    id: string;
    phrase?: string;
    stage?: string;
    skipMastered?: string;
  }>();
  const categoryId = Number(id);
  const { activeLang, activeLanguage } = useLanguage();

  // `?stage=sentences` runs the same practice flow over the topic's Plus-only
  // sentence stage instead of its phrase list. The server enforces the gate —
  // a non-Plus deep link lands on the upgrade screen via the 402 below.
  const isSentences = stage === 'sentences';
  const phraseQuery = useListCategoryPhrases(categoryId, activeLang, {
    query: {
      enabled: !isSentences,
      queryKey: getListCategoryPhrasesQueryKey(categoryId, activeLang),
    },
  });
  const sentenceQuery = useListCategorySentences(categoryId, activeLang, {
    query: {
      enabled: isSentences,
      queryKey: getListCategorySentencesQueryKey(categoryId, activeLang),
    },
  });
  const phrases = isSentences ? sentenceQuery : phraseQuery;
  const list = phrases.data ?? [];

  // Read the learner's TTS voice preference so the client-side audio cache
  // key can include the voice ID. Without this, changing voice mid-session
  // still plays the old cached audio until a phrase is encountered for the
  // first time. Stale data is fine here — the account query is almost always
  // pre-fetched by an ancestor; we just need the ttsVoice field.
  const accountQuery = useGetAccount();
  const ttsVoice = accountQuery.data?.preferences.learning.ttsVoice ?? 'auto';

  const recorder = useAudioRecorder(RECORDING_PRESET);
  const synth = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();

  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('idle');
  // Ref mirror of phase so async callbacks can check current phase without
  // closing over a stale value — specifically to guard the auto-play flow
  // against the race where a learner taps record during the loadSilentMode()
  // await and recording starts before playCoach() would be called.
  const phaseRef = React.useRef<Phase>('idle');
  const setPhaseSync = React.useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const [result, setResult] = React.useState<PronunciationResult | null>(null);
  // Keyed by phrase index so retrying phrase N replaces that dot rather than
  // pushing a new score onto the next phrase's position.
  const [scores, setScores] = React.useState<Record<number, number>>({});
  const [coachPlaying, setCoachPlaying] = React.useState(false);
  const [selfPlaying, setSelfPlaying] = React.useState(false);
  /** The learner's own recording from the most recent attempt (base64 m4a). */
  const lastRecordingBase64Ref = React.useRef<string | null>(null);
  const selfPlaybackRef = React.useRef<PlaybackHandle | null>(null);
  /** Monotonic token — bumped on every stopSelfPlayback so post-await guards can detect staleness. */
  const selfPlayTokenRef = React.useRef(0);
  const [unlockedBadges, setUnlockedBadges] = React.useState<EarnedBadge[]>([]);
  const [celebrate, setCelebrate] = React.useState(false);
  const [evalError, setEvalError] = React.useState<string | null>(null);

  // ── Hot-streak & milestone toast state ──────────────────────────────────
  /** Consecutive scores ≥ 70 in this session. */
  const consecutiveGoodRef = React.useRef(0);
  /** Message shown in the MilestoneToast pill. */
  const [toastMessage, setToastMessage] = React.useState('');
  /** Increment to re-trigger the toast animation. */
  const [toastKey, setToastKey] = React.useState(0);
  /** Increment to trigger a one-shot bounce on the mascot. */
  const [celebrateBounceCount, setCelebrateBounceCount] = React.useState(0);
  /** Guards so each mid-session milestone fires at most once per session. */
  const halfwayFiredRef = React.useRef(false);
  const lastPhraseFiredRef = React.useRef(false);
  // When true, the attempt scored but saving progress failed — the learner
  // keeps their result and gets a gentle note instead of a silent reset.
  const [saveFailed, setSaveFailed] = React.useState(false);

  // ── Score flash overlay ──────────────────────────────────────────────────
  /** 0–0.18 animated opacity of the full-bleed color flash after scoring. */
  const flashOpacity = useSharedValue(0);
  /** The color of the flash overlay — set before the animation fires. */
  const [flashColor, setFlashColor] = React.useState('#10B981');
  const flashOverlayStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  // Tracks whether the learner's finger is currently held on the record button.
  // Guards the hold-to-speak startup race: if pressOut fires before the async
  // recorder startup completes, startRecording reads this after startup and
  // immediately calls stopRecording itself.
  const isPressingRef = React.useRef(false);

  const celebrateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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

  // Jump to a requested starting phrase once the list loads (a tap on a
  // phrase card passes `?phrase=`). Falls back to the start if the id isn't
  // in the list. Applied only once so mid-session refetches can't yank the
  // learner back to the starting phrase.
  const appliedStartRef = React.useRef(false);
  React.useEffect(() => {
    if (appliedStartRef.current || list.length === 0) return;
    appliedStartRef.current = true;
    if (startPhraseId != null) {
      const idx = list.findIndex((p) => p.id === Number(startPhraseId));
      if (idx > 0) setIndex(idx);
    } else if (skipMastered === 'true') {
      const idx = list.findIndex(
        (p) => !p.mastered || p.bestScore == null,
      );
      if (idx > 0) setIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const phrase = list[index];
  const nativeProps = nativeTextStyle(activeLanguage, { bold: true });

  // Each playback attempt gets a token; stopPlayback bumps it so any TTS
  // response still in flight for an earlier phrase (or an earlier tap) is
  // discarded instead of playing over the phrase now on screen.
  const playTokenRef = React.useRef(0);

  // Feedback-voice synthesis started as soon as the evaluation returns, so
  // the result card can play it with minimal extra wait.
  const feedbackAudioRef = React.useRef<Promise<{
    audioBase64: string;
    format?: string;
  } | null> | null>(null);

  // Spoken-feedback preference, shared with the Account screen toggle via
  // device storage. Mirrored in state so the result card's quick mute button
  // applies instantly.
  const [spokenEnabled, setSpokenEnabled] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    loadSpokenFeedback().then((enabled) => {
      if (!cancelled) setSpokenEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopPlayback = React.useCallback(() => {
    playTokenRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setCoachPlaying(false);
  }, []);

  const stopSelfPlayback = React.useCallback(() => {
    // Bump the token so any in-flight playSelf awaiting the handle discards it.
    selfPlayTokenRef.current += 1;
    selfPlaybackRef.current?.stop();
    selfPlaybackRef.current = null;
    setSelfPlaying(false);
  }, []);

  const playSelf = React.useCallback(async () => {
    const b64 = lastRecordingBase64Ref.current;
    if (!b64) return;
    // Toggle: if a handle is already live, stop it.
    // Use the ref (always current) not the `selfPlaying` state (stale in closure).
    if (selfPlaybackRef.current) {
      stopSelfPlayback();
      return;
    }
    // Stop coach audio so both don't overlap.
    stopPlayback();
    setSelfPlaying(true);
    const myToken = ++selfPlayTokenRef.current;
    try {
      const handle = await playBase64Audio(b64, 'm4a', () => {
        // Natural end of playback — clear state only if we're still the active play.
        if (selfPlayTokenRef.current === myToken) {
          selfPlaybackRef.current = null;
          setSelfPlaying(false);
        }
      });
      // Guard: stopSelfPlayback may have been called while we awaited the handle.
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
      // Muting mid-readout should silence the coach immediately.
      if (!nextEnabled) stopPlayback();
      return nextEnabled;
    });
  }, [stopPlayback]);

  // Replays reuse the first synthesized audio for a phrase: regenerating on
  // every tap sometimes yields a different (wrong) reading from the TTS model.
  // The key is `${phrase.id}:${ttsVoice}` so a mid-session voice change
  // automatically busts the old cached clip — the new voice is fetched fresh
  // for the very next play rather than waiting for a phrase the user hasn't
  // heard yet.
  const audioCacheRef = React.useRef(
    new Map<string, { audioBase64: string; format: string }>(),
  );

  const playCoach = React.useCallback(async () => {
    if (!phrase) return;
    stopPlayback();
    const token = playTokenRef.current;
    try {
      setCoachPlaying(true);
      const cacheKey = `${phrase.id}:${ttsVoice}`;
      const cached = audioCacheRef.current.get(cacheKey);
      const res =
        cached ??
        (await synth.mutateAsync({
          data: {
            text: phrase.nativeScript,
            languageName: activeLanguage?.name,
          },
        }));
      audioCacheRef.current.set(cacheKey, {
        audioBase64: res.audioBase64,
        format: res.format || 'mp3',
      });
      // The learner may have moved on (or re-tapped) while we waited for the
      // audio — this response belongs to the old word, so drop it silently.
      if (token !== playTokenRef.current) return;
      const onCoachDone = () => {
        setCoachPlaying(false);
      };
      playbackRef.current = await playBase64Audio(
        res.audioBase64,
        res.format || 'mp3',
        onCoachDone,
      );
      if (token !== playTokenRef.current) {
        playbackRef.current?.stop();
        playbackRef.current = null;
        return;
      }
    } catch {
      if (token === playTokenRef.current) setCoachPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id, activeLanguage?.name, ttsVoice]);

  // Auto-play the coach model once when a new phrase appears, unless the
  // learner has opted into silent mode (they prefer to read the phrase and
  // start recording without hearing the coach first). In auto-stop mode,
  // recording begins on its own once coach playback finishes (see onCoachDone).
  React.useEffect(() => {
    if (!phrase) return;
    let cancelled = false;
    void (async () => {
      const silent = await loadSilentMode();
      if (cancelled) return;
      // Guard against the race where the learner tapped record during the
      // async loadSilentMode() call: if phase is no longer idle, don't
      // start coach playback over an in-progress or completed recording.
      if (phaseRef.current !== 'idle') return;
      if (!silent) playCoach();
    })();
    return () => {
      cancelled = true;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  // Prefetch the next phrase's coach audio while the learner is still working
  // on the current one, so advancing to it feels instant. Skipped in silent
  // mode (no audio will be needed) and when the cache already has it.
  // ttsVoice is included so a voice change re-prefetches the upcoming phrase
  // in the new voice rather than serving a stale clip.
  React.useEffect(() => {
    let cancelled = false;
    const upcoming = list[index + 1];
    if (!upcoming) return;
    void (async () => {
      const silent = await loadSilentMode();
      if (cancelled || silent) return;
      const upcomingKey = `${upcoming.id}:${ttsVoice}`;
      if (audioCacheRef.current.has(upcomingKey)) return;
      try {
        const res = await synth.mutateAsync({
          data: {
            text: upcoming.nativeScript,
            languageName: activeLanguage?.name,
          },
        });
        if (cancelled) return;
        audioCacheRef.current.set(upcomingKey, {
          audioBase64: res.audioBase64,
          format: res.format || 'mp3',
        });
      } catch {
        // Best-effort — playCoach will synthesize on demand if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, list.length, activeLanguage?.name, ttsVoice]);

  React.useEffect(() => () => stopPlayback(), [stopPlayback]);
  React.useEffect(() => () => stopSelfPlayback(), [stopSelfPlayback]);

  // Read the coach's feedback + tip aloud when a score lands (mirrors the web
  // practice flow). The device-local "Spoken feedback" preference is read
  // fresh each time, so a toggle flipped on the Account screen applies to the
  // very next score. The playback token guards staleness: moving on, retrying,
  // or replaying the phrase bumps it and this audio is dropped or stopped.
  // Read the coach's feedback + tip aloud when a score lands, in the same
  // coach voice as the model phrase. Synthesis was kicked off the moment the
  // evaluation returned (see stopRecording), so by the time the card is on
  // screen the audio is usually ready or nearly so. The playback token guards
  // staleness: moving on, retrying, or muting bumps it and this audio is
  // dropped or stopped.
  React.useEffect(() => {
    if (phase !== 'result' || !result) return;
    if (!spokenEnabled) return;
    const pending = feedbackAudioRef.current;
    if (!pending) return;
    stopPlayback();
    const token = playTokenRef.current;
    void (async () => {
      try {
        const res = await pending;
        if (!res) return;
        if (token !== playTokenRef.current) return;
        playbackRef.current = await playBase64Audio(
          res.audioBase64,
          res.format || 'mp3',
          () => {},
        );
        if (token !== playTokenRef.current) {
          playbackRef.current?.stop();
          playbackRef.current = null;
        }
      } catch {
        // A missed read-aloud shouldn't interrupt practice; stay silent.
      }
    })();
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result, spokenEnabled]);

  // Celebrate finishing a whole session with a longer confetti shower.
  // If every phrase scored ≥ 80, fire a heavy haptic for the perfect-session moment.
  React.useEffect(() => {
    if (phase === 'done') {
      fireConfetti(4000);
      if (Object.keys(scores).length > 0 && Object.values(scores).every((s) => s >= 80)) {
        hapticHeavy();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fireConfetti]);

  // Warm up recording ahead of the tap: request permission + audio session
  // once, and run the recorder's prepare step whenever we're back in the idle
  // phase, so tapping record starts capturing immediately (no clipped first
  // syllable). Permission denial here is silent — the tap handler surfaces
  // the existing alert.
  const sessionReadyRef = React.useRef(false);
  const recorderPreparedRef = React.useRef(false);
  // A tap can land while the idle-phase warm-up is still in flight; share the
  // same prepare promise so we never double-prepare the recorder.
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
          // Serialized with audio-mode flips: the native prepare re-asserts
          // the playAndRecord category, which must not land mid-playback.
          await prepareRecorderInSession(recorder);
          recorderPreparedRef.current = true;
        }
        return true;
      } catch {
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

  // --- Silence auto-stop ---
  // A continuous stretch of quiet (metering stays below the threshold) ends
  // the recording on its own — a safety net so the learner never has to
  // release and re-hold if they paused too long mid-phrase.
  // The learner's hold-gesture release is still the primary stop action.
  const recorderState = useAudioRecorderState(recorder, 250);
  const silenceSinceRef = React.useRef<number | null>(null);
  // Loudest level heard this recording; the silence threshold adapts to it so
  // ordinary room tone (often above a fixed floor on phone mics) can't keep
  // resetting the countdown forever.
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
    // Don't arm auto-stop until the learner has actually said something —
    // otherwise ambient quiet before speaking would end the take early.
    if (peakDbRef.current < SPEECH_MIN_DB) {
      silenceSinceRef.current = null;
      return;
    }
    const threshold = Math.max(
      SILENCE_THRESHOLD_DB,
      peakDbRef.current - SILENCE_DROP_DB,
    );
    if (metering > threshold) {
      // Heard something — restart the silence countdown.
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

  // Prevents a manual stop and an auto-stop from both firing.
  const finishingRef = React.useRef(false);

  const startRecording = async () => {
    if (phase !== 'idle') return;
    stopPlayback();
    setEvalError(null);
    // Not-yet-prepared edge case (e.g. permission was denied on load, or
    // prepare is still in flight): prepare now, then start.
    if (!recorderPreparedRef.current) {
      const ok = await prepareRecorder();
      if (!ok) {
        if (!sessionReadyRef.current) {
          Alert.alert(
            'Microphone needed',
            'Please allow microphone access to practice speaking.',
          );
        } else {
          Alert.alert(
            'Recording failed',
            'Could not start recording. Try again.',
          );
        }
        return;
      }
    }
    try {
      // Coach playback flips iOS to playback-only mode for speaker routing;
      // re-assert recording mode (fast category switch, not the heavy
      // permission/prepare path) so capture actually starts.
      await ensureRecordingMode();
      recorder.record();
      // The prepared recorder is consumed by this recording; the idle-phase
      // effect re-prepares for the next one.
      recorderPreparedRef.current = false;
      // Only show "recording" once capture has actually started.
      setPhaseSync('recording');
      hapticMedium();
      // Guard: if the finger was lifted while async startup was in flight,
      // stop immediately so recording never outlasts the hold gesture.
      if (!isPressingRef.current) {
        void stopRecording();
      }
    } catch {
      recorderPreparedRef.current = false;
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
      // Stash the raw recording so the result card can play it back.
      lastRecordingBase64Ref.current = audioBase64;
      const res = await evaluate.mutateAsync({
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
      // Kick off feedback-voice synthesis NOW, in parallel with rendering the
      // result card and saving the attempt, so the coach's voice (the same
      // bubbly TTS voice as the model phrase) starts with minimal delay.
      const spokenText = [res.feedback, res.tip].filter(Boolean).join(' ');
      feedbackAudioRef.current =
        spokenText && spokenEnabled
          ? synth
              .mutateAsync({ data: { text: spokenText } })
              .catch(() => null)
          : null;
      setResult(res);
      setScores((prev) => ({ ...prev, [index]: res.score }));
      setPhaseSync('result');

      // Full-bleed color flash: green for pass ≥ 70, amber for near-miss 50–69, red for fail.
      const fColor =
        res.score >= 70
          ? colors.success
          : res.score >= 50
            ? '#F59E0B'
            : colors.destructive;
      setFlashColor(fColor);
      flashOpacity.value = withSequence(
        withTiming(0.18, { duration: 150 }),
        withTiming(0, { duration: 250 }),
      );

      // ── Hot-streak tracking ──────────────────────────────────────────────
      if (res.score >= 70) {
        consecutiveGoodRef.current += 1;
        const streak = consecutiveGoodRef.current;
        if (streak === 3 || streak === 5 || streak === 10) {
          const msg =
            streak === 3
              ? '🔥 3 in a row!'
              : streak === 5
                ? '🔥🔥 On a roll!'
                : '🔥🔥🔥 UNSTOPPABLE!';
          setToastMessage(msg);
          setToastKey((k) => k + 1);
          setCelebrateBounceCount((c) => c + 1);
        }
      } else {
        consecutiveGoodRef.current = 0;
      }

      hapticNotify(
        res.passed
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );

      // Bigger reward for a strong attempt: confetti rains on an excellent score, and
      // a solid pass gets an extra celebratory haptic pulse.
      if (res.score >= 95) {
        fireConfetti();
        setTimeout(() => hapticHeavy(), 140);
      }

      // The learner has their score — saving the attempt below must never
      // take the result away from them or silently reset the screen.
      try {
        // Record the attempt using the server-signed token only.
        const attempt = await createAttempt.mutateAsync({
          data: { evaluationToken: res.evaluationToken },
        });
        queryClient.invalidateQueries({
          queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
        });
        queryClient.invalidateQueries({
          queryKey: getListRecentAttemptsQueryKey({ lang: activeLang }),
        });
        queryClient.invalidateQueries({
          queryKey: getListCategoryPhrasesQueryKey(categoryId, activeLang),
        });
        queryClient.invalidateQueries({
          queryKey: getListCategorySentencesQueryKey(categoryId, activeLang),
        });
        queryClient.invalidateQueries({
          queryKey: getListBadgesQueryKey({ lang: activeLang }),
        });

        // Celebrate any badges this attempt unlocked (server-authoritative list).
        if (attempt.newlyEarnedBadges?.length) {
          setUnlockedBadges(attempt.newlyEarnedBadges);
        }
      } catch {
        setSaveFailed(true);
      }
    } catch (error) {
      // Scoring failed — show a visible, in-context error state with a retry
      // action instead of a fleeting alert or a silent reset to idle.
      setEvalError(describeEvaluationError(error));
      setPhaseSync('error');
      hapticNotify(Haptics.NotificationFeedbackType.Error);
    } finally {
      finishingRef.current = false;
    }
  };

  const next = () => {
    // Belt and braces: cut any in-flight feedback readout immediately.
    stopPlayback();
    stopSelfPlayback();
    lastRecordingBase64Ref.current = null;
    feedbackAudioRef.current = null;
    setResult(null);
    setSaveFailed(false);
    if (index + 1 < list.length) {
      const nextIdx = index + 1;
      // Mid-session milestone toasts — fire at the halfway phrase and the last phrase.
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
    // Replay the coach model so the learner hears it again before re-recording,
    // unless silent mode is on. In auto-stop mode, recording begins on its own
    // once playback finishes (see onCoachDone). Guard with phaseRef: if the
    // learner taps record during the async read, don't overlay playback.
    void (async () => {
      const silent = await loadSilentMode();
      if (phaseRef.current !== 'idle') return;
      if (!silent) playCoach();
    })();
  };

  // Leaving the error card returns to the mic, ready to record again.
  const retryAfterError = () => {
    setEvalError(null);
    setPhaseSync('idle');
  };

  // --- Loading / error / empty ---
  if (phrases.isLoading) {
    return (
      <Screen>
        <FunFactLoader color={colors.primary} style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  // A 402 means "upgrade required", not a generation failure — send the
  // learner to the paywall, mirroring the web UpgradeScreen. Any other failure
  // (e.g. a 502 when AI generation fails) is retry-able because nothing broken
  // was cached.
  const upgrade = asUpgradeRequired(phrases.error);
  if (upgrade) {
    return (
      <UpgradeRequiredScreen
        title={
          upgrade.reason === 'daily_lesson_limit'
            ? "You've hit today's free lessons"
            : upgrade.reason === 'feature_locked'
              ? 'Full sentences are a Plus feature'
              : 'Unlock this language'
        }
        message={upgrade.message}
        onUpgrade={() => router.push(paywallHrefForDenial(upgrade, activeLang))}
        onBack={() => router.back()}
      />
    );
  }
  if (phrases.isError) {
    return (
      <LessonError
        onRetry={() => phrases.refetch()}
        isRetrying={phrases.isFetching}
        onBack={() => router.back()}
      />
    );
  }
  if (list.length === 0) {
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="Practice" />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          {isSentences
            ? 'No sentences to practice here yet.'
            : 'No phrases to practice here yet.'}
        </Text>
      </Screen>
    );
  }

  // --- Summary ---
  if (phase === 'done') {
    const scoreVals = Object.values(scores);
    const avg =
      scoreVals.length > 0
        ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length)
        : 0;
    const isPerfect = scoreVals.length > 0 && scoreVals.every((s) => s >= 80);
    const xpEarned = Math.min(50, Math.round(avg / 10) * scoreVals.length);
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="All done!" />
        <View style={styles.summaryWrap}>
          <Animated.View entering={appear(ZoomIn.springify().damping(12))}>
            <Mascot pose="cheer" size={168} motion="bounce" />
          </Animated.View>
          <Animated.Text
            entering={skipEnter ? undefined : FadeInDown.delay(150)}
            style={[
              styles.summaryTitle,
              isPerfect ? { color: '#D97706' } : { color: colors.foreground },
            ]}
          >
            {isPerfect ? 'PERFECT SESSION! 🏆' : 'Session complete!'}
          </Animated.Text>
          <Animated.Text
            entering={skipEnter ? undefined : FadeInDown.delay(220)}
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            You practiced {scoreVals.length}{' '}
            {isSentences
              ? scoreVals.length === 1
                ? 'sentence'
                : 'sentences'
              : scoreVals.length === 1
                ? 'phrase'
                : 'phrases'}.
          </Animated.Text>
          <Animated.View
            entering={skipEnter ? undefined : ZoomIn.delay(300).springify().damping(13)}
            style={[
              styles.avgCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.avgLabel, { color: colors.mutedForeground }]}>
              Average score
            </Text>
            <Text style={[styles.avgValue, { color: scoreColor(avg, colors) }]}>
              {avg}
            </Text>
          </Animated.View>
          {/* Score trail — lets learners review each phrase's result at a glance */}
          {Object.keys(scores).length > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : FadeInDown.delay(340)}
              style={styles.summaryTrailWrap}
            >
              <Text style={[styles.summaryTrailLabel, { color: colors.mutedForeground }]}>
                Tap a dot to review
              </Text>
              <ScoreTrail
                total={list.length}
                scores={scores}
                currentIndex={-1}
                colors={colors}
              />
            </Animated.View>
          )}
          {/* XP earned chip */}
          {xpEarned > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : FadeInDown.delay(380)}
              style={[
                styles.xpChip,
                { backgroundColor: `${'#7C3AED'}18`, borderColor: '#7C3AED' },
              ]}
            >
              <Text style={[styles.xpChipText, { color: '#7C3AED' }]}>
                +{xpEarned} XP
              </Text>
            </Animated.View>
          )}
          <ChunkyButton
            title="Back to home"
            icon="home"
            onPress={() => router.replace('/(app)/(tabs)')}
            style={{ width: '100%', marginTop: 28 }}
          />
        </View>
        {celebrate ? <Confetti variant={isPerfect ? 'perfect' : 'default'} /> : null}
        <BadgeUnlock
          badges={unlockedBadges}
          onDismiss={() => setUnlockedBadges([])}
        />
      </Screen>
    );
  }

  // --- Practice card ---
  const progress = ((index + (phase === 'result' ? 1 : 0)) / list.length) * 100;

  // Bolo reacts to the moment: listening while you record, cheering a big win,
  // encouraging a good attempt, and gently nudging after a miss.
  const mascotPose: MascotPose =
    phase === 'recording' || phase === 'evaluating'
      ? 'thinking'
      : phase === 'error'
        ? 'tryagain'
        : phase === 'result' && result
          ? result.score >= 90
            ? 'cheer'
            : result.passed
              ? 'thumbsup'
              : 'tryagain'
          : 'wave';
  const mascotMotion =
    phase === 'recording'
      ? 'sway'
      : phase === 'result' && result?.score != null && result.score >= 90
        ? 'bounce'
        : 'float';

  return (
    <Screen>
      <PracticeHeader
        onClose={() => router.back()}
        label={`${index + 1} of ${list.length}`}
      />
      <View style={styles.progressOuter}>
        <ScoreTrail
          total={list.length}
          scores={scores}
          currentIndex={index}
          colors={colors}
        />
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

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Reacting mascot */}
        <View style={styles.mascotRow}>
          <Mascot
            pose={mascotPose}
            size={104}
            motion={mascotMotion}
            entering
            celebrateBounce={celebrateBounceCount}
          />
        </View>

        {/* Phrase card — keyed so entering/exiting fires on phrase change */}
        <Animated.View
          key={phrase.id}
          entering={skipEnter ? undefined : FadeIn.duration(220)}
          exiting={FadeOutUp.duration(200)}
          style={[
            styles.phraseCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[nativeProps, styles.phraseNative, { color: colors.foreground }]}>
            {phrase.nativeScript}
          </Text>
          <Text style={[styles.phraseRoman, { color: colors.secondary }]}>
            {phrase.romanized}
          </Text>
          <Text style={[styles.phraseEng, { color: colors.mutedForeground }]}>
            {phrase.english}
          </Text>

          <Pressable
            onPress={() => {
              playCoach();
            }}
            disabled={coachPlaying}
            accessibilityLabel={coachPlaying ? 'Listening to coach' : 'Listen to coach'}
            style={[styles.listenBtn, { borderColor: colors.border }]}
          >
            <Feather
              name={coachPlaying ? 'volume-2' : 'play'}
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.listenText, { color: colors.primary }]}>
              {coachPlaying ? 'Listening...' : 'Hear it'}
            </Text>
          </Pressable>
        </Animated.View>

        {phrase.hint && phase !== 'result' ? (
          <View style={styles.hintRow}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {phrase.hint}
            </Text>
          </View>
        ) : null}

        {/* Scoring error */}
        {phase === 'error' && evalError ? (
          <View
            accessibilityRole="alert"
            testID="eval-error-card"
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.destructive,
              },
            ]}
          >
            <Text style={[styles.errorTitle, { color: colors.destructive }]}>
              Oops, that didn't work
            </Text>
            <Text style={[styles.feedback, { color: colors.foreground }]}>
              {evalError}
            </Text>
          </View>
        ) : null}

        {/* Result */}
        {phase === 'result' && result ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[
              styles.resultCard,
              {
                backgroundColor: `${scoreColor(result.score, colors)}12`,
                borderColor: scoreColor(result.score, colors),
              },
            ]}
          >
            {/* Grade label row */}
            <Text
              style={[styles.gradeLabel, { color: scoreColor(result.score, colors) }]}
            >
              {result.score >= 90
                ? 'Excellent 🌟'
                : result.score >= 70
                  ? 'Good 👍'
                  : 'Keep trying 🔄'}
            </Text>

            <View style={styles.resultTop}>
              <ScoreRing
                score={result.score}
                color={scoreColor(result.score, colors)}
              />
              <Pressable
                onPress={toggleSpokenFeedback}
                accessibilityRole="button"
                accessibilityLabel={
                  spokenEnabled
                    ? 'Turn off spoken feedback'
                    : 'Turn on spoken feedback'
                }
                hitSlop={12}
                style={styles.muteBtn}
                testID="spoken-feedback-quick-toggle"
              >
                <Feather
                  name={spokenEnabled ? 'volume-2' : 'volume-x'}
                  size={22}
                  color={
                    spokenEnabled
                      ? scoreColor(result.score, colors)
                      : colors.mutedForeground
                  }
                />
              </Pressable>
              {result.passed ? (
                <Feather
                  name="check-circle"
                  size={40}
                  color={scoreColor(result.score, colors)}
                />
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
                    color={scoreColor(result.score, colors)}
                  />
                </Pressable>
              )}
            </View>
            {result.transcript ? (
              <Text style={[styles.heard, { color: colors.foreground }]}>
                We heard: "{result.transcript}"
              </Text>
            ) : null}
            {result.feedback ? (
              <Text style={[styles.feedback, { color: colors.foreground }]}>
                {result.feedback}
              </Text>
            ) : null}
            {result.tip ? (
              <View style={[styles.tipBox, { backgroundColor: colors.card }]}>
                <Feather name="zap" size={14} color={colors.accent} />
                <Text style={[styles.tip, { color: colors.mutedForeground }]}>
                  {result.tip}
                </Text>
              </View>
            ) : null}
            {saveFailed ? (
              <Text style={[styles.saveFailed, { color: colors.destructive }]}>
                Heads up — this attempt couldn't be saved to your progress.
              </Text>
            ) : null}
            {/* Hear yourself — always shown so learners can compare their
                voice to the coach model. Not affected by spoken-feedback mute. */}
            <Pressable
              onPress={playSelf}
              accessibilityRole="button"
              accessibilityLabel={selfPlaying ? 'Stop playback' : 'Hear yourself'}
              testID="hear-yourself-button"
              style={[
                styles.hearSelfBtn,
                {
                  borderColor: selfPlaying
                    ? scoreColor(result.score, colors)
                    : colors.border,
                  backgroundColor: selfPlaying
                    ? `${scoreColor(result.score, colors)}14`
                    : 'transparent',
                },
              ]}
            >
              <Feather
                name={selfPlaying ? 'pause' : 'mic'}
                size={15}
                color={selfPlaying ? scoreColor(result.score, colors) : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.hearSelfText,
                  {
                    color: selfPlaying
                      ? scoreColor(result.score, colors)
                      : colors.mutedForeground,
                  },
                ]}
              >
                {selfPlaying ? 'Playing...' : 'Hear yourself'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Controls */}
      <View style={[styles.controls, { backgroundColor: colors.background }]}>
        {phase === 'result' ? (
          <View style={styles.resultButtons}>
            <Pressable
              onPress={tryAgain}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              testID="retry-button"
              style={[styles.retryBtn, { borderColor: colors.border }]}
            >
              <Feather name="rotate-ccw" size={20} color={colors.foreground} />
            </Pressable>
            <ChunkyButton
              title={index + 1 < list.length ? 'Next phrase' : 'Finish'}
              icon="arrow-right"
              onPress={next}
              style={{ flex: 1 }}
            />
          </View>
        ) : phase === 'error' ? (
          <ChunkyButton
            title="Try again"
            icon="rotate-ccw"
            onPress={retryAfterError}
          />
        ) : (
          <RecordButton
            phase={phase}
            coachPlaying={coachPlaying}
            onPressIn={() => {
              isPressingRef.current = true;
              if (phase === 'idle') void startRecording();
            }}
            onPressOut={() => {
              isPressingRef.current = false;
              if (phase === 'recording') void stopRecording();
            }}
          />
        )}
      </View>
      {/* Score flash overlay — full-bleed color pulse after each scored attempt */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: flashColor, zIndex: 50 },
          flashOverlayStyle,
        ]}
      />
      {celebrate ? <Confetti /> : null}
      <BadgeUnlock
        badges={unlockedBadges}
        onDismiss={() => setUnlockedBadges([])}
      />
      <MilestoneToast
        message={toastMessage}
        toastKey={toastKey}
        backgroundColor="#312E81"
        color="#FFFFFF"
      />
    </Screen>
  );
}

function PracticeHeader({
  onClose,
  label,
}: {
  onClose: () => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Close practice"
        onPress={onClose}
        style={[styles.closeBtn, { backgroundColor: colors.card }]}
      >
        <Feather name="x" size={22} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <View style={{ width: 44 }} />
    </View>
  );
}


function RecordButton({
  phase,
  coachPlaying,
  onPressIn,
  onPressOut,
}: {
  phase: Phase;
  coachPlaying: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const colors = useColors();
  const pulse = useSharedValue(0);
  // 0 = idle/recording (primary), 1 = evaluating (amber)
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
    const ringBg = interpolateColor(
      ringPhaseVal.value,
      [0, 1],
      [primaryColor, amberColor],
    );
    return {
      transform: [{ scale: 1 + pulse.value * 0.25 }],
      opacity: 0.35 - pulse.value * 0.25,
      backgroundColor: ringBg,
    };
  });

  const evaluating = phase === 'evaluating';
  const recording = phase === 'recording';
  // Disable the mic while the coach is speaking so a hold can't start
  // recording over or ahead of the phrase playback.
  const blocked = evaluating || coachPlaying;

  return (
    <View style={styles.recordWrap}>
      <View style={styles.recordCenter}>
        <Animated.View
          style={[
            styles.pulseRing,
            ringStyle,
          ]}
        />
        <Pressable
          disabled={blocked}
          testID="record-button"
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Hold to record'}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[
            styles.recordBtn,
            {
              backgroundColor: recording ? colors.accent : colors.primary,
              opacity: blocked && !evaluating ? 0.45 : 1,
            },
          ]}
        >
          {evaluating ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Feather
              name={recording ? 'square' : 'mic'}
              size={34}
              color="#fff"
            />
          )}
        </Pressable>
      </View>
      <Text style={[styles.recordHint, { color: colors.mutedForeground }]}>
        {evaluating
          ? 'Scoring your pronunciation...'
          : coachPlaying
            ? 'Listen first...'
            : recording
              ? 'Release to score'
              : 'Hold and say it out loud'}
      </Text>
    </View>
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
  scoreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
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
  resultCard: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
  },
  gradeLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    marginBottom: 8,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
  resultScore: { fontFamily: AppFonts.extrabold, fontSize: 44, marginTop: 2 },
  resultScoreMax: { fontFamily: AppFonts.bold, fontSize: 18 },
  heard: {
    fontFamily: AppFonts.semibold,
    fontSize: 15,
    marginTop: 12,
    fontStyle: 'italic',
  },
  feedback: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  tipBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  tip: { fontFamily: AppFonts.regular, fontSize: 14, flex: 1, lineHeight: 20 },
  controls: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  resultButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  retryBtn: {
    width: 56,
    height: 56,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordWrap: { alignItems: 'center', gap: 14 },
  recordCenter: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  recordBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordHint: { fontFamily: AppFonts.semibold, fontSize: 15 },
  errorTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
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

  note: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 60,
  },
  summaryWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 },
  trophy: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  summaryTitle: { fontFamily: AppFonts.extrabold, fontSize: 26, marginTop: 24 },
  summarySub: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
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
  summaryTrailWrap: { alignItems: 'center', marginTop: 20, gap: 6 },
  summaryTrailLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  resultScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
});
