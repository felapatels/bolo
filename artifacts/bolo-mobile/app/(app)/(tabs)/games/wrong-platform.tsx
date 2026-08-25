// Build 35 mobile parity, third quick game: Wrong Platform (odd one out, floor 3).
//
// Each round boards three phrases from the chosen topic plus ONE stray that
// wandered in from another topic; the learner spots the stray.
//
// The stray's id is NEVER submitted — it belongs to a different category and
// would fail the server's in-category validation. Every round is scored
// through a unique in-category ANCHOR instead, riding the frozen
// listen-and-pick model: a correct spot submits the anchor matched to itself,
// a wrong pick submits the anchor matched to a different in-category id. This
// is the single most breakable thing in the game and the reason the planner
// carries `anchor` and `locals` separately from `options`.
//
// Ported from web (gujarati-coach/src/pages/games/wrong-platform.tsx), which
// this must stay behaviourally identical to:
//   - UNTIMED: `secondsPerRound` is omitted, so no clock, no chip, no count-in
//     and `api.timedOut` never fires. There is no timeout path to handle.
//   - MIXED advance beats, deliberately not unified: a CORRECT spot
//     auto-advances after 700ms, a WRONG pick waits on "Tap to continue" so
//     the learner can study which tile was the stray.
//   - SILENT: the game speaks nothing, so it declares usesAudio={false} and
//     the shell renders no mute toggle.
//   - it never persists anything; the shell owns the single end-of-run POST.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  type Phrase,
} from '@workspace/api-client-react';
import {
  QuickGameShell,
  type QuickRoundProps,
} from '@/components/games/QuickGameShell';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { hapticNotify } from '@/lib/haptics';
import { quickGameById } from '@/lib/quick-games';

const CHACHAJI_ART = require('@/assets/images/stall/chachaji.png') as number;

/** What separates the free game from the paid one. Web's PARTS, same numbers. */
export type WrongPlatformPart = 1 | 2;

const PARTS: Record<
  WrongPlatformPart,
  { rounds: number; options: number; showEnglish: boolean; strayDistance: 'far' | 'near' }
> = {
  1: { rounds: 6, options: 4, showEnglish: true, strayDistance: 'far' },
  2: { rounds: 8, options: 6, showEnglish: false, strayDistance: 'near' },
};
/** Auto-advance delay on a CORRECT spot. Web's number; not Signal Lights' 650. */
const CORRECT_ADVANCE_MS = 700;

const GREEN = '#10B981';
const RED = '#EF4444';

export type PlatformQuestion = {
  /** Unique in-category anchor this round is scored through. */
  anchor: Phrase;
  /** The three in-category phrases (anchor first, before the options shuffle). */
  locals: Phrase[];
  stray: Phrase;
  options: Phrase[];
};

/**
 * Local Fisher-Yates. The planner owns its own shuffle rather than reaching
 * into the shell: shuffling is a game concern, and keeping it here is what
 * lets buildPlan stay pure and testable without rendering anything.
 * Returns a new array — the caller's lists are never mutated.
 */
function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Build the whole run up front. Faithful port of the web planner:
 *
 * The local pool is shuffled ONCE and walked with a cursor, reshuffling when
 * the cursor passes the end, so anchors spread evenly over a short topic
 * instead of repeating some phrases and never showing others. The stray pool
 * is shuffled once and read round-robin.
 *
 * Nothing carries a correct INDEX: the stray is stored as a phrase and the
 * tile position is re-derived at render from `options`. Tracking an index
 * across a shuffle is how these planners rot into marking the wrong tile
 * correct — silent, and it teaches the wrong answer.
 */
export function buildPlan(
  locals: Phrase[],
  strays: Phrase[],
  count: number,
  /** In-topic cards per round: options minus the one stray. Defaults to web's
   *  original three, so the existing planner tests are unaffected. */
  localsPerRound = 3,
): PlatformQuestion[] {
  const plan: PlatformQuestion[] = [];
  let pool = shuffle(locals);
  let poolIdx = 0;
  const strayPool = shuffle(strays);
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = shuffle(locals);
      poolIdx = 0;
    }
    const anchor = pool[poolIdx++]!;
    const others = shuffle(locals.filter((p) => p.id !== anchor.id)).slice(
      0,
      localsPerRound - 1,
    );
    const stray = strayPool[i % strayPool.length]!;
    const roundLocals = [anchor, ...others];
    plan.push({
      anchor,
      locals: roundLocals,
      stray,
      options: shuffle([...roundLocals, stray]),
    });
  }
  return plan;
}

