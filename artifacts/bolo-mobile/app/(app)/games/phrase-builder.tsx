import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Mascot } from '@/components/Mascot';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import * as Haptics from 'expo-haptics';

const PHRASES_PER_ROUND = 6;

type GamePhase = 'setup' | 'playing' | 'done';

interface Phrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
}

// submittedText is the assembled words joined by space; server checks vs nativeScript
interface PhraseResult {
  phraseId: number;
  submittedText: string;
}

interface WordTile {
  word: string;
  tileId: string;
}

interface PhraseBuilderState {
  placed: WordTile[];
  tiles: WordTile[];
  status: 'idle' | 'correct' | 'wrong';
  wrongMask: boolean[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function pickPhrases(all: Phrase[]): Phrase[] {
  const multi = all.filter((p) => tokenize(p.nativeScript).length >= 2);
  const pool = shuffle(multi.length >= PHRASES_PER_ROUND ? multi : [...multi, ...shuffle(all)]);
  return pool.slice(0, PHRASES_PER_ROUND);
}

function initPhraseState(words: string[]): PhraseBuilderState {
  const shuffled = shuffle(words.map((w, i) => ({ word: w, tileId: `${w}-${i}` })));
  return { placed: [], tiles: shuffled, status: 'idle', wrongMask: [] };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function SetupScreen({ onStart }: { onStart: (categoryId: number) => void }) {
  const colors = useColors();
  const { activeLang } = useLanguage();
  const { data: categories = [] } = useListCategories({ lang: activeLang });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const chosen = selectedId ?? categories[0]?.id ?? null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Phrase Builder</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.setupContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroArea}>
          <View style={[styles.heroBubble, { backgroundColor: '#EEF2FF' }]}>
            <Feather name="layers" size={40} color="#6366F1" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Build the phrase</Text>
          <Text style={[styles.heroDesc, { color: colors.mutedForeground }]}>
            Tap word tiles to arrange them into the correct order.
          </Text>
        </View>

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

        <View style={[styles.statsStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: '#6366F1' }]}>{PHRASES_PER_ROUND}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Phrases</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.primary }]}>Tiles</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Tap to place</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>Free</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Plan</Text>
          </View>
        </View>

        <ChunkyButton
          title="Start Game"
          onPress={() => chosen !== null && onStart(chosen)}
          disabled={!chosen}
          style={styles.startBtn}
        />
      </ScrollView>
    </Screen>
  );
}

// ─── Playing ──────────────────────────────────────────────────────────────────

