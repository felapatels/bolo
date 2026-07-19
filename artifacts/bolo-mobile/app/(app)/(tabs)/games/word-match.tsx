import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { categoryIcon } from '@/lib/ui';
import { useRouter } from 'expo-router';
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
  type Phrase,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { useLanguage } from '@/contexts/LanguageContext';
import { GAME_CONFIG } from '@/lib/game-config';

// ─── Types ───────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'normal';
type Phase = 'picker' | 'difficulty' | 'game' | 'end';

interface GameCard {
  id: string;
  pairId: number;
  type: 'native' | 'english';
  label: string;
  /** Romanization shown below native script on the back face so learners can read it. */
  romanized?: string;
  state: 'hidden' | 'flipped' | 'matched' | 'error';
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

function buildCards(phrases: Phrase[], pairCount: number): GameCard[] {
  const pool = shuffleArray([...phrases]).slice(0, pairCount);
  const cards: GameCard[] = [];
  for (const p of pool) {
    cards.push({ id: `${p.id}-n`, pairId: p.id, type: 'native', label: p.nativeScript, romanized: p.romanized ?? undefined, state: 'hidden' });
    cards.push({ id: `${p.id}-e`, pairId: p.id, type: 'english', label: p.english, state: 'hidden' });
  }
  return shuffleArray(cards);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Flip Card ────────────────────────────────────────────────────────────────

function FlipCard({
  card,
  onFlip,
  nativeProps,
  colors,
  width,
  height,
}: {
  card: GameCard;
  onFlip: (id: string) => void;
  nativeProps: ReturnType<typeof nativeTextStyle>;
  colors: ReturnType<typeof useColors>;
  width: number;
  height: number;
}) {
  const progress = useSharedValue(card.state !== 'hidden' ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(card.state !== 'hidden' ? 1 : 0, {
      duration: GAME_CONFIG.wordMatch.mismatchDelay < 900 ? 300 : 350,
      easing: Easing.out(Easing.cubic),
    });
  }, [card.state, progress]);

  // backfaceVisibility:'hidden' is unreliable on iOS with Reanimated.
  // Instead we snap opacity at the halfway point so only one face is visible at
  // a time, and add perspective so the rotation looks 3-D.
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
    opacity: interpolate(progress.value, [0, 0.49, 0.5, 1], [1, 1, 0, 0]),
  }));

  // Layout props (position/top/left/right/bottom) must NOT go inside
  // useAnimatedStyle on Reanimated 3 + New Architecture — they crash the native
  // runtime at worklet init time. Keep only animatable props here; layout lives
  // in styles.cardFace (applied as a separate static style below).
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` },
    ],
    opacity: interpolate(progress.value, [0, 0.49, 0.5, 1], [0, 0, 1, 1]),
  }));

  const isMatched = card.state === 'matched';
  const isError = card.state === 'error';

  const backBg = isMatched
    ? '#10B98120'
    : isError
    ? '#EF444420'
    : `${colors.primary}18`;

  const backBorder = isMatched
    ? '#10B981'
    : isError
    ? '#EF4444'
    : colors.primary;

  const textColor = isMatched
    ? '#10B981'
    : isError
    ? '#EF4444'
    : colors.foreground;

  // GestureDetector sits above both absolutely-positioned animated faces so it
  // receives taps regardless of which face is on top — no pointerEvents needed.
  const tap = Gesture.Tap()
    .enabled(card.state === 'hidden')
    .onEnd(() => runOnJS(onFlip)(card.id));

  return (
    <GestureDetector gesture={tap}>
      <View style={{ width, height, borderRadius: 14 }}>
        {/* Front (hidden face) — pointerEvents="none" so touches reach GestureDetector */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.cardFace,
            frontStyle,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Image
            source={require('../../../../assets/images/mascot/mascot-wave.png')}
            style={styles.cardBird}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Back (revealed face) — pointerEvents="none" so touches reach GestureDetector.
            styles.cardFace provides layout (position/inset);
            backStyle provides only animatable props (transform + opacity). */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.cardFace,
            { backgroundColor: backBg, borderColor: backBorder, borderWidth: 2 },
            backStyle,
          ]}
        >
          {card.type === 'native' ? (
            /* Native card: script on top, romanization below so learners can read it */
            <>
              <Text
                style={[styles.cardLabel, nativeProps, { color: textColor }]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {card.label}
              </Text>
              {card.romanized ? (
                <Text
                  style={[styles.cardRomanized, { color: textColor }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {card.romanized}
                </Text>
              ) : null}
            </>
          ) : (
            /* English card: just the meaning */
            <Text
              style={[styles.cardLabel, { color: textColor }]}
              numberOfLines={3}
              adjustsFontSizeToFit
            >
              {card.label}
            </Text>
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// Minimum phrase counts required per difficulty.
// Easy: 6 pairs → 6 unique phrases; Normal: 8 pairs → 8 unique phrases.
const WORD_MATCH_MIN_EASY = 6;
const WORD_MATCH_MIN_NORMAL = 8;

// ─── Topic Picker ─────────────────────────────────────────────────────────────

function TopicPicker({
  activeLang,
  onSelect,
  colors,
}: {
  activeLang: string;
  onSelect: (id: number, title: string, count: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { data: categories, isLoading } = useListCategories({ lang: activeLang });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.pickerList, { paddingBottom: TAB_BAR_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>
        Choose a topic to match
      </Text>
      {(categories ?? []).map((cat) => {
        // Require at least 6 phrases so the Easy (4×3, 6-pair) grid is always full.
        const disabled = cat.phraseCount < WORD_MATCH_MIN_EASY;
        return (
          <PressableScale
            key={cat.id}
            onPress={() => onSelect(cat.id, cat.title, cat.phraseCount)}
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
                {disabled ? `Need ${WORD_MATCH_MIN_EASY}+ phrases` : `${cat.phraseCount} phrases`}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

// ─── Difficulty Picker ────────────────────────────────────────────────────────

function DifficultyPicker({
  topicTitle,
  phraseCount,
  onSelect,
  onBack,
  colors,
}: {
  topicTitle: string;
  phraseCount: number;
  onSelect: (d: Difficulty) => void;
  onBack: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const canNormal = phraseCount >= WORD_MATCH_MIN_NORMAL;

  return (
    <View style={styles.centerPad}>
      <Mascot pose="cheer" size={80} />
      <Text style={[styles.h2, { color: colors.foreground }]}>{topicTitle}</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>Pick a grid size</Text>

      <PressableScale
        onPress={() => onSelect('easy')}
        style={[styles.diffBtn, { backgroundColor: '#10B98120', borderColor: '#10B981' }]}
      >
        <Text style={[styles.diffBtnTitle, { color: '#10B981' }]}>Easy</Text>
        <Text style={[styles.diffBtnSub, { color: '#10B981' }]}>
          4 × 3 grid · 6 pairs · {GAME_CONFIG.wordMatch.xpEasy} XP
        </Text>
      </PressableScale>

      <PressableScale
        onPress={() => canNormal && onSelect('normal')}
        disabled={!canNormal}
        style={[
          styles.diffBtn,
          { backgroundColor: `${colors.primary}18`, borderColor: colors.primary, opacity: canNormal ? 1 : 0.4 },
        ]}
      >
        <Text style={[styles.diffBtnTitle, { color: colors.primary }]}>Normal</Text>
        <Text style={[styles.diffBtnSub, { color: colors.primary }]}>
          {canNormal
            ? `4 × 4 grid · 8 pairs · ${GAME_CONFIG.wordMatch.xpNormal} XP`
            : 'Need 8+ phrases in topic'}
        </Text>
      </PressableScale>

      <Pressable onPress={onBack} style={styles.textBtn}>
        <Text style={[styles.textBtnLabel, { color: colors.mutedForeground }]}>← Back to topics</Text>
      </Pressable>
    </View>
  );
}

// ─── Game Board ───────────────────────────────────────────────────────────────

function GameBoard({
  phrases,
  difficulty,
  activeLanguage,
  onEnd,
  colors,
}: {
  phrases: Phrase[];
  difficulty: Difficulty;
  activeLanguage: ReturnType<typeof useLanguage>['activeLanguage'];
  onEnd: (elapsed: number, usedPhraseIds: number[]) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const nativeProps = nativeTextStyle(activeLanguage);
  const pairCount = difficulty === 'easy' ? 6 : 8;

  const [cards, setCards] = useState<GameCard[]>(() => buildCards(phrases, pairCount));
  const [flipped, setFlipped] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const matchedCount = cards.filter(c => c.state === 'matched').length;
  const allMatched = matchedCount === cards.length;

  useEffect(() => {
    if (allMatched) {
      if (timerRef.current) clearInterval(timerRef.current);
      const total = Math.floor((Date.now() - startRef.current) / 1000);
      const usedPhraseIds = [...new Set(cards.map(c => c.pairId))];
      setTimeout(() => onEnd(total, usedPhraseIds), 600);
    }
  }, [allMatched, onEnd]);

  const handleFlip = useCallback((id: string) => {
    if (locked) return;

    setCards(prev => prev.map(c => c.id === id ? { ...c, state: 'flipped' as const } : c));

    setFlipped(prev => {
      const next = [...prev, id];
      if (next.length < 2) return next;

      setLocked(true);
      const [aId, bId] = next;

      setCards(current => {
        const a = current.find(c => c.id === aId)!;
        const b = current.find(c => c.id === bId)!;
        const isMatch = a.pairId === b.pairId && a.type !== b.type;

        if (isMatch) {
          const updated = current.map(c =>
            c.id === aId || c.id === bId ? { ...c, state: 'matched' as const } : c
          );
          setLocked(false);
          return updated;
        } else {
          const updated = current.map(c =>
            c.id === aId || c.id === bId ? { ...c, state: 'error' as const } : c
          );
          setTimeout(() => {
            setCards(cc =>
              cc.map(c =>
                c.id === aId || c.id === bId ? { ...c, state: 'hidden' as const } : c
              )
            );
            setLocked(false);
          }, GAME_CONFIG.wordMatch.mismatchDelay);
          return updated;
        }
      });

      return [];
    });
  }, [locked]);

  const COLS = 4;
  const ROWS = difficulty === 'easy' ? 3 : 4;
  const GAP = 8;

  const [gridSize, setGridSize] = useState<{ width: number; height: number } | null>(null);
  const cardWidth  = gridSize ? (gridSize.width  - GAP * (COLS - 1)) / COLS : null;
  const cardHeight = gridSize ? (gridSize.height - GAP * (ROWS - 1)) / ROWS : null;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, gap: GAP }}>
      {/* Stats row */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Feather name="clock" size={14} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{formatTime(elapsed)}</Text>
        </View>
        <Text style={[styles.statText, { color: colors.mutedForeground }]}>
          {matchedCount / 2} / {pairCount} pairs
        </Text>
      </View>

      {/* Card grid — flex:1 so it takes all remaining height; onLayout measures actual size */}
      <View
        style={[styles.grid, { gap: GAP, flex: 1 }]}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setGridSize(prev =>
            prev?.width === width && prev?.height === height ? prev : { width, height },
          );
        }}
      >
        {cardWidth && cardHeight
          ? cards.map(card => (
              <FlipCard
                key={card.id}
                card={card}
                onFlip={handleFlip}
                nativeProps={nativeProps}
                colors={colors}
                width={cardWidth}
                height={cardHeight}
              />
            ))
          : null}
      </View>
    </View>
  );
}

// ─── End Screen ───────────────────────────────────────────────────────────────

function EndScreen({
  elapsed,
  difficulty,
  categoryId,
  usedPhraseIds,
  activeLang,
  onPlayAgain,
  onChooseTopic,
  colors,
}: {
  elapsed: number;
  difficulty: Difficulty;
  categoryId: number;
  usedPhraseIds: number[];
  activeLang: string;
  onPlayAgain: () => void;
  onChooseTopic: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current || usedPhraseIds.length === 0) return;
    submitted.current = true;
    recordSession.mutate(
      {
        data: {
          languageCode: activeLang,
          game: 'word-match',
          categoryId,
          phraseResults: usedPhraseIds.map((id) => ({ phraseId: id, selectedPhraseId: id })),
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

  return (
    <View style={styles.centerPad}>
      <Mascot pose="cheer" size={100} />
      <Text style={[styles.h2, { color: colors.foreground }]}>All Matched! 🎉</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {difficulty === 'easy' ? 'Easy' : 'Normal'} mode complete
      </Text>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="clock" size={20} color={colors.mutedForeground} />
          <Text style={[styles.statCardValue, { color: colors.foreground }]}>{formatTime(elapsed)}</Text>
          <Text style={[styles.statCardLabel, { color: colors.mutedForeground }]}>Time</Text>
        </View>
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
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WordMatchScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();

  const [phase, setPhase] = useState<Phase>('picker');
  const [selectedCategory, setSelectedCategory] = useState<{ id: number; title: string; count: number } | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [elapsed, setElapsed] = useState(0);
  const [usedPhraseIds, setUsedPhraseIds] = useState<number[]>([]);
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

  const handleTopicSelect = (id: number, title: string, count: number) => {
    setSelectedCategory({ id, title, count });
    setPhase('difficulty');
  };

  const handleDifficultySelect = (d: Difficulty) => {
    setDifficulty(d);
    setGameKey(k => k + 1);
    setPhase('game');
  };

  const handleEnd = (t: number, ids: number[]) => {
    setElapsed(t);
    setUsedPhraseIds(ids);
    setPhase('end');
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (phase === 'picker') router.back();
            else if (phase === 'difficulty') setPhase('picker');
            else setPhase('picker');
          }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Word Match</Text>
          {activeLanguage && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{activeLanguage.name}</Text>
          )}
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Content */}
      {phase === 'picker' && (
        <TopicPicker activeLang={activeLang} onSelect={handleTopicSelect} colors={colors} />
      )}

      {phase === 'difficulty' && selectedCategory && (
        <DifficultyPicker
          topicTitle={selectedCategory.title}
          phraseCount={selectedCategory.count}
          onSelect={handleDifficultySelect}
          onBack={() => setPhase('picker')}
          colors={colors}
        />
      )}

      {phase === 'game' && (
        phraseQuery.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : phrases.length < (difficulty === 'easy' ? WORD_MATCH_MIN_EASY : WORD_MATCH_MIN_NORMAL) ? (
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Not enough phrases. Choose another topic.
            </Text>
          </View>
        ) : (
          <GameBoard
            key={gameKey}
            phrases={phrases}
            difficulty={difficulty}
            activeLanguage={activeLanguage}
            onEnd={handleEnd}
            colors={colors}
          />
        )
      )}

      {phase === 'end' && selectedCategory && (
        <EndScreen
          elapsed={elapsed}
          difficulty={difficulty}
          categoryId={selectedCategory.id}
          usedPhraseIds={usedPhraseIds}
          activeLang={activeLang}
          onPlayAgain={() => { setGameKey(k => k + 1); setPhase('game'); }}
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
  headerSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
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
  diffBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 2,
    gap: 4,
  },
  diffBtnTitle: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  diffBtnSub: { fontFamily: AppFonts.regular, fontSize: 13, opacity: 0.8 },
  textBtn: { paddingVertical: 8 },
  textBtnLabel: { fontFamily: AppFonts.regular, fontSize: 14 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontFamily: AppFonts.semibold, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  cardLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
    textAlign: 'center',
  },
  cardRomanized: {
    fontFamily: AppFonts.regular,
    fontSize: 9,
    textAlign: 'center',
    opacity: 0.75,
    marginTop: 2,
  },
  cardBird: {
    width: 48,
    height: 48,
  },
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
  emptyText: { fontFamily: AppFonts.regular, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
});