/**
 * The two topics a part draws its strays from, by distance in roster order.
 * Web's strayCategoryIds, same rule: two rather than one so a run does not
 * repeat the same source topic every round, and deterministic so a reload
 * does not reshuffle the difficulty.
 */
export function strayCategoryIds(
  categories: { id: number; phraseCount: number }[],
  playingId: number,
  distance: 'far' | 'near',
): number[] {
  const playingIdx = categories.findIndex((c) => c.id === playingId);
  return categories
    .map((c, i) => ({ c, gap: playingIdx < 0 ? i : Math.abs(i - playingIdx) }))
    .filter(({ c }) => c.id !== playingId && c.phraseCount >= 1)
    .sort((a, b) => (distance === 'far' ? b.gap - a.gap : a.gap - b.gap))
    .slice(0, 2)
    .map(({ c }) => c.id);
}

function WrongPlatformRound({
  phrases,
  api,
  activeLang,
  activeLanguage,
  part,
}: QuickRoundProps & { part: WrongPlatformPart }) {
  const cfg = PARTS[part];
  const colors = useColors();
  const nativeProps = nativeTextStyle(activeLanguage);

  // The stray has to come from a DIFFERENT topic, so the round fetches other
  // categories itself (web does the same).
  //
  // IT USED TO BE THE FIRST OTHER CATEGORY, EVERY ROUND. All six strays came
  // from one fixed topic, so a learner who noticed had solved the game. Both
  // parts now alternate between two source topics chosen by distance: Part 1
  // takes the furthest, Part 2 the nearest, which is most of what makes Part 2
  // harder.
  const categoryId = phrases[0]?.categoryId ?? 0;
  const { data: categories } = useListCategories({ lang: activeLang });
  const strayIds = useMemo(
    () => strayCategoryIds(categories ?? [], categoryId, cfg.strayDistance),
    [categories, categoryId, cfg.strayDistance],
  );
  // TWO FIXED QUERIES, never a loop: hook count must not vary between renders.
  const strayA = useListCategoryPhrases(strayIds[0] ?? 0, activeLang, {
    query: {
      enabled: strayIds.length > 0,
      queryKey: getListCategoryPhrasesQueryKey(strayIds[0] ?? 0, activeLang),
    },
  });
  const strayB = useListCategoryPhrases(strayIds[1] ?? 0, activeLang, {
    query: {
      enabled: strayIds.length > 1,
      queryKey: getListCategoryPhrasesQueryKey(strayIds[1] ?? 0, activeLang),
    },
  });
  const strays = useMemo(
    () => [...(strayA.data ?? []), ...(strayB.data ?? [])],
    [strayA.data, strayB.data],
  );

  const [plan, setPlan] = useState<PlatformQuestion[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  /** Pending auto-advance, cleared on round change and unmount. */
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── The drag rig ────────────────────────────────────────────────────────
  //
  // PanResponder and Animated with useNativeDriver: FALSE, deliberately, and
  // not react-native-gesture-handler or reanimated. Neither is a dependency of
  // this app; they exist only transitively under expo-router, so using one
  // would promote a NATIVE package, which is the change class that cost two
  // failed builds on 2026-08-25. Worse, CLAUDE.md records that the native
  // animation driver is DEAD in release builds here (build 270 measured it on
  // device: useNativeDriver true came out flat while false kept moving in the
  // same binary), and reanimated 4 drives from native on the New Architecture.
  // A gesture-handler drag would feel perfect over Metro and ship frozen, and
  // rule 2 says a dev build can never clear an animation bug.
  //
  // Cards keep their own onPress as well. That is not a convenience fallback:
  // a drop target reachable only by dragging is not reachable by a screen
  // reader at all.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardRects = useRef<(LayoutRectangle | null)[]>([]);
  const tokenRect = useRef<LayoutRectangle | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Read by the responder, which is created once and must not close over a
  // stale render's handler.
  const pickRef = useRef<(idx: number) => void>(() => {});
  const answeredRef = useRef(false);

  /** Which card, if any, the token's centre is currently over. */
  const cardUnder = (dx: number, dy: number): number | null => {
    const t = tokenRect.current;
    if (!t) return null;
    const cx = t.x + t.width / 2 + dx;
    const cy = t.y + t.height / 2 + dy;
    for (let i = 0; i < cardRects.current.length; i++) {
      const r = cardRects.current[i];
      if (!r) continue;
      if (cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) {
        return i;
      }
    }
    return null;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !answeredRef.current,
      onMoveShouldSetPanResponder: () => !answeredRef.current,
      onPanResponderGrant: () => {
        setDragging(true);
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy });
        setHover(cardUnder(g.dx, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        const over = cardUnder(g.dx, g.dy);
        setDragging(false);
        setHover(null);
        // Home again either way: a token left sitting on a card it already
        // answered reads as a second pending move.
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();
        if (over !== null) pickRef.current(over);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        setHover(null);
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (plan === null && strays.length > 0) {
      setPlan(buildPlan(phrases, strays, cfg.rounds, cfg.options - 1));
    }
  }, [plan, strays, phrases, cfg.rounds, cfg.options]);

  // api.round is ZERO-BASED (shell contract), so it indexes the plan directly.
  useEffect(() => {
    setPicked(null);
    return () => {
      if (advanceRef.current) {
        clearTimeout(advanceRef.current);
        advanceRef.current = null;
      }
    };
  }, [api.round]);

  if (strayIds.length === 0) {
    // A one-topic language cannot produce a stray at all. Web says exactly
    // this rather than faking an odd one out from the same topic.
    return (
      <View style={styles.center}>
        <Text
          testID="wrong-platform-needs-topic"
          style={[styles.notice, { color: colors.mutedForeground }]}
        >
          This game needs phrases from a second topic. Play another game for now.
        </Text>
      </View>
    );
  }
  if (!plan) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="wrong-platform-loading" color={colors.primary} />
      </View>
    );
  }

  const q = plan[api.round];
  if (!q) return null;

  const answered = picked !== null;
  const strayIdx = q.options.findIndex((p) => p.id === q.stray.id);
  const wasCorrect = answered && picked === strayIdx;

  const submitFor = (pickIdx: number) => {
    const correct = pickIdx === strayIdx;
    if (correct) {
      api.submitRound({
        phraseId: q.anchor.id,
        selectedPhraseId: q.anchor.id,
        correct: true,
      });
      return;
    }
    // A wrong pick is always one of the three locals; map it to an
    // in-category id that DIFFERS from the anchor, or the server would score
    // a miss as a hit.
    const pickedPhrase = q.options[pickIdx]!;
    const wrongId =
      pickedPhrase.id !== q.anchor.id
        ? pickedPhrase.id
        : q.locals.find((p) => p.id !== q.anchor.id)!.id;
    api.submitRound({
      phraseId: q.anchor.id,
      selectedPhraseId: wrongId,
      correct: false,
      // The round asks which card came from another topic, so the review has
      // to name the stray — the anchor the round is SCORED through would read
      // as the wrong answer entirely.
      review: {
        prompt: 'Which one boarded at the wrong platform?',
        promptSub: q.options.map((p) => p.english).join(' · '),
        answer: pickedPhrase.english,
        correct: q.stray.english,
      },
    });
  };

  answeredRef.current = answered;
  pickRef.current = (idx: number) => handlePick(idx);

  const handlePick = (idx: number) => {
    if (answered) return;
    api.lockRound();
    setPicked(idx);
    const correct = idx === strayIdx;
    hapticNotify(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    // Correct spots move on by themselves; a miss waits for the learner.
    if (correct) {
      advanceRef.current = setTimeout(() => {
        advanceRef.current = null;
        submitFor(idx);
      }, CORRECT_ADVANCE_MS);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {q.options.map((p, idx) => {
          const isStray = answered && idx === strayIdx;
          const isWrongPick = answered && !wasCorrect && idx === picked;
          return (
            <PressableScale
              key={`${p.id}-${idx}`}
              testID={`wrong-platform-option-${idx}`}
              onPress={() => handlePick(idx)}
              disabled={answered}
              // Measured relative to the round's own wrapper, which is what
              // the token's rect is measured against too, so the hit test
              // never has to reach for a screen coordinate.
              onLayout={(e) => {
                cardRects.current[idx] = e.nativeEvent.layout;
              }}
              style={[
                styles.option,
                {
                  backgroundColor: isStray
                    ? GREEN_TINT
                    : isWrongPick
                      ? RED_TINT
                      : hover === idx
                        ? `${colors.primary}1A`
                        : colors.card,
                  borderColor: isStray
                    ? GREEN
                    : isWrongPick
                      ? RED
                      : hover === idx
                        ? colors.primary
                        : colors.border,
                },
              ]}
            >
              <Text
                style={[styles.optionNative, nativeProps, { color: colors.foreground }]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {p.nativeScript}
              </Text>
              {/* Romanized reading sits directly under the script, above the
                  English meaning. Empty romanized renders nothing. */}
              {p.romanized.trim() !== '' ? (
                <Text
                  testID={`wrong-platform-romanized-${p.id}`}
                  style={[styles.optionRomanized, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {p.romanized}
                </Text>
              ) : null}
              {/* PART 2 HIDES THE MEANING. With the English on the card the
                  round is "which of these English words is the odd one out",
                  which needs no language at all: the script and the
                  romanization above it are decoration. */}
              {cfg.showEnglish ? (
                <Text
                  style={[styles.optionEnglish, { color: colors.mutedForeground }]}
                  numberOfLines={2}
                >
                  {p.english}
                </Text>
              ) : null}

              {(isStray || isWrongPick) && (
                <View style={styles.mark}>
                  <Feather
                    name={isStray ? 'check' : 'x'}
                    size={16}
                    color={isStray ? GREEN : RED}
                  />
                </View>
              )}
            </PressableScale>
          );
        })}
      </View>

      {/* Chacha-ji waits below the board until he is dragged onto a card. */}
      {!answered && (
        <View style={styles.tokenRow}>
          <Animated.View
            testID="chachaji-token"
            accessibilityRole="image"
            accessibilityLabel="Chacha-ji, drag him onto the wrong platform"
            onLayout={(e) => {
              tokenRect.current = e.nativeEvent.layout;
            }}
            style={[
              styles.token,
              { transform: pan.getTranslateTransform(), opacity: dragging ? 0.9 : 1 },
            ]}
            {...responder.panHandlers}
          >
            <Image source={CHACHAJI_ART} style={styles.tokenArt} resizeMode="contain" />
          </Animated.View>
        </View>
      )}

      {/* Only the MISS gets a continue beat. A correct spot has already
          scheduled its own advance and must not offer a second way out. */}
      {answered && !wasCorrect && (
        <PressableScale
          testID="wrong-platform-continue"
          onPress={() => submitFor(picked!)}
          style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.continueLabel}>Tap to continue</Text>
        </PressableScale>
      )}
    </View>
  );
}

/** Web's emerald-50 / red-50 answer washes, as RN tints over the card. */
const GREEN_TINT = '#10B98118';
const RED_TINT = '#EF444418';

const HOW_TO_PLAY: Record<WrongPlatformPart, string[]> = {
  1: [
    'Three of these boarded at your topic. One wandered in from somewhere else.',
    'Drag Chacha-ji, the chaiwala, onto the card that does not belong. You can also just tap it.',
    'Six rounds, no clock. Get one wrong and he will show you which card it was.',
  ],
  2: [
    'Same idea, harder line. Six cards now, and the stray comes from a NEIGHBOURING topic rather than a distant one.',
    'The English is hidden, so you are reading the script and the romanization rather than the meaning.',
    'Drag Chacha-ji, the chaiwala, onto the card that does not belong. Eight rounds.',
  ],
};

export function makeWrongPlatformScreen(part: WrongPlatformPart) {
  const id = part === 1 ? 'wrong-platform' : 'wrong-platform-2';
  return function WrongPlatformScreen() {
    const def = quickGameById(id)!;
    return (
      <QuickGameShell
        def={def}
        // secondsPerRound deliberately omitted: Wrong Platform is untimed.
        roundsPerRun={PARTS[part].rounds}
        // Silent game: no clip synthesis anywhere in it, on either platform.
        usesAudio={false}
        instruction="Drag Chacha-ji onto the card that boarded at the wrong platform."
        howToPlay={HOW_TO_PLAY[part]}
        renderRound={(props) => <WrongPlatformRound {...props} part={part} />}
      />
    );
  };
}

export default makeWrongPlatformScreen(1);

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 14 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  notice: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  option: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 4,
    justifyContent: 'center',
    minHeight: 88,
    padding: 12,
    width: '47.5%',
  },
  optionNative: { fontSize: 16, textAlign: 'center' },
  optionRomanized: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    opacity: 0.75,
    textAlign: 'center',
  },
  optionEnglish: { fontFamily: AppFonts.regular, fontSize: 12, textAlign: 'center' },
  mark: { position: 'absolute', right: 8, top: 8 },
  tokenRow: { alignItems: 'center', justifyContent: 'center' },
  // The token draws ABOVE the cards while it travels, or it slides under the
  // row it is being dropped on.
  token: { height: 84, width: 84, zIndex: 10 },
  tokenArt: { height: '100%', width: '100%' },
  continueBtn: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    paddingVertical: 15,
  },
  continueLabel: { color: '#FFFFFF', fontFamily: AppFonts.bold, fontSize: 15 },
});