function PlayingScreen({
  categoryId,
  onDone,
}: {
  categoryId: number;
  onDone: (results: PhraseResult[], correctCount: number) => void;
}) {
  const colors = useColors();
  const { activeLang, activeLanguage } = useLanguage();
  const { data: allPhrases = [], isLoading } = useListCategoryPhrases(categoryId, activeLang);
  const nativeStyle = nativeTextStyle(activeLanguage);

  const [round, setRound] = useState<Phrase[]>([]);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [pState, setPState] = useState<PhraseBuilderState>({ placed: [], tiles: [], status: 'idle', wrongMask: [] });
  const [results, setResults] = useState<PhraseResult[]>([]);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    if (allPhrases.length === 0) return;
    const picked = pickPhrases(allPhrases as Phrase[]);
    setRound(picked);
    setPhraseIdx(0);
    const words = tokenize(picked[0].nativeScript);
    setPState(initPhraseState(words));
  }, [allPhrases]);

  const phrase = round[phraseIdx] ?? null;
  const targetWords = phrase ? tokenize(phrase.nativeScript) : [];
  const allPlaced = phrase ? pState.placed.length === targetWords.length : false;

  const placeTile = (tile: WordTile) => {
    if (pState.status !== 'idle') return;
    setPState((prev) => ({
      ...prev,
      tiles: prev.tiles.filter((t) => t.tileId !== tile.tileId),
      placed: [...prev.placed, tile],
    }));
  };

  const returnTile = (tile: WordTile) => {
    if (pState.status !== 'idle') return;
    setPState((prev) => ({
      ...prev,
      placed: prev.placed.filter((t) => t.tileId !== tile.tileId),
      tiles: [...prev.tiles, tile],
    }));
  };

  const handleCheck = () => {
    if (!phrase || !allPlaced) return;
    const placedWords = pState.placed.map((t) => t.word);
    const submittedText = placedWords.join(' ');
    const correct = submittedText === phrase.nativeScript;
    const mask = pState.placed.map((t, i) => t.word !== targetWords[i]);
    setPState((prev) => ({ ...prev, status: correct ? 'correct' : 'wrong', wrongMask: mask }));
    if (correct) {
      setCorrectCount((c) => c + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    // Send assembled text; server determines correctness server-side
    setResults((prev) => [...prev, { phraseId: phrase.id, submittedText }]);
  };

  const handleNext = () => {
    const next = phraseIdx + 1;
    if (next >= round.length) {
      // correctCount was already incremented in handleCheck for this phrase.
      onDone(results, correctCount);
      return;
    }
    setPhraseIdx(next);
    const words = tokenize(round[next].nativeScript);
    setPState(initPhraseState(words));
  };

  if (isLoading || round.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading phrases…</Text>
        </View>
      </Screen>
    );
  }

  const progressPct = ((phraseIdx + 1) / round.length) * 100;

  return (
    <Screen>
      {/* Progress bar */}
      <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: '#6366F1' }]} />
      </View>

      {/* Header */}
      <View style={styles.playHeader}>
        <Text style={[styles.phraseCounter, { color: colors.mutedForeground }]}>
          Phrase {phraseIdx + 1} of {round.length}
        </Text>
        <Text style={[styles.correctCounter, { color: '#6366F1' }]}>{correctCount} correct</Text>
      </View>

      <ScrollView contentContainerStyle={styles.playContent} showsVerticalScrollIndicator={false}>
        {/* English hint */}
        <View style={styles.hintArea}>
          <Text style={[styles.hintLabel, { color: colors.mutedForeground }]}>Translate to native script</Text>
          <Text style={[styles.hintEnglish, { color: colors.foreground }]}>{phrase?.english}</Text>
          {phrase?.romanized ? (
            <Text style={[styles.hintRomanized, { color: colors.mutedForeground }]}>{phrase.romanized}</Text>
          ) : null}
        </View>

        {/* Drop zone */}
        <View style={styles.dropZoneLabel}>
          <Text style={[styles.zoneLabel, { color: colors.mutedForeground }]}>Your answer</Text>
        </View>
        <View
          style={[
            styles.dropZone,
            {
              borderColor:
                pState.status === 'correct'
                  ? '#10B981'
                  : pState.status === 'wrong'
                  ? '#EF4444'
                  : colors.border,
              backgroundColor:
                pState.status === 'correct'
                  ? '#D1FAE540'
                  : pState.status === 'wrong'
                  ? '#FEE2E240'
                  : `${colors.card}80`,
            },
          ]}
        >
          <View style={styles.tilesWrap}>
            {pState.placed.map((tile, i) => {
              const isWrong = pState.status === 'wrong' && pState.wrongMask[i];
              return (
                <Pressable
                  key={tile.tileId}
                  onPress={() => returnTile(tile)}
                  disabled={pState.status !== 'idle'}
                  style={[
                    styles.tile,
                    {
                      backgroundColor:
                        pState.status === 'correct'
                          ? '#D1FAE5'
                          : isWrong
                          ? '#FEE2E2'
                          : `${colors.primary}18`,
                      borderColor:
                        pState.status === 'correct'
                          ? '#10B981'
                          : isWrong
                          ? '#EF4444'
                          : `${colors.primary}40`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tileText,
                      {
                        color:
                          pState.status === 'correct'
                            ? '#065F46'
                            : isWrong
                            ? '#991B1B'
                            : colors.primary,
                      },
                      nativeStyle,
                    ]}
                  >
                    {tile.word}
                  </Text>
                </Pressable>
              );
            })}
            {pState.placed.length === 0 && (
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Tap words below…</Text>
            )}
          </View>
        </View>

        {/* Feedback */}
        {pState.status === 'correct' && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.feedbackBox, { backgroundColor: '#D1FAE5' }]}>
            <Feather name="check-circle" size={18} color="#065F46" />
            <Text style={[styles.feedbackText, { color: '#065F46' }]}>Correct!</Text>
          </Animated.View>
        )}
        {pState.status === 'wrong' && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.feedbackBox, { backgroundColor: '#FEE2E2' }]}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Feather name="x-circle" size={18} color="#991B1B" />
                <Text style={[styles.feedbackText, { color: '#991B1B' }]}>Correct order:</Text>
              </View>
              <Text style={[styles.correctAnswer, { color: '#991B1B' }, nativeStyle]}>{phrase?.nativeScript}</Text>
            </View>
          </Animated.View>
        )}

        {/* Tile tray */}
        <Text style={[styles.zoneLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Available words</Text>
        <View style={styles.tilesWrap}>
          {pState.tiles.map((tile) => (
            <Pressable
              key={tile.tileId}
              onPress={() => placeTile(tile)}
              disabled={pState.status !== 'idle'}
              style={[
                styles.tile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pState.status !== 'idle' ? 0.4 : 1,
                },
              ]}
            >
              <Text style={[styles.tileText, { color: colors.foreground }, nativeStyle]}>{tile.word}</Text>
            </Pressable>
          ))}
          {pState.tiles.length === 0 && pState.status === 'idle' && (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>All placed — check!</Text>
          )}
        </View>

        {/* Action button */}
        <View style={styles.actionArea}>
          {pState.status === 'idle' ? (
            <ChunkyButton
              title="Check Answer"
              onPress={handleCheck}
              disabled={!allPlaced}
            />
          ) : (
            <ChunkyButton
              title={phraseIdx + 1 >= round.length ? 'See Results' : 'Next Phrase →'}
              onPress={handleNext}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneScreen({
  results,
  correctCount,
  categoryId,
  onPlayAgain,
  onChangeTopic,
}: {
  results: PhraseResult[];
  correctCount: number;
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
      { data: { languageCode: activeLang, game: 'phrase-builder', categoryId, phraseResults: results } },
      {
        onSuccess: (data) => {
          setXpEarned(data.xpEarned);
          queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = results.length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const pose = correctCount === total ? 'cheer' : correctCount >= total / 2 ? 'thumbsup' : 'tryagain';

  return (
    <Screen>
      <View style={styles.doneContent}>
        <Mascot pose={pose} size={110} motion="float" />
        <Text style={[styles.doneTitle, { color: colors.foreground }]}>
          {correctCount === total ? 'Perfect!' : correctCount === 0 ? 'Keep practising!' : 'Well done!'}
        </Text>

        <View style={styles.resultGrid}>
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultValue, { color: '#10B981' }]}>{correctCount}/{total}</Text>
            <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>Correct</Text>
          </View>
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultValue, { color: colors.primary }]}>{accuracy}%</Text>
            <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>Accuracy</Text>
          </View>
          <View style={[styles.resultCardFull, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultValue, { color: '#7C3AED' }]}>
              {xpEarned !== null ? `+${xpEarned} XP` : '…'}
            </Text>
            <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>XP Earned</Text>
          </View>
        </View>

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

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function PhraseBuilderScreen() {
  const { isPlus, isLoading } = useEntitlements();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isPlus) {
      router.replace('/(app)/paywall' as never);
    }
  }, [isLoading, isPlus, router]);

  const [phase, setPhase] = useState<GamePhase>('setup');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [finalResults, setFinalResults] = useState<PhraseResult[]>([]);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const [gameKey, setGameKey] = useState(0);

  const handleDone = (results: PhraseResult[], correctCount: number) => {
    setFinalResults(results);
    setFinalCorrect(correctCount);
    setPhase('done');
  };

  if (phase === 'setup') return <SetupScreen onStart={(id) => { setCategoryId(id); setPhase('playing'); }} />;
  if (phase === 'playing' && categoryId !== null) {
    return <PlayingScreen key={gameKey} categoryId={categoryId} onDone={handleDone} />;
  }
  if (phase === 'done' && categoryId !== null) {
    return (
      <DoneScreen
        results={finalResults}
        correctCount={finalCorrect}
        categoryId={categoryId}
        onPlayAgain={() => { setGameKey((k) => k + 1); setPhase('playing'); }}
        onChangeTopic={() => { setPhase('setup'); setCategoryId(null); }}
      />
    );
  }
  return <SetupScreen onStart={(id) => { setCategoryId(id); setPhase('playing'); }} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  headerTitle: { fontFamily: AppFonts.bold, fontSize: 18 },
  setupContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  heroArea: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  heroBubble: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  heroDesc: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sectionLabel: { fontFamily: AppFonts.semibold, fontSize: 13 },
  catCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1 },
  catTitle: { fontFamily: AppFonts.semibold, fontSize: 15, flex: 1 },
  statsStrip: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statDivider: { width: 1 },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 11, marginTop: 2 },
  startBtn: { marginTop: 8 },
  // Playing
  progressBg: { height: 4, width: '100%' },
  progressFill: { height: 4 },
  playHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  phraseCounter: { fontFamily: AppFonts.semibold, fontSize: 13 },
  correctCounter: { fontFamily: AppFonts.bold, fontSize: 13 },
  playContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  hintArea: { alignItems: 'center', paddingVertical: 12 },
  hintLabel: { fontFamily: AppFonts.regular, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  hintEnglish: { fontFamily: AppFonts.bold, fontSize: 20, marginTop: 4, textAlign: 'center' },
  hintRomanized: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  dropZoneLabel: {},
  zoneLabel: { fontFamily: AppFonts.semibold, fontSize: 12 },
  dropZone: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, minHeight: 64,
    padding: 12, marginTop: 6,
  },
  tilesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 36 },
  tile: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  tileText: { fontFamily: AppFonts.semibold, fontSize: 15 },
  emptyHint: { fontFamily: AppFonts.regular, fontSize: 13, fontStyle: 'italic' },
  feedbackBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 14, padding: 14, marginTop: 8,
  },
  feedbackText: { fontFamily: AppFonts.bold, fontSize: 15 },
  correctAnswer: { fontFamily: AppFonts.semibold, fontSize: 15, marginTop: 2 },
  actionArea: { marginTop: 16 },
  // Loading + done
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: AppFonts.regular, fontSize: 15 },
  doneContent: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24, gap: 12 },
  doneTitle: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%' },
  resultCard: {
    width: '46%', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: 16, borderWidth: 1, gap: 4,
  },
  resultCardFull: {
    width: '100%', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: 16, borderWidth: 1, gap: 4,
  },
  resultValue: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  resultLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  doneActions: { width: '100%', gap: 10, marginTop: 8 },
  backLink: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center', textDecorationLine: 'underline' },
});
