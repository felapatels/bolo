import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioRecorder } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  useListCategoryPhrases,
  useSynthesizeSpeech,
  useEvaluatePronunciation,
  useCreateAttempt,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListCategoryPhrasesQueryKey,
  getListBadgesQueryKey,
  type PronunciationResult,
  type EarnedBadge,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { BadgeUnlock } from '@/components/BadgeUnlock';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Mascot, type MascotPose } from '@/components/Mascot';
import { Confetti } from '@/components/Confetti';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import {
  prepareRecordingSession,
  stopAndReadRecording,
  playBase64Audio,
  RECORDING_PRESET,
  type PlaybackHandle,
} from '@/lib/audio';
import { scoreColor } from '@/lib/ui';

type Phase = 'idle' | 'recording' | 'evaluating' | 'result' | 'done';

export default function PracticeScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const { activeLang, activeLanguage } = useLanguage();

  const phrases = useListCategoryPhrases(categoryId, activeLang);
  const list = phrases.data ?? [];

  const recorder = useAudioRecorder(RECORDING_PRESET);
  const synth = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();

  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [result, setResult] = React.useState<PronunciationResult | null>(null);
  const [scores, setScores] = React.useState<number[]>([]);
  const [coachPlaying, setCoachPlaying] = React.useState(false);
  const [unlockedBadges, setUnlockedBadges] = React.useState<EarnedBadge[]>([]);
  const [celebrate, setCelebrate] = React.useState(false);

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

  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const phrase = list[index];
  const nativeProps = nativeTextStyle(activeLanguage, { bold: true });

  const stopPlayback = React.useCallback(() => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setCoachPlaying(false);
  }, []);

  const playCoach = React.useCallback(async () => {
    if (!phrase) return;
    stopPlayback();
    try {
      setCoachPlaying(true);
      const res = await synth.mutateAsync({
        data: {
          text: phrase.nativeScript,
          languageName: activeLanguage?.name,
        },
      });
      playbackRef.current = await playBase64Audio(
        res.audioBase64,
        res.format || 'mp3',
        () => setCoachPlaying(false),
      );
    } catch {
      setCoachPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id, activeLanguage?.name]);

  // Auto-play the coach model once when a new phrase appears.
  React.useEffect(() => {
    if (phrase && phase === 'idle') {
      playCoach();
    }
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  React.useEffect(() => () => stopPlayback(), [stopPlayback]);

  // Celebrate finishing a whole session with a longer confetti shower.
  React.useEffect(() => {
    if (phase === 'done') fireConfetti(4000);
  }, [phase, fireConfetti]);

  const startRecording = async () => {
    stopPlayback();
    const ok = await prepareRecordingSession();
    if (!ok) {
      Alert.alert(
        'Microphone needed',
        'Please allow microphone access to practice speaking.',
      );
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
      Alert.alert('Recording failed', 'Could not start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    setPhase('evaluating');
    try {
      const audioBase64 = await stopAndReadRecording(recorder);
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
      setResult(res);
      setScores((prev) => [...prev, res.score]);
      setPhase('result');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          res.passed
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
      }

      // Bigger reward for a strong attempt: confetti rains on a high score, and
      // a solid pass gets an extra celebratory haptic pulse.
      if (res.score >= 90) {
        fireConfetti();
        if (Platform.OS !== 'web') {
          setTimeout(
            () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
            140,
          );
        }
      }

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
        queryKey: getListBadgesQueryKey({ lang: activeLang }),
      });

      // Celebrate any badges this attempt unlocked (server-authoritative list).
      if (attempt.newlyEarnedBadges?.length) {
        setUnlockedBadges(attempt.newlyEarnedBadges);
      }
    } catch {
      setPhase('idle');
      Alert.alert(
        'Something went wrong',
        'We could not score that recording. Please try again.',
      );
    }
  };

  const next = () => {
    setResult(null);
    if (index + 1 < list.length) {
      setIndex((i) => i + 1);
      setPhase('idle');
    } else {
      setPhase('done');
    }
  };

  const tryAgain = () => {
    setResult(null);
    setPhase('idle');
  };

  // --- Loading / empty ---
  if (phrases.isLoading) {
    return (
      <Screen>
        <ActivityIndicator
          color={colors.primary}
          size="large"
          style={{ marginTop: 80 }}
        />
      </Screen>
    );
  }
  if (list.length === 0) {
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="Practice" />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          No phrases to practice here yet.
        </Text>
      </Screen>
    );
  }

  // --- Summary ---
  if (phase === 'done') {
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    return (
      <Screen>
        <PracticeHeader onClose={() => router.back()} label="All done!" />
        <View style={styles.summaryWrap}>
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <Mascot pose="cheer" size={168} motion="bounce" />
          </Animated.View>
          <Animated.Text
            entering={FadeInDown.delay(150)}
            style={[styles.summaryTitle, { color: colors.foreground }]}
          >
            Session complete!
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(220)}
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            You practiced {scores.length}{' '}
            {scores.length === 1 ? 'phrase' : 'phrases'}.
          </Animated.Text>
          <Animated.View
            entering={ZoomIn.delay(300).springify().damping(13)}
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
          <ChunkyButton
            title="Back to home"
            icon="home"
            onPress={() => router.replace('/(app)/(tabs)')}
            style={{ width: '100%', marginTop: 28 }}
          />
        </View>
        {celebrate ? <Confetti /> : null}
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
          />
        </View>

        {/* Phrase card */}
        <View
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
            onPress={playCoach}
            disabled={coachPlaying}
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
        </View>

        {phrase.hint && phase !== 'result' ? (
          <View style={styles.hintRow}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {phrase.hint}
            </Text>
          </View>
        ) : null}

        {/* Result */}
        {phase === 'result' && result ? (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: `${scoreColor(result.score, colors)}12`,
                borderColor: scoreColor(result.score, colors),
              },
            ]}
          >
            <View style={styles.resultTop}>
              <View>
                <Text
                  style={[styles.resultLabel, { color: colors.mutedForeground }]}
                >
                  {result.passed ? 'Great job!' : 'Keep practicing'}
                </Text>
                <Text
                  style={[
                    styles.resultScore,
                    { color: scoreColor(result.score, colors) },
                  ]}
                >
                  {result.score}
                  <Text style={styles.resultScoreMax}> / 100</Text>
                </Text>
              </View>
              <Feather
                name={result.passed ? 'check-circle' : 'refresh-cw'}
                size={40}
                color={scoreColor(result.score, colors)}
              />
            </View>
            {result.transcript ? (
              <Text style={[styles.heard, { color: colors.foreground }]}>
                We heard: “{result.transcript}”
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
          </View>
        ) : null}
      </ScrollView>

      {/* Controls */}
      <View style={[styles.controls, { backgroundColor: colors.background }]}>
        {phase === 'result' ? (
          <View style={styles.resultButtons}>
            <Pressable
              onPress={tryAgain}
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
        ) : (
          <RecordButton
            phase={phase}
            onStart={startRecording}
            onStop={stopRecording}
          />
        )}
      </View>
      {celebrate ? <Confetti /> : null}
      <BadgeUnlock
        badges={unlockedBadges}
        onDismiss={() => setUnlockedBadges([])}
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
  onStart,
  onStop,
}: {
  phase: Phase;
  onStart: () => void;
  onStop: () => void;
}) {
  const colors = useColors();
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (phase === 'recording') {
      pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [phase, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.25 }],
    opacity: 0.35 - pulse.value * 0.25,
  }));

  const evaluating = phase === 'evaluating';
  const recording = phase === 'recording';

  return (
    <View style={styles.recordWrap}>
      <View style={styles.recordCenter}>
        <Animated.View
          style={[
            styles.pulseRing,
            { backgroundColor: colors.accent },
            ringStyle,
          ]}
        />
        <Pressable
          disabled={evaluating}
          onPress={recording ? onStop : onStart}
          style={[
            styles.recordBtn,
            {
              backgroundColor: recording ? colors.accent : colors.primary,
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
          : recording
            ? 'Tap to stop'
            : 'Tap and say it out loud'}
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
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 20,
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
});
