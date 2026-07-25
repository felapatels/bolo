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
import { hapticMedium, hapticHeavy, hapticNotify } from '@/lib/haptics';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useRouter } from 'expo-router';
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
  type PlaybackHandle,
} from '@/lib/audio';
import { loadSpokenFeedback, saveSpokenFeedback, loadSilentMode } from '@/lib/settings';
import { scoreColor } from '@/lib/ui';

type Phase = 'idle' | 'recording' | 'evaluating' | 'result' | 'error' | 'done';

// ── Score dot / trail ────────────────────────────────────────────────────────

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
      onPress={score !== null ? onPress : undefined}
      disabled={score === null}
      hitSlop={6}
      accessibilityRole={score !== null ? 'button' : undefined}
      accessibilityLabel={score !== null ? `Score: ${score}` : undefined}
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
  scores,
  currentIndex,
  colors,
}: {
  total: number;
  scores: Record<number, number>;
  currentIndex: number;
  colors: {
    success: string;
    gold: string;
    destructive: string;
    muted: string;
    primary: string;
    mutedForeground: string;
    foreground: string;
  };
}) {
  const [tooltip, setTooltip] = React.useState<{ idx: number; score: number } | null>(null);
  const tooltipTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipOpacity = useSharedValue(0);

  const showTooltip = React.useCallback(
    (idx: number, score: number) => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      setTooltip({ idx, score });
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

// ── Score ring ───────────────────────────────────────────────────────────────

const RING_R = 48;
const RING_STROKE = 9;
const RING_CIRCUM = 2 * Math.PI * RING_R;
const RING_SIZE = RING_R * 2 + RING_STROKE;

function ScoreRing({ score, color }: { score: number; color: string }) {
  const AnimatedCircle = React.useMemo(() => Animated.createAnimatedComponent(Circle), []);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(score / 100, { duration: 850 });
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUM * (1 - progress.value),
  }));

  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    if (score === 0) {
      setDisplay(0);
      return;
    }
    const DURATION = 700;
    const STEPS = 35;
    const intervalMs = DURATION / STEPS;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setDisplay(Math.round((score * step) / STEPS));
      if (step >= STEPS) clearInterval(timer);
    }, intervalMs);
    return () => {
      clearInterval(timer);
      setDisplay(score);
    };
  }, [score]);

  const center = RING_SIZE / 2;
  const trackColor = color + '28';

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        accessibilityElementsHidden
      >
        <Circle cx={center} cy={center} r={RING_R} fill="none" stroke={trackColor} strokeWidth={RING_STROKE} />
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
      <View style={{ alignItems: 'center' }} accessibilityLabel={`Pronunciation result: ${score} out of 100`}>
        <Text style={{ fontFamily: AppFonts.extrabold, fontSize: 30, color, lineHeight: 34 }}>{display}</Text>
        <Text style={{ fontFamily: AppFonts.semibold, fontSize: 11, color, opacity: 0.65 }}>/ 100</Text>
      </View>
    </View>
  );
}

// ── Error description ────────────────────────────────────────────────────────

function describeEvaluationError(error: unknown): string {
  if (error instanceof ApiError) {
    const status = (error as { status?: number }).status;
    if (status === 502) return "Bolo's squawker hit a snag 🦜 — give it another try!";
    if (status === 429) return "Whoa, that's a lot of practice! Wait a moment, then try again.";
    return 'Something went wrong while scoring. Please try again.';
  }
  if (error instanceof TypeError) return "Bolo flew out for a mango lassi 🥭 — check your connection and try again!";
  return 'Something went wrong while scoring. Please try again.';
}

// ── Header ───────────────────────────────────────────────────────────────────

