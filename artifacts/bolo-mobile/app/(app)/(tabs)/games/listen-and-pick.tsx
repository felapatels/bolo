import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { categoryIcon } from '@/lib/ui';
import { useRouter } from 'expo-router';
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
  useSynthesizeSpeech,
  useGetAccount,
  type Phrase,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { FunFactLoader } from '@/components/FunFactLoader';
import { PressableScale } from '@/components/PressableScale';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { useLanguage } from '@/contexts/LanguageContext';
import { playBase64Audio, type PlaybackHandle } from '@/lib/audio';
import { GAME_CONFIG } from '@/lib/game-config';
import { GameMuteButton, useGameAudio } from '@/components/GameMuteButton';
import { confirmDiscardRun } from '@/lib/gameExit';
import { MissReviewCta, MissReviewModal, type GameMiss } from '@/components/GameMissReview';
import { playablePhraseCount } from '@/lib/quick-games';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'picker' | 'game' | 'end';
type AnswerState = 'idle' | 'correct' | 'wrong';

interface Question {
  phrase: Phrase;
  choices: Phrase[];
  correctIdx: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildQuestions(phrases: Phrase[], count: number): Question[] {
  // Build exactly `count` questions using repeat-sampling so rounds are always
  // the full length even when the topic has fewer than `count` phrases.
  // Each question always shows `choiceCount` choices, which requires at least
  // `choiceCount` unique phrases in the pool (enforced by the topic picker).
  const questions: Question[] = [];
  let pool = shuffleArray([...phrases]);
  let poolIdx = 0;

  for (let i = 0; i < count; i++) {
    // Refill and re-shuffle the pool once we've exhausted all phrases.
    if (poolIdx >= pool.length) {
      pool = shuffleArray([...phrases]);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++];
    const distractors = shuffleArray(phrases.filter(p => p.id !== phrase.id)).slice(
      0,
      GAME_CONFIG.listenAndPick.choiceCount - 1,
    );
    const choices = shuffleArray([phrase, ...distractors]);
    const correctIdx = choices.findIndex(c => c.id === phrase.id);
    questions.push({ phrase, choices, correctIdx });
  }
  return questions;
}

// ─── Topic Picker ─────────────────────────────────────────────────────────────

function TopicPicker({
  activeLang,
  onSelect,
  colors,
}: {
  activeLang: string;
  onSelect: (id: number, title: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { data: categories, isLoading } = useListCategories({ lang: activeLang });

  if (isLoading) {
    // Shimmer skeletons shaped like the incoming topic rows keep the layout
    // stable instead of a raw spinner.
    return (
      <View style={styles.pickerList}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} height={64} borderRadius={16} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.pickerList, { paddingBottom: TAB_BAR_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>
        Choose a topic to listen from
      </Text>
      {(categories ?? []).map((cat) => {
        // PLAYABLE, not held: a topic the journey has not opened serves
        // this game nothing however many phrases it holds.
        const playable = playablePhraseCount(cat);
        const disabled = playable < GAME_CONFIG.listenAndPick.choiceCount;
        return (
          <PressableScale
            key={cat.id}
            onPress={() => onSelect(cat.id, cat.title)}
            disabled={disabled}
            style={[
              styles.topicCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
            ]}
          >
            <Feather
              name={categoryIcon(cat.iconName)}
              size={24}
              color={colors.primary}
              style={styles.topicIcon}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.topicTitle, { color: colors.foreground }]} numberOfLines={1}>
                {cat.title}
              </Text>
              <Text style={[styles.topicSub, { color: colors.mutedForeground }]}>
                {cat.phraseCount} phrases
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

// ─── End Screen ───────────────────────────────────────────────────────────────

function EndScreen({
  score,
  total,
  xpEarned,
  misses,
  onPlayAgain,
  onChooseTopic,
  colors,
}: {
  score: number;
  total: number;
  xpEarned: number | null;
  misses: GameMiss[];
  onPlayAgain: () => void;
  onChooseTopic: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = useState(false);
  const canReview = misses.length > 0;
  const isPerfect = score === total;
  const pose = isPerfect ? 'cheer' : score >= total / 2 ? 'thumbsup' : 'tryagain';
  const headline = isPerfect ? 'Perfect Round! 🎉' : score >= total / 2 ? 'Nice Work! 👍' : 'Keep Practising! 💪';

  return (
    <View style={styles.centerPad}>
      <Mascot pose={pose} size={100} />
      <Text style={[styles.h2, { color: colors.foreground }]}>{headline}</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>{score} / {total} correct</Text>

      <View style={styles.statsGrid}>
        {/* The score is the first thing a learner reaches for to see WHICH
            ones they missed, so it opens the review itself. A perfect run has
            nothing to review, so it stays a plain, untappable card. */}
        <Pressable
          testID="listen-and-pick-score-card"
          onPress={canReview ? () => setReviewOpen(true) : undefined}
          disabled={!canReview}
          accessibilityRole={canReview ? 'button' : undefined}
          accessibilityLabel={
            canReview ? `${score} of ${total} correct. See what you missed.` : undefined
          }
          style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="check-circle" size={20} color="#10B981" />
          <Text style={[styles.statCardValue, { color: colors.foreground }]}>{score}/{total}</Text>
          <Text
            style={[
              styles.statCardLabel,
              { color: canReview ? colors.primary : colors.mutedForeground },
            ]}
          >
            {canReview ? 'See misses' : 'Score'}
          </Text>
        </Pressable>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="zap" size={20} color="#F59E0B" />
          <Text style={[styles.statCardValue, { color: colors.foreground }]}>{xpEarned !== null ? `+${xpEarned}` : '…'}</Text>
          <Text style={[styles.statCardLabel, { color: colors.mutedForeground }]}>XP Earned</Text>
        </View>
      </View>

      <ChunkyButton
        title="Play Again"
        icon="refresh-cw"
        onPress={onPlayAgain}
        style={{ width: '100%' }}
      />
      <MissReviewCta count={misses.length} onPress={() => setReviewOpen(true)} />
      <ChunkyButton
        title="Choose Topic"
        icon="list"
        variant="secondary"
        onPress={onChooseTopic}
        style={{ width: '100%' }}
      />
      <Pressable onPress={() => router.back()} style={styles.textBtn}>
        <Text style={[styles.textBtnLabel, { color: colors.mutedForeground }]}>← Back to Games</Text>
      </Pressable>

      <MissReviewModal misses={misses} visible={reviewOpen} onClose={() => setReviewOpen(false)} />
    </View>
  );
}

// ─── Game Round ───────────────────────────────────────────────────────────────

type PhraseResult = { phraseId: number; selectedPhraseId: number };

function GameRound({
  phrases,
  activeLanguage,
  soundOn,
  onEnd,
  colors,
}: {
  phrases: Phrase[];
  activeLanguage: ReturnType<typeof useLanguage>['activeLanguage'];
  soundOn: boolean;
  onEnd: (score: number, results: PhraseResult[], misses: GameMiss[]) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const nativeProps = nativeTextStyle(activeLanguage);
  const synthesize = useSynthesizeSpeech();

  // Read the learner's TTS voice preference so the audio cache key can
  // include the voice ID. Without this, switching voices mid-session still
  // plays the old cached clip. Stale data is fine here — the account query
  // is almost always pre-fetched by an ancestor; we just need ttsVoice.
  const accountQuery = useGetAccount();
  const ttsVoice = accountQuery.data?.preferences.learning.ttsVoice ?? 'auto';

  const [questions] = useState<Question[]>(() =>
    buildQuestions(phrases, GAME_CONFIG.listenAndPick.roundSize)
  );
  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  // 'loading' = synthesis in progress (button disabled + spinner)
  // 'playing' = audio is outputting (button enabled so user can replay)
  // 'idle'    = nothing happening
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle');

  const playbackRef = useRef<PlaybackHandle | null>(null);
  // Cache key is `${phrase.id}:${ttsVoice}` so a mid-session voice change
  // busts stale entries — the new voice is fetched fresh automatically.
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const phraseResultsRef = useRef<PhraseResult[]>([]);
  // Wrong picks, described the way the round was played: the phrase that was
  // spoken (named by its meaning + reading, since the clip has no on-screen
  // prompt), the choice the learner tapped, and the one they should have
  // tapped — both shown by their native script, to match what was on screen.
  const missesRef = useRef<GameMiss[]>([]);
  // Track the current question index in a ref so the async playback callback
  // can detect if we've already moved on (unmounted/advanced).
  const qIdxRef = useRef(0);
  qIdxRef.current = qIdx;
  // Mute must skip synthesis calls, not just playback; a ref keeps the async
  // playback path reading the live value.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const playPhrase = useCallback(
    async (phrase: Phrase) => {
      // Muted games skip synthesis entirely.
      if (!soundOnRef.current) return;
      // Stop any currently playing audio first
      if (playbackRef.current) {
        playbackRef.current.stop();
        playbackRef.current = null;
      }
      setAudioState('loading');
      const capturedQIdx = qIdxRef.current;
      try {
        const cacheKey = `${phrase.id}:${ttsVoice}`;
        const cached = audioCache.current.get(cacheKey);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLanguage?.code },
          }));
        audioCache.current.set(cacheKey, { audioBase64: res.audioBase64, format: res.format });
        // Guard: don't play if we've already moved to the next question
        if (qIdxRef.current !== capturedQIdx) {
          setAudioState('idle');
          return;
        }
        setAudioState('playing');
        const handle = await playBase64Audio(res.audioBase64, res.format, () => {
          // Called when the clip naturally finishes (not on stop())
          setAudioState('idle');
        });
        playbackRef.current = handle;
      } catch {
        setAudioState('idle');
      }
    },
    [synthesize, activeLanguage, ttsVoice],
  );

  // Auto-play when question changes
  useEffect(() => {
    const q = questions[qIdx];
    if (q) playPhrase(q.phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx]);

  // Prefetch next question's audio.
  // ttsVoice is included in the cache key so a voice change re-fetches the
  // upcoming phrase in the new voice rather than serving a stale clip.
  useEffect(() => {
    if (!soundOn) return;
    const next = questions[qIdx + 1];
    const nextKey = next ? `${next.phrase.id}:${ttsVoice}` : null;
    if (!next || !nextKey || audioCache.current.has(nextKey)) return;
    synthesize
      .mutateAsync({ data: { text: next.phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLanguage?.code } })
      .then(res => audioCache.current.set(nextKey, { audioBase64: res.audioBase64, format: res.format }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx, ttsVoice, soundOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { playbackRef.current?.stop(); };
  }, []);

  const q = questions[qIdx];
  const total = questions.length;

  const advance = useCallback(
    (finalScore: number) => {
      setAnswerState('idle');
      setPickedIdx(null);
      if (qIdxRef.current + 1 >= total) {
        onEnd(finalScore, phraseResultsRef.current, missesRef.current);
      } else {
        setQIdx(i => i + 1);
      }
    },
    [total, onEnd],
  );

  const handlePick = (choiceIdx: number) => {
    if (answerState !== 'idle' || !q) return;

    const isCorrect = choiceIdx === q.correctIdx;
    setPickedIdx(choiceIdx);
    setAnswerState(isCorrect ? 'correct' : 'wrong');

    const newScore = isCorrect ? score + 1 : score;
    if (isCorrect) setScore(newScore);

    // Record the selected phraseId for server-side correctness verification.
    phraseResultsRef.current.push({
      phraseId: q.phrase.id,
      selectedPhraseId: q.choices[choiceIdx].id,
    });

    if (!isCorrect) {
      // The clip is the prompt, so name what was played by its meaning and
      // reading; the choices are shown by their native script so the miss
      // matches what the learner tapped.
      const picked = q.choices[choiceIdx];
      missesRef.current.push({
        prompt: `You heard "${q.phrase.english}"`,
        // The script + reading sit on the answer lines below, where each one
        // belongs to the phrase it names, so the prompt keeps the meaning only.
        answer: picked.nativeScript,
        answerSub: picked.romanized.trim() || null,
        correct: q.phrase.nativeScript,
        correctSub: q.phrase.romanized.trim() || null,
      });
    }

    if (isCorrect) {
      // Correct answers keep the short auto-advance beat.
      setTimeout(() => advance(newScore), GAME_CONFIG.listenAndPick.feedbackDelay);
    } else {
      // Wrong answers hold the reveal (red pick, green correct, replayed
      // audio) until the learner taps Continue below.
      setTimeout(() => playPhrase(q.phrase), 200);
    }
  };

  if (!q) return null;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, gap: 12, paddingBottom: TAB_BAR_CLEARANCE }}>
      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressMeta}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            Question {qIdx + 1} of {total}
          </Text>
          <Text style={[styles.progressLabel, { color: '#10B981' }]}>
            ✓ {score} correct
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressBar,
              { backgroundColor: colors.primary, width: `${(qIdx / total) * 100}%` as any },
            ]}
          />
        </View>
      </View>

      {/* Listen card */}
      <View style={[styles.listenCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="headphones" size={22} color={colors.mutedForeground} />
        <Text style={[styles.listenLabel, { color: colors.mutedForeground }]}>
          Listen and pick the matching word
        </Text>
        <PressableScale
          testID="listen-and-pick-play-btn"
          onPress={() => { if (audioState !== 'loading') playPhrase(q.phrase); }}
          disabled={audioState === 'loading'}
          style={[
            styles.playBtn,
            { backgroundColor: colors.primary, opacity: audioState === 'loading' ? 0.7 : 1 },
          ]}
        >
          {audioState === 'loading'
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Feather name="volume-2" size={32} color="#FFFFFF" />}
        </PressableScale>
        {audioState === 'playing' && (
          <Text style={[styles.playingLabel, { color: colors.mutedForeground }]}>Playing…</Text>
        )}
        {audioState === 'loading' && (
          <Text style={[styles.playingLabel, { color: colors.mutedForeground }]}>Loading…</Text>
        )}
      </View>

      {/* Choice grid */}
      <View style={styles.choiceGrid}>
        {q.choices.map((choice, idx) => {
          const isCorrect = answerState !== 'idle' && idx === q.correctIdx;
          const isWrong = answerState === 'wrong' && idx === pickedIdx;

          return (
            <View
              key={`${q.phrase.id}-${idx}`}
              style={{ width: '48%' }}
            >
              <PressableScale
                onPress={() => handlePick(idx)}
                disabled={answerState !== 'idle'}
                style={[
                  styles.choiceCard,
                  {
                    backgroundColor: isCorrect
                      ? '#10B98120'
                      : isWrong
                      ? '#EF444420'
                      : colors.card,
                    borderColor: isCorrect
                      ? '#10B981'
                      : isWrong
                      ? '#EF4444'
                      : colors.border,
                    borderWidth: isCorrect || isWrong ? 2 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.choiceLabel,
                    nativeProps,
                    {
                      color: isCorrect
                        ? '#10B981'
                        : isWrong
                        ? '#EF4444'
                        : colors.foreground,
                    },
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {choice.nativeScript}
                </Text>
                {/* MEANING ONLY under the script (owner ruling, Aug 12, 2026).
                    The romanized reading used to sit here, but it spells out
                    what the clip just said: a learner could win every round by
                    matching Latin letters to sounds, without reading the script
                    or knowing the word. The always-visible romanization ruling
                    still holds on READING surfaces; this game is the exception
                    because the clip is the question. Web matches. */}
                <Text
                  style={[
                    styles.choiceEnglish,
                    {
                      color: isCorrect
                        ? '#10B981'
                        : isWrong
                        ? '#EF4444'
                        : colors.mutedForeground,
                    },
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {choice.english}
                </Text>
                {isCorrect && (
                  <View style={styles.feedbackIcon}>
                    <Feather name="check-circle" size={16} color="#10B981" />
                  </View>
                )}
                {isWrong && (
                  <View style={styles.feedbackIcon}>
                    <Feather name="x-circle" size={16} color="#EF4444" />
                  </View>
                )}
              </PressableScale>
            </View>
          );
        })}
      </View>

      {/* Wrong-answer reveal hold: the learner studies the highlight and
          continues when ready. Correct answers auto-advance. */}
      {answerState === 'wrong' && (
        <PressableScale
          testID="listen-and-pick-continue"
          onPress={() => advance(score)}
          style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.continueLabel}>Tap to continue</Text>
        </PressableScale>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ListenAndPickScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();

  const { soundOn, toggle: toggleSound } = useGameAudio();

  const [phase, setPhase] = useState<Phase>('picker');
  const [selectedCategory, setSelectedCategory] = useState<{ id: number; title: string } | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [finalXp, setFinalXp] = useState<number | null>(null);
  const [finalMisses, setFinalMisses] = useState<GameMiss[]>([]);
  const [gameKey, setGameKey] = useState(0);

  const phraseQuery = useListCategoryPhrases(
    selectedCategory?.id ?? 0,
    activeLang,
    {
      query: {
        enabled: !!selectedCategory,
        queryKey: getListCategoryPhrasesQueryKey(selectedCategory?.id ?? 0, activeLang),
      },
    }
  );
  const phrases = phraseQuery.data ?? [];

  const handleTopicSelect = (id: number, title: string) => {
    setSelectedCategory({ id, title });
    // A fresh topic must not carry the previous run's misses.
    setFinalMisses([]);
    setGameKey(k => k + 1);
    setPhase('game');
  };

  const handleEnd = (score: number, results: PhraseResult[], misses: GameMiss[]) => {
    setFinalScore(score);
    setFinalMisses(misses);
    setPhase('end');
    if (selectedCategory && results.length > 0) {
      recordSession.mutate(
        {
          data: {
            languageCode: activeLang,
            game: 'listen-and-pick',
            categoryId: selectedCategory.id,
            phraseResults: results,
          },
        },
        {
          onSuccess: (data) => {
            setFinalXp(data.xpEarned);
            queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
          },
        },
      );
    }
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (phase === 'picker') router.back();
            else if (phase === 'game') {
              // Leaving mid-round discards the run in progress; ask first.
              confirmDiscardRun(() => { setSelectedCategory(null); setPhase('picker'); });
            }
            else { setSelectedCategory(null); setPhase('picker'); }
          }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="game-exit-btn"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Listen &amp; Pick</Text>
          {activeLanguage && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{activeLanguage.name}</Text>
          )}
        </View>
        <GameMuteButton soundOn={soundOn} onToggle={toggleSound} />
      </View>

      {phase === 'picker' && (
        <TopicPicker activeLang={activeLang} onSelect={handleTopicSelect} colors={colors} />
      )}

      {phase === 'game' && (
        phraseQuery.isLoading ? (
          <View style={styles.center}><FunFactLoader color={colors.primary} /></View>
        ) : phrases.length < GAME_CONFIG.listenAndPick.choiceCount ? (
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Need at least {GAME_CONFIG.listenAndPick.choiceCount} phrases. Choose another topic.
            </Text>
          </View>
        ) : (
          <GameRound
            key={gameKey}
            phrases={phrases}
            activeLanguage={activeLanguage}
            soundOn={soundOn}
            onEnd={handleEnd}
            colors={colors}
          />
        )
      )}

      {phase === 'end' && (
        <EndScreen
          score={finalScore}
          total={GAME_CONFIG.listenAndPick.roundSize}
          xpEarned={finalXp}
          misses={finalMisses}
          // Clear last run's misses so the next end screen only shows this run's.
          onPlayAgain={() => { setFinalMisses([]); setGameKey(k => k + 1); setPhase('game'); }}
          onChooseTopic={() => { setSelectedCategory(null); setPhase('picker'); }}
          colors={colors}
        />
      )}
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  h2: { fontFamily: AppFonts.extrabold, fontSize: 22, textAlign: 'center' },
  sub: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center' },
  pickerLabel: { fontFamily: AppFonts.semibold, fontSize: 13, marginBottom: 4 },
  pickerList: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  topicIcon: { fontSize: 24, width: 36, textAlign: 'center' },
  topicTitle: { fontFamily: AppFonts.bold, fontSize: 15 },
  topicSub: { fontFamily: AppFonts.regular, fontSize: 12 },
  textBtn: { paddingVertical: 8 },
  textBtnLabel: { fontFamily: AppFonts.regular, fontSize: 14 },
  statsGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  statCardValue: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  statCardLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  progressSection: { gap: 6 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontFamily: AppFonts.semibold, fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 4 },
  listenCard: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
  },
  listenLabel: { fontFamily: AppFonts.regular, fontSize: 14 },
  playBtn: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  choiceCard: {
    minHeight: 90,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  choiceLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 16,
    textAlign: 'center',
  },
  choiceEnglish: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
    opacity: 0.85,
  },
  feedbackIcon: { position: 'absolute', top: 8, right: 8 },
  emptyText: { fontFamily: AppFonts.regular, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  continueBtn: {
    marginTop: 4,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLabel: { fontFamily: AppFonts.bold, fontSize: 15, color: '#FFFFFF' },
});
