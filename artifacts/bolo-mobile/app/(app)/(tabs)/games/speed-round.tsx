import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListCategories,
  useListCategoryPhrases,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
  type Category,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Mascot } from '@/components/Mascot';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { hapticMedium, hapticNotify } from '@/lib/haptics';
import * as Haptics from 'expo-haptics';

const GAME_DURATION = 60;
const STREAK_BONUS_THRESHOLD = 3;
const STREAK_MULTIPLIER = 1.5;

type GamePhase = 'setup' | 'playing' | 'done';

interface Phrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
}

// selectedPhraseId is what the learner tapped; server checks selectedPhraseId === phraseId
interface PhraseResult {
  phraseId: number;
  selectedPhraseId: number;
}

interface GameStats {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
  points: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOptions(
  correct: Phrase,
  pool: Phrase[],
  hardMode: boolean,
): { label: string; phraseId: number; isCorrect: boolean }[] {
  const distractors = shuffle(pool.filter((p) => p.id !== correct.id)).slice(0, 3);
  const all = shuffle([correct, ...distractors]);
  return all.map((p) => ({
    label: hardMode ? p.nativeScript : p.english,
    phraseId: p.id,
    isCorrect: p.id === correct.id,
  }));
}

// ─── Setup Screen ────────────────────────────────────────────────────────────

function SetupScreen({
  onStart,
}: {
  onStart: (categoryId: number, hardMode: boolean) => void;
}) {
  const router = useRouter();
  const colors = useColors();
  const { activeLang } = useLanguage();
  const { data: categories = [] } = useListCategories({ lang: activeLang });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hardMode, setHardMode] = useState(false);

  const chosen = selectedId ?? categories[0]?.id ?? null;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Speed Round</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.setupContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroArea}>
          <View style={[styles.heroBubble, { backgroundColor: '#FEF3C7' }]}>
            <Feather name="zap" size={40} color="#F59E0B" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Ready to race?</Text>
          <Text style={[styles.heroDesc, { color: colors.mutedForeground }]}>
            60 seconds. One phrase. Four choices. How many can you get?
          </Text>
        </View>

        {/* Category list */}
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Topic</Text>
        {categories.map((cat) => (
          <PressableScale
            key={cat.id}
            onPress={() => setSelectedId(cat.id)}
            style={[
              styles.catCard,
              {
                backgroundColor: chosen === cat.id ? `${colors.primary}15` : colors.card,
                borderColor: chosen === cat.id ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.catTitle, { color: chosen === cat.id ? colors.primary : colors.foreground }]}>
              {cat.title}
            </Text>
            {chosen === cat.id && <Feather name="check" size={16} color={colors.primary} />}
          </PressableScale>
        ))}

        {/* Hard mode toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Hard Mode</Text>
            <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>
              Options show native script only
            </Text>
          </View>
          <Switch
            value={hardMode}
            onValueChange={setHardMode}
            trackColor={{ true: colors.primary }}
          />
        </View>

        {/* Stats strip */}
        <View style={[styles.statsStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>60s</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Time</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.primary }]}>×1.5</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Streak</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>Free</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Plan</Text>
          </View>
        </View>

        <ChunkyButton
          title="Start Game"
          onPress={() => chosen !== null && onStart(chosen, hardMode)}
          disabled={!chosen}
          style={styles.startBtn}
        />
      </ScrollView>
    </Screen>
  );
}

// ─── Playing Screen ───────────────────────────────────────────────────────────

