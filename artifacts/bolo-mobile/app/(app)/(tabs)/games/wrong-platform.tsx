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

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

const ROUNDS = 6;
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
    const others = shuffle(locals.filter((p) => p.id !== anchor.id)).slice(0, 2);
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

function WrongPlatformRound({ phrases, api, activeLang, activeLanguage }: QuickRoundProps) {
  const colors = useColors();
  const nativeProps = nativeTextStyle(activeLanguage);

  // The stray has to come from a DIFFERENT topic, so the round fetches a
  // second category itself (web does the same). First category that is not
  // this one and actually has phrases.
  const categoryId = phrases[0]?.categoryId ?? 0;
  const { data: categories } = useListCategories({ lang: activeLang });
  const strayCategory = (categories ?? []).find(
    (c) => c.id !== categoryId && c.phraseCount >= 1,
  );
  const strayQuery = useListCategoryPhrases(strayCategory?.id ?? 0, activeLang, {
    query: {
      enabled: !!strayCategory,
      queryKey: getListCategoryPhrasesQueryKey(strayCategory?.id ?? 0, activeLang),
    },
  });
  const strays = strayQuery.data ?? [];

  const [plan, setPlan] = useState<PlatformQuestion[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  /** Pending auto-advance, cleared on round change and unmount. */
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (plan === null && strays.length > 0) {
      setPlan(buildPlan(phrases, strays, ROUNDS));
    }
  }, [plan, strays, phrases]);

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

  if (!strayCategory) {
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
              style={[
                styles.option,
                {
                  backgroundColor: isStray
                    ? GREEN_TINT
                    : isWrongPick
                      ? RED_TINT
                      : colors.card,
                  borderColor: isStray ? GREEN : isWrongPick ? RED : colors.border,
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
              <Text
                style={[styles.optionEnglish, { color: colors.mutedForeground }]}
                numberOfLines={2}
              >
                {p.english}
              </Text>

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

export default function WrongPlatformScreen() {
  const def = quickGameById('wrong-platform')!;
  return (
    <QuickGameShell
      def={def}
      // secondsPerRound deliberately omitted: Wrong Platform is untimed.
      roundsPerRun={ROUNDS}
      // Silent game: no clip synthesis anywhere in it, on either platform.
      usesAudio={false}
      instruction="One of these boarded at the wrong platform. Spot the stray!"
      renderRound={(props) => <WrongPlatformRound {...props} />}
    />
  );
}

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
  continueBtn: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    paddingVertical: 15,
  },
  continueLabel: { color: '#FFFFFF', fontFamily: AppFonts.bold, fontSize: 15 },
});
