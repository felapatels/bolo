import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { appearPlain } from '@/lib/entrance';
import { Redirect, useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useGetDailyQuiz,
  useCompleteDailyQuiz,
  getGetDailyQuizQueryKey,
  useGetAccount,
  synthesizeSpeech,
  type QuizQuestion,
  type McqTranslationQuestion,
  type ListenIdentifyQuestion,
  type OrderWordsQuestion,
} from '@workspace/api-client-react';
import { playBase64Audio } from '@/lib/audio';
import { GameMuteButton, useGameAudio } from '@/components/GameMuteButton';
import { MissReviewCta, MissReviewModal, type GameMiss } from '@/components/GameMissReview';
import { confirmDiscardRun } from '@/lib/gameExit';

/** Mirror of server-side isCorrectAnswer for instant local score display. */
function localIsCorrect(q: QuizQuestion, ans: string | null): boolean {
  if (ans == null) return false;
  if (q.type === 'mcq_translation') return ans === q.correctEnglish;
  if (q.type === 'listen_identify') return ans === q.correctNativeScript;
  if (q.type === 'order_words') return ans.trim() === q.nativeScript.trim();
  return false;
}

/**
 * Describe a wrong question in the learner's own terms. The quiz keeps only a
 * numeric score, so the misses are derived from the questions + answers arrays
 * at completion. Each type is worded the way it was actually presented:
 *   - mcq_translation  the native-script phrase they were asked to translate,
 *                      romanization as the sub, English answer vs English.
 *   - listen_identify  there is no text prompt (they heard audio), so the
 *                      prompt states that; the answer/correct are the scripts.
 *   - order_words      the English they were assembling, with the native
 *                      answers shown.
 * A skipped question (no answer captured) passes answer: null.
 */