function PlayingScreen({
  categoryId,
  hardMode,
  onDone,
}: {
  categoryId: number;
  hardMode: boolean;
  onDone: (results: PhraseResult[], stats: GameStats) => void;
}) {
  const colors = useColors();
  const { activeLang, activeLanguage } = useLanguage();
  const { data: allPhrases = [], isLoading } = useListCategoryPhrases(categoryId, activeLang);

  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<{ label: string; phraseId: number; isCorrect: boolean }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [results, setResults] = useState<PhraseResult[]>([]);
  const [stats, setStats] = useState<GameStats>({ correct: 0, total: 0, streak: 0, bestStreak: 0, points: 0 });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (allPhrases.length === 0) return;
    const q = shuffle(allPhrases as Phrase[]);
    setQueue(q);
    setCurrentIndex(0);
    setStarted(true);
  }, [allPhrases]);

  useEffect(() => {
    if (queue.length === 0) return;
    const phrase = queue[currentIndex % queue.length];
    setOptions(buildOptions(phrase, queue as Phrase[], hardMode));
    setSelected(null);
    setFeedback(null);
  }, [queue, currentIndex, hardMode]);

  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(id); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [started]);

  const resultsRef = useRef(results);
  const statsRef = useRef(stats);
  resultsRef.current = results;
  statsRef.current = stats;

  useEffect(() => {
    if (timeLeft === 0 && started) {
      onDone(resultsRef.current, statsRef.current);
    }
  }, [timeLeft, started, onDone]);

  const handleAnswer = useCallback(
    (opt: { phraseId: number; isCorrect: boolean }) => {
      if (selected !== null) return;
      setSelected(opt.phraseId);
      const correct = opt.isCorrect;
      setFeedback(correct ? 'correct' : 'wrong');
      const phrase = queue[currentIndex % queue.length];
      // Send the tapped option's phraseId; server determines correct = (selectedPhraseId === phraseId)
      setResults((prev) => [...prev, { phraseId: phrase.id, selectedPhraseId: opt.phraseId }]);
      setStats((prev) => {
        const newStreak = correct ? prev.streak + 1 : 0;
        const multiplier = newStreak >= STREAK_BONUS_THRESHOLD ? STREAK_MULTIPLIER : 1;
        const gained = correct ? Math.round(100 * multiplier) : 0;
        return {
          correct: prev.correct + (correct ? 1 : 0),
          total: prev.total + 1,
          streak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
          points: prev.points + gained,
        };
      });
      hapticNotify(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => setCurrentIndex((i) => i + 1), correct ? 400 : 1000);
    },
    [selected, queue, currentIndex],
  );

  if (isLoading || queue.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading phrases…</Text>
        </View>
      </Screen>
    );
  }

  const phrase = queue[currentIndex % queue.length];
  const timerPct = (timeLeft / GAME_DURATION) * 100;
  const isLowTime = timeLeft <= 10;
  const nativeStyle = nativeTextStyle(activeLanguage);

  return (
    <Screen>
      {/* Timer bar */}
      <View style={[styles.timerBarBg, { backgroundColor: colors.muted }]}>
        <View
          style={[
            styles.timerBarFill,
            { width: `${timerPct}%` as any, backgroundColor: isLowTime ? '#EF4444' : '#F59E0B' },
          ]}
        />
      </View>

      {/* Header row */}
      <View style={styles.playHeader}>
        <View style={styles.playStatRow}>
          <Feather name="clock" size={14} color={isLowTime ? '#EF4444' : colors.foreground} />
          <Text style={[styles.timerText, { color: isLowTime ? '#EF4444' : colors.foreground }]}>
            {timeLeft}s
          </Text>
        </View>
        <View style={styles.playStatRow}>
          <Feather name="zap" size={14} color="#F59E0B" />
          <Text style={[styles.streakText, { color: '#F59E0B' }]}>{stats.streak}</Text>
        </View>
        <View style={styles.playStatRow}>
          <Feather name="award" size={14} color={colors.primary} />
          <Text style={[styles.pointsText, { color: colors.primary }]}>{stats.points}</Text>
        </View>
      </View>

      {/* Question */}
      <View style={styles.questionArea}>
        <Text style={[styles.questionCounter, { color: colors.mutedForeground }]}>
          {stats.total + 1} answered
        </Text>
        <Animated.Text
          key={currentIndex}
          entering={FadeIn.duration(200)}
          style={[styles.phraseText, { color: colors.foreground }, nativeStyle]}
        >
          {phrase.nativeScript}
        </Animated.Text>
        {!hardMode && phrase.romanized ? (
          <Text style={[styles.romanized, { color: colors.mutedForeground }]}>{phrase.romanized}</Text>
        ) : null}
        <Text style={[styles.promptHint, { color: colors.mutedForeground }]}>
          {hardMode ? 'Pick the native-script match' : 'Pick the English translation'}
        </Text>
      </View>

      {/* Options */}
      <View style={styles.optionsGrid}>
        {options.map((opt) => {
          const isSelected = selected === opt.phraseId;
          const showCorrect = feedback !== null && opt.isCorrect;
          const showWrong = isSelected && feedback === 'wrong';
          const bg = showCorrect
            ? '#D1FAE5'
            : showWrong
            ? '#FEE2E2'
            : selected !== null
            ? colors.muted
            : colors.card;
          const textColor = showCorrect
            ? '#065F46'
            : showWrong
            ? '#991B1B'
            : selected !== null
            ? colors.mutedForeground
            : colors.foreground;
          const borderColor = showCorrect
            ? '#10B981'
            : showWrong
            ? '#EF4444'
            : colors.border;

          return (
            <PressableScale
              key={opt.phraseId}
              onPress={() => handleAnswer(opt)}
              disabled={selected !== null}
              style={[styles.optionBtn, { backgroundColor: bg, borderColor }]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: textColor },
                  hardMode ? nativeStyle : undefined,
                ]}
                numberOfLines={2}
              >
                {opt.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </Screen>
  );
}

// ─── Done Screen ──────────────────────────────────────────────────────────────

function DoneScreen({
  stats,
  results,
  categoryId,
  onPlayAgain,
  onChangeTopic,
}: {
  stats: GameStats;
  results: PhraseResult[];
  categoryId: number;
  onPlayAgain: () => void;
  onChangeTopic: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { activeLang } = useLanguage();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current || results.length === 0) return;
    submitted.current = true;
    recordSession.mutate(
      {
        data: {
          languageCode: activeLang,
          game: 'speed-round',
          categoryId,
          phraseResults: results,
        },
      },
      {
        onSuccess: (data) => {
          setXpEarned(data.xpEarned);
          queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const pose = stats.correct >= 10 ? 'cheer' : stats.correct >= 3 ? 'thumbsup' : 'tryagain';

  return (
    <Screen>
      <View style={styles.doneContent}>
        <Mascot pose={pose} size={110} motion="float" />
        <Text style={[styles.doneTitle, { color: colors.foreground }]}>
          {stats.correct === 0 ? 'Nice try!' : stats.correct >= 10 ? 'Incredible!' : 'Great round!'}
        </Text>

        <View style={styles.resultGrid}>
          <ResultCard label="Correct" value={`${stats.correct}/${stats.total}`} valueColor="#10B981" colors={colors} />
          <ResultCard label="Accuracy" value={`${accuracy}%`} valueColor={colors.primary} colors={colors} />
          <ResultCard
            label="Best Streak"
            value={String(stats.bestStreak)}
            valueColor="#F59E0B"
            colors={colors}
            icon="zap"
          />
          <ResultCard
            label="XP Earned"
            value={xpEarned !== null ? `+${xpEarned}` : '…'}
            valueColor="#7C3AED"
            colors={colors}
          />
        </View>

        {stats.bestStreak >= STREAK_BONUS_THRESHOLD && (
          <Text style={[styles.bonusNote, { color: '#F59E0B' }]}>
            🔥 ×1.5 streak bonus applied!
          </Text>
        )}

        <View style={styles.doneActions}>
          <ChunkyButton title="Play Again" onPress={onPlayAgain} icon="rotate-cw" />
          <ChunkyButton title="Change Topic" onPress={onChangeTopic} variant="secondary" icon="home" />
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: colors.mutedForeground }]}>Back to Games</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function ResultCard({
  label,
  value,
  valueColor,
  colors,
  icon,
}: {
  label: string;
  value: string;
  valueColor: string;
  colors: ReturnType<typeof useColors>;
  icon?: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon && <Feather name={icon} size={16} color={valueColor} />}
        <Text style={[styles.resultValue, { color: valueColor }]}>{value}</Text>
      </View>
      <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SpeedRoundScreen() {
  const { isPlus, isLoading } = useEntitlements();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isPlus) {
      router.replace('/(app)/paywall' as never);
    }
  }, [isLoading, isPlus, router]);

  const [phase, setPhase] = useState<GamePhase>('setup');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [hardMode, setHardMode] = useState(false);
  const [finalResults, setFinalResults] = useState<PhraseResult[]>([]);
  const [finalStats, setFinalStats] = useState<GameStats>({ correct: 0, total: 0, streak: 0, bestStreak: 0, points: 0 });
  const [gameKey, setGameKey] = useState(0);

  const handleDone = useCallback((results: PhraseResult[], stats: GameStats) => {
    setFinalResults(results);
    setFinalStats(stats);
    setPhase('done');
  }, []);

  if (phase === 'setup') return <SetupScreen onStart={(id, hard) => { setCategoryId(id); setHardMode(hard); setPhase('playing'); }} />;
  if (phase === 'playing' && categoryId !== null) {
    return <PlayingScreen key={gameKey} categoryId={categoryId} hardMode={hardMode} onDone={handleDone} />;
  }
  if (phase === 'done' && categoryId !== null) {
    return (
      <DoneScreen
        stats={finalStats}
        results={finalResults}
        categoryId={categoryId}
        onPlayAgain={() => { setGameKey((k) => k + 1); setPhase('playing'); }}
        onChangeTopic={() => { setPhase('setup'); setCategoryId(null); }}
      />
    );
  }
  return <SetupScreen onStart={(id, hard) => { setCategoryId(id); setHardMode(hard); setPhase('playing'); }} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: { fontFamily: AppFonts.bold, fontSize: 18 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  setupContent: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 12 },
  heroArea: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  heroBubble: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  heroDesc: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sectionLabel: { fontFamily: AppFonts.semibold, fontSize: 13 },
  catCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  catTitle: { fontFamily: AppFonts.semibold, fontSize: 15, flex: 1 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  toggleTitle: { fontFamily: AppFonts.semibold, fontSize: 15 },
  toggleDesc: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  statsStrip: {
    flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statDivider: { width: 1 },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 11, marginTop: 2 },
  startBtn: { marginTop: 8 },
  // Playing
  timerBarBg: { height: 4, width: '100%' },
  timerBarFill: { height: 4 },
  playHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  playStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontFamily: AppFonts.bold, fontSize: 14 },
  streakText: { fontFamily: AppFonts.bold, fontSize: 14 },
  pointsText: { fontFamily: AppFonts.bold, fontSize: 14 },
  questionArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  questionCounter: { fontFamily: AppFonts.regular, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  phraseText: { fontFamily: AppFonts.bold, fontSize: 30, textAlign: 'center' },
  romanized: { fontFamily: AppFonts.regular, fontSize: 14 },
  promptHint: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 4 },
  optionsGrid: { paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE, gap: 10 },
  optionBtn: {
    borderWidth: 1, borderRadius: 16, padding: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  optionText: { fontFamily: AppFonts.semibold, fontSize: 15, textAlign: 'center' },
  // Done
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: AppFonts.regular, fontSize: 15 },
  doneContent: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24, gap: 12 },
  doneTitle: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%' },
  resultCard: {
    width: '46%', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: 16, borderWidth: 1, gap: 4,
  },
  resultValue: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  resultLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  bonusNote: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 4 },
  doneActions: { width: '100%', gap: 10, marginTop: 8 },
  backLink: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center', textDecorationLine: 'underline' },
});