function ReviewHeader({ onClose, label }: { onClose: () => void; label: string }) {
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
      <Text style={[styles.headerLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

// ── Record button ────────────────────────────────────────────────────────────

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
  const blocked = evaluating || coachPlaying;

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
            {
              backgroundColor: recording ? colors.accent : colors.primary,
              opacity: blocked && !evaluating ? 0.45 : 1,
            },
          ]}
        >
          {evaluating ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Feather name={recording ? 'square' : 'mic'} size={34} color="#fff" />
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

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ReviewScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeLang, activeLanguage } = useLanguage();

  const reviewParams = { lang: activeLang };
  const phrases = useListReviewPhrases(reviewParams, {
    query: {
      enabled: !!activeLang,
      queryKey: getListReviewPhrasesQueryKey(reviewParams),
    },
  });
  const list = phrases.data ?? [];

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
  const [scores, setScores] = React.useState<Record<number, number>>({});
  const [coachPlaying, setCoachPlaying] = React.useState(false);
  const [selfPlaying, setSelfPlaying] = React.useState(false);
  const lastRecordingBase64Ref = React.useRef<string | null>(null);
  const selfPlaybackRef = React.useRef<PlaybackHandle | null>(null);
  const selfPlayTokenRef = React.useRef(0);
  const [unlockedBadges, setUnlockedBadges] = React.useState<EarnedBadge[]>([]);
  const [celebrate, setCelebrate] = React.useState(false);
  const [evalError, setEvalError] = React.useState<string | null>(null);
  const [saveFailed, setSaveFailed] = React.useState(false);

  const consecutiveGoodRef = React.useRef(0);
  const [toastMessage, setToastMessage] = React.useState('');
  const [toastKey, setToastKey] = React.useState(0);
  const [celebrateBounceCount, setCelebrateBounceCount] = React.useState(0);
  const halfwayFiredRef = React.useRef(false);
  const lastPhraseFiredRef = React.useRef(false);

  const flashOpacity = useSharedValue(0);
  const [flashColor, setFlashColor] = React.useState('#10B981');
  const flashOverlayStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

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

  const audioCacheRef = React.useRef(new Map<number, { audioBase64: string; format: string }>());

  const playCoach = React.useCallback(async () => {
    if (!phrase) return;
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
      playbackRef.current = await playBase64Audio(res.audioBase64, res.format || 'mp3', () => {
        setCoachPlaying(false);
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
  }, [phase, result, spokenEnabled]);

  React.useEffect(() => {
    if (phase === 'done') {
      fireConfetti(4000);
      if (Object.keys(scores).length > 0 && Object.values(scores).every((s) => s >= 80)) {
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

  const recorderState = useAudioRecorderState(recorder, 250);
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

      const spokenText = [res.feedback, res.tip].filter(Boolean).join(' ');
      feedbackAudioRef.current =
        spokenText && spokenEnabled
          ? synth.mutateAsync({ data: { text: spokenText } }).catch(() => null)
          : null;

      setResult(res);
      setScores((prev) => ({ ...prev, [index]: res.score }));
      setPhaseSync('result');

      const fColor =
        res.score >= 70 ? colors.success : res.score >= 50 ? '#F59E0B' : colors.destructive;
      setFlashColor(fColor);
      flashOpacity.value = withSequence(
        withTiming(0.18, { duration: 150 }),
        withTiming(0, { duration: 250 }),
      );

      if (res.score >= 70) {
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

      hapticNotify(
        res.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );

      if (res.score >= 95) {
        fireConfetti();
        setTimeout(() => hapticHeavy(), 140);
      }

      try {
        const attempt = await createAttempt.mutateAsync({
          data: { evaluationToken: res.evaluationToken },
        });
        // Invalidate review list so the badge count updates immediately when
        // the learner returns to the home screen.
        queryClient.invalidateQueries({ queryKey: getListReviewPhrasesQueryKey(reviewParams) });
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
        <ReviewHeader onClose={() => router.back()} label="Review" />
        <FunFactLoader color={colors.primary} style={{ marginTop: 80 }} />
      </Screen>
    );
  }

  // ── Empty — no phrases due ───────────────────────────────────────────────
  if (!phrases.isLoading && list.length === 0) {
    return (
      <Screen>
        <ReviewHeader onClose={() => router.back()} label="Review" />
        <View style={styles.emptyWrap}>
          <Mascot pose="cheer" size={120} motion="float" />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            You're all caught up! 🎉
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            No phrases are due for review right now. Keep practicing to build your streak.
          </Text>
          <ChunkyButton
            title="Back to home"
            icon="home"
            onPress={() => router.replace('/(app)/(tabs)')}
            style={{ marginTop: 28, width: '100%' }}
          />
        </View>
      </Screen>
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
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
        <ReviewHeader onClose={() => router.replace('/(app)/(tabs)')} label="All done!" />
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
            {isPerfect ? 'PERFECT REVIEW! 🏆' : 'Review complete!'}
          </Animated.Text>
          <Animated.Text
            entering={skipEnter ? undefined : FadeInDown.delay(220)}
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            You reviewed {scoreVals.length} {scoreVals.length === 1 ? 'phrase' : 'phrases'}.
          </Animated.Text>
          <Animated.View
            entering={skipEnter ? undefined : ZoomIn.delay(300).springify().damping(13)}
            style={[styles.avgCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.avgLabel, { color: colors.mutedForeground }]}>Average score</Text>
            <Text style={[styles.avgValue, { color: scoreColor(avg, colors) }]}>{avg}</Text>
          </Animated.View>
          {xpEarned > 0 && (
            <Animated.View
              entering={skipEnter ? undefined : FadeInDown.delay(380)}
              style={[styles.xpChip, { backgroundColor: `${'#7C3AED'}18`, borderColor: '#7C3AED' }]}
            >
              <Text style={[styles.xpChipText, { color: '#7C3AED' }]}>+{xpEarned} XP</Text>
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
        <BadgeUnlock badges={unlockedBadges} onDismiss={() => setUnlockedBadges([])} />
      </Screen>
    );
  }

  // ── Practice card ────────────────────────────────────────────────────────
  const progress = ((index + (phase === 'result' ? 1 : 0)) / list.length) * 100;

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
      <ReviewHeader onClose={() => router.back()} label={`${index + 1} of ${list.length}`} />

      <View style={styles.progressOuter}>
        <ScoreTrail total={list.length} scores={scores} currentIndex={index} colors={colors} />
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
          <Mascot
            pose={mascotPose}
            size={104}
            motion={mascotMotion}
            entering
            celebrateBounce={celebrateBounceCount}
          />
        </View>

        <Animated.View
          key={phrase.id}
          entering={skipEnter ? undefined : FadeIn.duration(220)}
          exiting={FadeOutUp.duration(200)}
          style={[styles.phraseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[nativeProps, styles.phraseNative, { color: colors.foreground }]}>
            {phrase.nativeScript}
          </Text>
          <Text style={[styles.phraseRoman, { color: colors.secondary }]}>{phrase.romanized}</Text>
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

        {phrase.hint && phase !== 'result' ? (
          <View style={styles.hintRow}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{phrase.hint}</Text>
          </View>
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
            entering={FadeIn.duration(200)}
            style={[
              styles.resultCard,
              {
                backgroundColor: `${scoreColor(result.score, colors)}12`,
                borderColor: scoreColor(result.score, colors),
              },
            ]}
          >
            <Text style={[styles.gradeLabel, { color: scoreColor(result.score, colors) }]}>
              {result.score >= 90 ? 'Excellent 🌟' : result.score >= 70 ? 'Good 👍' : 'Keep trying 🔄'}
            </Text>

            <View style={styles.resultTop}>
              <ScoreRing score={result.score} color={scoreColor(result.score, colors)} />
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
                  color={spokenEnabled ? scoreColor(result.score, colors) : colors.mutedForeground}
                />
              </Pressable>
              {result.passed ? (
                <Feather name="check-circle" size={40} color={scoreColor(result.score, colors)} />
              ) : (
                <Pressable
                  onPress={tryAgain}
                  accessibilityRole="button"
                  accessibilityLabel="Try this phrase again"
                  hitSlop={12}
                  style={styles.resultRetryIcon}
                  testID="result-retry-icon"
                >
                  <Feather name="refresh-cw" size={40} color={scoreColor(result.score, colors)} />
                </Pressable>
              )}
            </View>

            {result.transcript ? (
              <Text style={[styles.heard, { color: colors.foreground }]}>
                We heard: "{result.transcript}"
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
                  borderColor: selfPlaying ? scoreColor(result.score, colors) : colors.border,
                  backgroundColor: selfPlaying ? `${scoreColor(result.score, colors)}14` : 'transparent',
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
                  { color: selfPlaying ? scoreColor(result.score, colors) : colors.mutedForeground },
                ]}
              >
                {selfPlaying ? 'Playing...' : 'Hear yourself'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>

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
          <ChunkyButton title="Try again" icon="rotate-ccw" onPress={retryAfterError} />
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

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: flashColor, zIndex: 50 }, flashOverlayStyle]}
      />
      {celebrate ? <Confetti /> : null}
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
  resultButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  pulseRing: { position: 'absolute', width: 88, height: 88, borderRadius: 44 },
  recordBtn: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  recordHint: { fontFamily: AppFonts.semibold, fontSize: 15 },
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