function describeMiss(q: QuizQuestion, ans: string | null): GameMiss {
  if (q.type === 'mcq_translation') {
    return {
      prompt: q.nativeScript,
      promptSub: q.romanized || null,
      answer: ans,
      correct: q.correctEnglish,
    };
  }
  if (q.type === 'listen_identify') {
    return {
      prompt: 'Which script matches the audio?',
      answer: ans,
      correct: q.correctNativeScript,
      // The reading belongs to the script it reads, not to the task line.
      correctSub: q.romanized || null,
    };
  }
  // order_words
  return {
    prompt: `Arrange to say: "${q.english}"`,
    answer: ans,
    correct: q.nativeScript,
    correctSub: q.romanized || null,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type QuizState = 'loading' | 'playing' | 'results' | 'already-done';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function secondsUntilMidnightUtc() {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function useCountdown(initial: number) {
  const [secs, setSecs] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

// ---------------------------------------------------------------------------
// MCQ question
// ---------------------------------------------------------------------------
function McqQuestion({
  q,
  onAnswer,
  answered,
  colors,
}: {
  q: McqTranslationQuestion;
  onAnswer: (selected: string) => void;
  answered: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const choices = useRef(
    [...q.distractors, q.correctEnglish].sort(() => Math.random() - 0.5),
  ).current;
  const [selected, setSelected] = useState<string | null>(null);

  const choose = (c: string) => {
    if (answered) return;
    setSelected(c);
    onAnswer(c);
  };

  return (
    <View style={s.questionBody}>
      <View style={[s.nativeBox, { backgroundColor: `${colors.primary}12` }]}>
        <Text style={[s.nativeText, { color: colors.foreground }]}>{q.nativeScript}</Text>
        <Text style={[s.romanized, { color: colors.mutedForeground }]}>{q.romanized}</Text>
      </View>
      <Text style={[s.prompt, { color: colors.mutedForeground }]}>What does this mean?</Text>
      <View style={s.choiceGrid}>
        {choices.map((c) => {
          const isCorrect = c === q.correctEnglish;
          const isSelected = c === selected;
          let bg = colors.card;
          let border = colors.border;
          let textColor = colors.foreground;
          if (answered) {
            if (isCorrect) { bg = '#dcfce7'; border = '#22c55e'; textColor = '#15803d'; }
            else if (isSelected) { bg = '#fee2e2'; border = '#f87171'; textColor = '#b91c1c'; }
          }
          return (
            <Pressable
              key={c}
              onPress={() => choose(c)}
              style={[s.choiceBtn, { backgroundColor: bg, borderColor: border, opacity: answered && !isCorrect && !isSelected ? 0.5 : 1 }]}
            >
              <Text style={[s.choiceText, { color: textColor }]} numberOfLines={2}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Listen & Identify question
// ---------------------------------------------------------------------------
function ListenQuestion({
  q,
  onAnswer,
  answered,
  colors,
  languageName,
  ttsVoice,
  soundOn,
}: {
  q: ListenIdentifyQuestion;
  onAnswer: (selected: string) => void;
  answered: boolean;
  colors: ReturnType<typeof useColors>;
  languageName: string;
  ttsVoice: string;
  soundOn: boolean;
}) {
  const choices = useRef(
    [...q.distractors, q.correctNativeScript].sort(() => Math.random() - 0.5),
  ).current;

  // Build a nativeScript → romanization lookup so every choice button can
  // show the romanized form below the native script text.
  const romanizationMap: Record<string, string> = {
    [q.correctNativeScript]: q.romanized,
    ...Object.fromEntries(
      q.distractors
        .map((d, i) => [d, q.distractorRomanizations?.[i] ?? ''])
        .filter(([, r]) => r),
    ),
  };

  const [selected, setSelected] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Session-level cache keyed by `${text}:${ttsVoice}` so repeated taps on the
  // same question skip the network round-trip, but a voice change still fetches
  // fresh audio (the key changes, busting the stale entry automatically).
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());

  const playAudio = async () => {
    // Muted games skip synthesis entirely, not just playback.
    if (!soundOn || isPlaying) return;
    setIsPlaying(true);
    try {
      const cacheKey = `${q.correctNativeScript}:${ttsVoice}`;
      const cached = audioCache.current.get(cacheKey);
      const result =
        cached ?? (await synthesizeSpeech({ text: q.correctNativeScript, languageName }));
      if (!cached) {
        audioCache.current.set(cacheKey, {
          audioBase64: result.audioBase64,
          format: result.format ?? 'mp3',
        });
      }
      await playBase64Audio(result.audioBase64, result.format ?? 'mp3', () => {
        setIsPlaying(false);
      });
    } catch {
      setIsPlaying(false);
    }
  };

  const choose = (c: string) => {
    if (answered) return;
    setSelected(c);
    onAnswer(c);
  };

  return (
    <View style={s.questionBody}>
      <View style={s.listenCenter}>
        <Pressable
          testID="quiz-listen-play-btn"
          onPress={playAudio}
          style={[s.playBtn, { borderColor: isPlaying ? colors.primary : colors.border, backgroundColor: isPlaying ? `${colors.primary}12` : colors.card }]}
        >
          <Feather name="volume-2" size={32} color={isPlaying ? colors.primary : colors.mutedForeground} />
        </Pressable>
        <Text style={[s.listenHint, { color: colors.mutedForeground }]}>
          {isPlaying ? 'Playing…' : 'Tap to hear the phrase'}
        </Text>
      </View>
      <Text style={[s.prompt, { color: colors.mutedForeground }]}>Which script matches?</Text>
      <View style={s.choiceGrid}>
        {choices.map((c) => {
          const isCorrect = c === q.correctNativeScript;
          const isSelected = c === selected;
          let bg = colors.card;
          let border = colors.border;
          let textColor = colors.foreground;
          if (answered) {
            if (isCorrect) { bg = '#dcfce7'; border = '#22c55e'; textColor = '#15803d'; }
            else if (isSelected) { bg = '#fee2e2'; border = '#f87171'; textColor = '#b91c1c'; }
          }
          return (
            <Pressable
              key={c}
              onPress={() => choose(c)}
              style={[s.choiceBtn, { backgroundColor: bg, borderColor: border, opacity: answered && !isCorrect && !isSelected ? 0.5 : 1 }]}
            >
              <Text style={[s.nativeChoiceText, { color: textColor }]} numberOfLines={1}>{c}</Text>
              {romanizationMap[c] ? (
                <Text style={[s.choiceRomanized, { color: textColor }]} numberOfLines={1}>
                  {romanizationMap[c]}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Order words question
// ---------------------------------------------------------------------------
function OrderQuestion({
  q,
  onAnswer,
  answered,
  colors,
}: {
  q: OrderWordsQuestion;
  onAnswer: (selected: string) => void;
  answered: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [staged, setStaged] = useState<string[]>([]);
  const [available, setAvailable] = useState<string[]>([...q.tiles]);
  const [submitted, setSubmitted] = useState(false);

  // R3: tile → romanized subtitle, aligned by index server-side. Identical
  // tile text always romanizes identically, so a text-keyed map survives the
  // staged/available splits. Empty entries (no clean romanization for the
  // script) render no subtitle line at all.
  const tileRomanization: Record<string, string> = {};
  q.tiles.forEach((t, i) => {
    const r = q.tileRomanizations?.[i];
    if (r) tileRomanization[t] = r;
  });

  const pick = (tile: string, idx: number) => {
    if (answered) return;
    setAvailable((a) => a.filter((_, i) => i !== idx));
    setStaged((s) => [...s, tile]);
  };

  const unpick = (tile: string, idx: number) => {
    if (answered) return;
    setStaged((s) => s.filter((_, i) => i !== idx));
    setAvailable((a) => [...a, tile]);
  };

  const submit = () => {
    if (answered || staged.length === 0) return;
    setSubmitted(true);
    onAnswer(staged.join(' '));
  };

  const correct = submitted && staged.join(' ') === q.nativeScript;

  return (
    <View style={s.questionBody}>
      <View style={[s.nativeBox, { backgroundColor: colors.muted }]}>
        <Text style={[s.prompt, { color: colors.mutedForeground }]}>Arrange to say:</Text>
        <Text style={[s.englishText, { color: colors.foreground }]}>"{q.english}"</Text>
        <Text style={[s.romanized, { color: colors.mutedForeground }]}>{q.romanized}</Text>
      </View>

      {/* Staged area */}
      <View style={[s.stagedArea, { borderColor: colors.border, backgroundColor: `${colors.muted}40` }]}>
        {staged.length === 0 ? (
          <Text style={[s.stagedHint, { color: colors.mutedForeground }]}>Tap words below…</Text>
        ) : (
          <View style={s.tileRow}>
            {staged.map((t, i) => (
              <Pressable
                key={`${t}-${i}`}
                onPress={() => unpick(t, i)}
                style={[s.tile, {
                  borderColor: submitted ? (correct ? '#22c55e' : '#f87171') : colors.primary,
                  backgroundColor: submitted ? (correct ? '#dcfce7' : '#fee2e2') : `${colors.primary}18`,
                }]}
              >
                <Text style={[s.tileText, { color: submitted ? (correct ? '#15803d' : '#b91c1c') : colors.primary }]}>{t}</Text>
                {tileRomanization[t] ? (
                  <Text style={[s.tileRomanized, { color: submitted ? (correct ? '#15803d' : '#b91c1c') : colors.primary }]}>
                    {tileRomanization[t]}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Available tiles */}
      <View style={s.tileRow}>
        {available.map((t, i) => (
          <Pressable
            key={`${t}-${i}`}
            onPress={() => pick(t, i)}
            style={[s.tile, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={[s.tileText, { color: colors.foreground }]}>{t}</Text>
            {tileRomanization[t] ? (
              <Text style={[s.tileRomanized, { color: colors.mutedForeground }]}>
                {tileRomanization[t]}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      {!submitted ? (
        <Pressable
          onPress={submit}
          style={[s.submitBtn, { backgroundColor: staged.length === 0 ? colors.muted : colors.primary }]}
          disabled={staged.length === 0}
        >
          <Text style={[s.submitText, { color: staged.length === 0 ? colors.mutedForeground : '#fff' }]}>Check answer</Text>
        </Pressable>
      ) : (
        <View style={[s.feedbackBox, { backgroundColor: correct ? '#dcfce7' : '#fee2e2' }]}>
          <Text style={[s.feedbackText, { color: correct ? '#15803d' : '#b91c1c' }]}>
            {correct ? 'Correct! 🎉' : `Correct: ${q.nativeScript}`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Streak badge (shown on results/already-done when streak >= 1)
// ---------------------------------------------------------------------------
export function StreakBadge({
  streak,
  colors,
}: {
  streak: number;
  colors: ReturnType<typeof useColors>;
}) {
  if (streak < 1) return null;
  return (
    <View style={[s.streakBadge, { backgroundColor: '#fff7ed', borderColor: '#fb923c' }]}>
      <Text style={s.streakFlame}>🔥</Text>
      <Text style={[s.streakText, { color: '#c2410c' }]}>
        {streak}-day streak!
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Results screen
// ---------------------------------------------------------------------------
export function ResultsScreen({
  score,
  total,
  xp,
  quizStreak,
  // Defaulted: the results screen is rendered directly (tests, and any caller
  // that has only a score) and a run with nothing to review is a normal state.
  misses = [],
  onBack,
  colors,
}: {
  score: number;
  total: number;
  xp: number;
  quizStreak: number;
  misses?: GameMiss[];
  onBack: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const countdown = useCountdown(secondsUntilMidnightUtc());
  const perfect = score === total;
  // Tapping the score opens the review, the affordance most learners reach
  // for first. A perfect run has nothing to review, so the score stays inert.
  const [reviewOpen, setReviewOpen] = useState(false);
  const canReview = misses.length > 0;

  const handleShare = async () => {
    const streakSuffix = quizStreak >= 2 ? ` 🔥 ${quizStreak}-day streak!` : '';
    const msg = perfect
      ? `I scored ${score}/${total} on today's Bolo Quiz! 🦜🎉 Perfect score!${streakSuffix}`
      : `I scored ${score}/${total} on today's Bolo Quiz! 🦜 #BoloLanguage${streakSuffix}`;
    try {
      await Share.share({ message: msg });
    } catch {
      /* dismissed */
    }
  };

  return (
    <Animated.View entering={appearPlain()} style={s.centered}>
      <Mascot pose={perfect ? 'cheer' : score >= 3 ? 'thumbsup' : 'tryagain'} size={110} />

      <Text style={[s.resultsTitle, { color: colors.foreground }]}>
        {perfect ? 'Perfect! 🎉' : score >= 3 ? 'Nice work!' : 'Keep it up!'}
      </Text>
      <Text style={[s.resultsSubtitle, { color: colors.mutedForeground }]}>Today's quiz complete</Text>

      <StreakBadge streak={quizStreak} colors={colors} />

      <View style={s.scoreRow}>
        <Pressable
          onPress={canReview ? () => setReviewOpen(true) : undefined}
          disabled={!canReview}
          accessibilityRole={canReview ? 'button' : undefined}
          accessibilityLabel={
            canReview ? `${score} of ${total} correct. See what you missed.` : undefined
          }
          testID="bolo-quiz-score-card"
          style={s.scoreCol}
        >
          <Text style={[s.bigNum, { color: colors.foreground }]}>{score}</Text>
          <Text
            style={[
              s.smallLabel,
              { color: canReview ? colors.primary : colors.mutedForeground },
            ]}
          >
            {canReview ? 'See misses' : `out of ${total}`}
          </Text>
        </Pressable>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <View style={s.scoreCol}>
          <Text style={[s.bigNum, { color: colors.primary }]}>+{xp}</Text>
          <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>XP earned</Text>
        </View>
      </View>

      {/* Dots */}
      <View style={s.dotRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[s.dot, { backgroundColor: i < score ? '#22c55e' : colors.muted }]} />
        ))}
      </View>

      {/* Countdown */}
      <View style={[s.countdownBox, { backgroundColor: colors.muted }]}>
        <Feather name="clock" size={14} color={colors.mutedForeground} />
        <Text style={[s.countdownText, { color: colors.mutedForeground }]}>
          Next quiz in <Text style={{ color: colors.foreground, fontFamily: AppFonts.bold }}>{countdown}</Text>
        </Text>
      </View>

      <View style={s.btnRow}>
        <Pressable onPress={handleShare} style={[s.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="share" size={15} color={colors.foreground} />
          <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Share</Text>
        </Pressable>
        <Pressable onPress={onBack} style={[s.primaryBtn, { backgroundColor: colors.primary }]}>
          <Text style={s.primaryBtnText}>Back to Games</Text>
        </Pressable>
      </View>

      <View style={{ alignSelf: 'stretch' }}>
        <MissReviewCta count={misses.length} onPress={() => setReviewOpen(true)} />
      </View>

      <MissReviewModal misses={misses} visible={reviewOpen} onClose={() => setReviewOpen(false)} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Already-done screen
// ---------------------------------------------------------------------------
export function AlreadyDoneScreen({
  score,
  total,
  xp,
  completedAt,
  quizStreak,
  colors,
}: {
  score: number;
  total: number;
  xp: number;
  completedAt: string | Date;
  quizStreak: number;
  colors: ReturnType<typeof useColors>;
}) {
  const countdown = useCountdown(secondsUntilMidnightUtc());

  const handleShare = async () => {
    const streakSuffix = quizStreak >= 2 ? ` 🔥 ${quizStreak}-day streak!` : '';
    const msg = `I scored ${score}/${total} on today's Bolo Quiz! 🦜 #BoloLanguage${streakSuffix}`;
    try {
      await Share.share({ message: msg });
    } catch {
      /* dismissed */
    }
  };

  return (
    <Animated.View entering={appearPlain()} style={s.centered}>
      <Mascot pose={score === total ? 'cheer' : 'thumbsup'} size={100} />

      <Text style={[s.resultsTitle, { color: colors.foreground }]}>Already played today!</Text>
      <Text style={[s.resultsSubtitle, { color: colors.mutedForeground }]}>
        Completed at {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>

      <StreakBadge streak={quizStreak} colors={colors} />

      <View style={s.scoreRow}>
        <View style={s.scoreCol}>
          <Text style={[s.bigNum, { color: colors.foreground }]}>{score}</Text>
          <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>out of {total}</Text>
        </View>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <View style={s.scoreCol}>
          <Text style={[s.bigNum, { color: colors.primary }]}>+{xp}</Text>
          <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>XP earned</Text>
        </View>
      </View>

      <View style={s.dotRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[s.dot, { backgroundColor: i < score ? '#22c55e' : colors.muted }]} />
        ))}
      </View>

      <View style={[s.countdownBox, { backgroundColor: colors.muted }]}>
        <Feather name="clock" size={14} color={colors.mutedForeground} />
        <Text style={[s.countdownText, { color: colors.mutedForeground }]}>
          Next quiz in <Text style={{ color: colors.foreground, fontFamily: AppFonts.bold }}>{countdown}</Text>
        </Text>
      </View>

      <Pressable onPress={handleShare} style={[s.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card, alignSelf: 'stretch' }]}>
        <Feather name="share" size={15} color={colors.foreground} />
        <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Share result</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function BoloQuizScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isPlus, isLoading: entitlementsLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();
  const accountQuery = useGetAccount();
  const ttsVoice = accountQuery.data?.preferences.learning.ttsVoice ?? 'auto';
  const { soundOn, toggle: toggleSound } = useGameAudio();

  const quizParams = { lang: activeLang };
  const { data, isLoading } = useGetDailyQuiz(quizParams, {
    query: {
      enabled: !!isPlus && !!activeLang,
      queryKey: getGetDailyQuizQueryKey(quizParams),
    },
  });
  const completeMutation = useCompleteDailyQuiz();

  const [quizState, setQuizState] = useState<QuizState>('loading');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [currentAnswered, setCurrentAnswered] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalXp, setFinalXp] = useState(0);
  const [finalStreak, setFinalStreak] = useState(0);
  const [finalMisses, setFinalMisses] = useState<GameMiss[]>([]);

  // Auto-advance timer, cleared on unmount or when quiz leaves 'playing'.
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to handleNext so the timeout always calls the latest version.
  const handleNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!data) return;
    if (data.completed) {
      setQuizState('already-done');
    } else {
      setQuizState('playing');
    }
  }, [data]);

  const handleNext = useCallback(async () => {
    const questions = data?.questions ?? [];
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      const finalAnswers = [...answers];
      const score = finalAnswers.reduce<number>((acc, ans, i) => {
        const q = questions[i];
        return acc + (q && localIsCorrect(q as QuizQuestion, ans) ? 1 : 0);
      }, 0);
      const xp = score * 10 + (score === 5 ? 20 : 0);
      // Derive the misses from the same questions + answers the score used, so
      // the review lists exactly the ones the score docked. A question with no
      // captured answer (index past the answers array) reads as skipped.
      const missList = questions.reduce<GameMiss[]>((acc, q, i) => {
        const ans = i < finalAnswers.length ? finalAnswers[i] : null;
        if (!localIsCorrect(q as QuizQuestion, ans)) {
          acc.push(describeMiss(q as QuizQuestion, ans));
        }
        return acc;
      }, []);
      setFinalScore(score);
      setFinalXp(xp);
      setFinalMisses(missList);
      setQuizState('results');
      try {
        const result = await completeMutation.mutateAsync({
          data: { lang: activeLang, answers: finalAnswers },
        });
        setFinalScore(result.score);
        setFinalXp(result.xpAwarded);
        setFinalStreak(result.quizStreak ?? 0);
      } catch {
        /* non-fatal */
      }
    } else {
      setCurrentIndex(nextIndex);
      setCurrentAnswered(false);
    }
  }, [currentIndex, answers, data, activeLang, completeMutation]);

  // Keep the ref current so the setTimeout below always sees the latest closure.
  useEffect(() => {
    handleNextRef.current = handleNext;
  });

  // Clear the auto-advance timer whenever the quiz leaves 'playing' or on unmount.
  useEffect(() => {
    if (quizState !== 'playing') {
      if (autoAdvanceTimer.current != null) {
        clearTimeout(autoAdvanceTimer.current);
        autoAdvanceTimer.current = null;
      }
    }
    return () => {
      if (autoAdvanceTimer.current != null) {
        clearTimeout(autoAdvanceTimer.current);
        autoAdvanceTimer.current = null;
      }
    };
  }, [quizState]);

  const handleAnswer = useCallback(
    (selected: string) => {
      if (currentAnswered) return;
      setCurrentAnswered(true);
      setAnswers((a) => [...a, selected]);
      // Auto-advance after 1.2 s so the learner can see the correct-answer highlight.
      if (autoAdvanceTimer.current != null) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        handleNextRef.current();
      }, 1200);
    },
    [currentAnswered],
  );

  // Render-time paywall gate, after every hook so no render path skips one.
  // Loading FIRST: the entitlements context falls back to plan 'free' until
  // the server answers, so checking isPlus first would bounce a paying
  // subscriber to the paywall on every cold open (#892). Returning null (rather
  // than redirecting) while loading also means the quiz never paints for a
  // frame before a non-Plus learner is sent away, which the effect-based
  // redirect this replaces could not prevent.
  if (entitlementsLoading) return null;
  if (!isPlus) return <Redirect href="/(app)/paywall" />;

  const questions = data?.questions ?? [];
  const currentQ = questions[currentIndex];

  return (
    <Screen>
      {/* Header */}
      <View style={s.header}>
        <Pressable
          onPress={() => {
            // Leaving mid-quiz forfeits today's attempt in progress; ask first.
            if (quizState === 'playing') confirmDiscardRun(() => router.back());
            else router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="game-exit-btn"
          style={[s.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Bolo Quiz</Text>
          {activeLanguage && (
            <Text style={[s.headerSubtitle, { color: colors.mutedForeground }]}>{activeLanguage.name}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GameMuteButton soundOn={soundOn} onToggle={toggleSound} />
          <Feather name="award" size={22} color={colors.primary} />
        </View>
      </View>

      {/* Body */}
      {(isLoading || quizState === 'loading') && (
        <View style={s.centered}>
          <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading today's quiz…</Text>
        </View>
      )}

      {quizState === 'already-done' && data?.completed && (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <AlreadyDoneScreen
            score={data.score ?? 0}
            total={data.total ?? 5}
            xp={data.xpAwarded ?? 0}
            completedAt={data.completedAt ?? new Date()}
            quizStreak={data.quizStreak ?? 0}
            colors={colors}
          />
        </ScrollView>
      )}

      {quizState === 'playing' && currentQ && (
        <ScrollView
          contentContainerStyle={s.playingScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress bar */}
          <View style={s.progressRow}>
            <View style={[s.progressTrack, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  s.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${(currentIndex / questions.length) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text style={[s.progressLabel, { color: colors.mutedForeground }]}>
              {currentIndex + 1}/{questions.length}
            </Text>
          </View>

          {/* Type label */}
          <View style={[s.typeChip, { backgroundColor: `${colors.primary}12` }]}>
            <Text style={[s.typeChipText, { color: colors.primary }]}>
              {currentQ.type === 'mcq_translation'
                ? 'Translation'
                : currentQ.type === 'listen_identify'
                ? 'Listen & Identify'
                : 'Order the Words'}
            </Text>
          </View>

          {/* Renderer */}
          {currentQ.type === 'mcq_translation' && (
            <McqQuestion key={currentIndex} q={currentQ} onAnswer={handleAnswer} answered={currentAnswered} colors={colors} />
          )}
          {currentQ.type === 'listen_identify' && (
            <ListenQuestion
              key={currentIndex}
              q={currentQ}
              onAnswer={handleAnswer}
              answered={currentAnswered}
              colors={colors}
              languageName={activeLanguage?.name ?? activeLang}
              ttsVoice={ttsVoice}
              soundOn={soundOn}
            />
          )}
          {currentQ.type === 'order_words' && (
            <OrderQuestion key={currentIndex} q={currentQ} onAnswer={handleAnswer} answered={currentAnswered} colors={colors} />
          )}

          {/* Auto-advance fires after 1.2 s, no manual Next button needed. */}
        </ScrollView>
      )}

      {quizState === 'results' && (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <ResultsScreen
            score={finalScore}
            total={5}
            xp={finalXp}
            quizStreak={finalStreak}
            misses={finalMisses}
            onBack={() => router.back()}
            colors={colors}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: AppFonts.bold, fontSize: 18 },
  headerSubtitle: { fontFamily: AppFonts.regular, fontSize: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24, paddingBottom: TAB_BAR_CLEARANCE },
  loadingText: { fontFamily: AppFonts.regular, fontSize: 14 },

  playingScroll: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 16 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontFamily: AppFonts.semibold, fontSize: 12 },

  typeChip: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4 },
  typeChipText: { fontFamily: AppFonts.bold, fontSize: 11 },

  questionBody: { gap: 16 },
  nativeBox: { borderRadius: 16, padding: 20, alignItems: 'center' },
  nativeText: { fontFamily: AppFonts.bold, fontSize: 36, textAlign: 'center' },
  romanized: { fontFamily: AppFonts.regular, fontSize: 13, textAlign: 'center', marginTop: 4 },
  englishText: { fontFamily: AppFonts.semibold, fontSize: 16, textAlign: 'center' },
  prompt: { fontFamily: AppFonts.semibold, fontSize: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choiceBtn: { flex: 1, minWidth: '40%', borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontFamily: AppFonts.semibold, fontSize: 14, textAlign: 'center' },
  nativeChoiceText: { fontFamily: AppFonts.bold, fontSize: 20, textAlign: 'center' },
  choiceRomanized: { fontFamily: AppFonts.regular, fontSize: 11, textAlign: 'center', opacity: 0.72, marginTop: 2 },

  listenCenter: { alignItems: 'center', gap: 10 },
  playBtn: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  listenHint: { fontFamily: AppFonts.regular, fontSize: 13 },

  stagedArea: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, padding: 12, minHeight: 56 },
  stagedHint: { fontFamily: AppFonts.regular, fontSize: 13 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  tileText: { fontFamily: AppFonts.semibold, fontSize: 18, textAlign: 'center' },
  // R3: romanized subtitle slot under each tile, no numberOfLines anywhere
  // on tiles, so neither line can ever truncate at large text sizes.
  tileRomanized: { fontFamily: AppFonts.regular, fontSize: 11, textAlign: 'center', marginTop: 1 },

  submitBtn: { borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontFamily: AppFonts.bold, fontSize: 15 },
  feedbackBox: { borderRadius: 12, padding: 12, alignItems: 'center' },
  feedbackText: { fontFamily: AppFonts.semibold, fontSize: 14 },

  nextBtn: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  nextBtnText: { fontFamily: AppFonts.bold, fontSize: 16, color: '#fff' },

  // Results / already-done
  resultsTitle: { fontFamily: AppFonts.extrabold, fontSize: 28, textAlign: 'center' },
  resultsSubtitle: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  scoreCol: { alignItems: 'center' },
  bigNum: { fontFamily: AppFonts.extrabold, fontSize: 48 },
  smallLabel: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  divider: { width: 1, height: 40 },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  countdownBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  countdownText: { fontFamily: AppFonts.regular, fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  primaryBtn: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontFamily: AppFonts.bold, fontSize: 15, color: '#fff' },
  secondaryBtn: { flex: 1, flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryBtnText: { fontFamily: AppFonts.bold, fontSize: 15 },

  // Streak badge
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 },
  streakFlame: { fontSize: 16 },
  streakText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
