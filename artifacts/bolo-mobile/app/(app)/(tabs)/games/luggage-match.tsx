// Build 35 mobile parity, fourth quick game: Luggage Match (pairs, floor 4,
// capped at 6 pairs).
//
// Two racks of luggage tags: native script on the left, English on the right.
// Pair them up.
//
// This is the first ported game with a PERSISTENT BOARD. The board is built
// once per run and rounds turn over underneath it — one round per pair — so
// there is no per-round advance beat and no per-round re-derivation. The
// shell keys the round subtree on its run counter, which is what makes a
// second run start with an empty board instead of a fully matched one.
//
// Ported from web (gujarati-coach/src/pages/games/luggage-match.tsx):
//   - UNTIMED: no `secondsPerRound`, so no clock, no chip, no count-in, and
//     `api.timedOut` never fires. There is no timeout path.
//   - RUN LENGTH IS POOL-DEPENDENT: min(6, pool) pairs, against a roster
//     floor of 4, resolved by the shell's `roundsPerRun` resolver.
//   - SILENT: nothing is spoken, so usesAudio={false}.
//   - Only a CORRECT pair submits. A wrong attempt submits nothing; it
//     records the counterpart and tints both tags red for 450ms.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { type Phrase } from '@workspace/api-client-react';
import {
  QuickGameShell,
  type QuickRoundProps,
} from '@/components/games/QuickGameShell';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { hapticNotify } from '@/lib/haptics';
import { quickGameById } from '@/lib/quick-games';

const MAX_PAIRS = 6;
/** How long both tags stay red after a wrong pairing. Web's number. */
const SHAKE_MS = 450;

/** Web's matched/error tag colours, shared with word-match. */
const GREEN = '#10B981';
const RED = '#EF4444';
const GREEN_TINT = '#10B98120';
const RED_TINT = '#EF444420';

/**
 * Run length: one round per pair, capped at six, resolved from the pool the
 * shell actually fetched. The roster floor of 4 is enforced by the shell.
 */
export function pairCount(phrases: Phrase[]): number {
  return Math.min(MAX_PAIRS, phrases.length);
}

export type LuggageBoard = {
  /** The phrases in play this run. */
  pairs: Phrase[];
  /** Native-script rack order. */
  left: Phrase[];
  /** English rack order. */
  right: Phrase[];
};

/**
 * Local Fisher-Yates. The board owns its own shuffle rather than reaching
 * into the shell, and returns a new array so the caller's pool is never
 * mutated.
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
 * Build the whole board up front, exactly as web does: shuffle the pool and
 * take the first `pairCount`, then shuffle that chosen set AGAIN and
 * INDEPENDENTLY for each rack.
 *
 * Three shuffles, deliberately. The two rack shuffles are independent, so a
 * tag can land opposite its own twin by coincidence — web accepts that and so
 * does this port. Nothing carries a correct index: a match is decided by
 * comparing phrase IDS at tap time, never by position.
 */
export function buildBoard(phrases: Phrase[]): LuggageBoard {
  const chosen = shuffle(phrases).slice(0, pairCount(phrases));
  return {
    pairs: chosen,
    left: shuffle(chosen),
    right: shuffle(chosen),
  };
}

function LuggageMatchRound({ phrases, api, activeLanguage }: QuickRoundProps) {
  const colors = useColors();
  const nativeProps = nativeTextStyle(activeLanguage);

  // Built ONCE per mount. The shell remounts the round on Play Again and on
  // Choose Topic (its run key), which is the only thing that rebuilds it.
  const [board] = useState<LuggageBoard>(() => buildBoard(phrases));

  const [leftPick, setLeftPick] = useState<number | null>(null);
  const [rightPick, setRightPick] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [shakeIds, setShakeIds] = useState<Set<number>>(new Set());
  /**
   * First wrong counterpart per native-side phrase id, first try only.
   * A Map held in state and MUTATED IN PLACE on purpose: it must not trigger
   * a render, it only has to survive one.
   */
  const [firstWrong] = useState(() => new Map<number, number>());
  /** Pending shake clear, cleared on round change and unmount. */
  const shakeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rounds only ever turn over on a CORRECT pair, so no shake can be pending
  // when this fires — it is here so an unmount (exit mid-run, Play Again)
  // cannot leave a timer running against a dead component.
  useEffect(() => {
    return () => {
      if (shakeRef.current) {
        clearTimeout(shakeRef.current);
        shakeRef.current = null;
      }
    };
  }, [api.round]);

  const tryResolve = (leftId: number | null, rightId: number | null) => {
    if (leftId === null || rightId === null) return;
    api.lockRound();
    if (leftId === rightId) {
      hapticNotify(Haptics.NotificationFeedbackType.Success);
      setMatched((prev) => new Set(prev).add(leftId));
      setLeftPick(null);
      setRightPick(null);
      // The frozen word-match correctness model: a pair solved first try
      // submits the phrase matched to ITSELF; a pair that took a wrong
      // attempt first submits the counterpart it was wrongly paired with,
      // which is in-category, so server validation passes unchanged.
      api.submitRound({
        phraseId: leftId,
        selectedPhraseId: firstWrong.get(leftId) ?? leftId,
        correct: !firstWrong.has(leftId),
      });
    } else {
      hapticNotify(Haptics.NotificationFeedbackType.Warning);
      // Only the FIRST wrong attempt counts against a tag.
      if (!firstWrong.has(leftId)) firstWrong.set(leftId, rightId);
      setShakeIds(new Set([leftId, rightId]));
      shakeRef.current = setTimeout(() => {
        shakeRef.current = null;
        setShakeIds(new Set());
        setLeftPick(null);
        setRightPick(null);
      }, SHAKE_MS);
    }
  };

  const tagStyle = (picked: boolean, done: boolean, shaking: boolean) => {
    if (shaking) return { backgroundColor: RED_TINT, borderColor: RED };
    if (done) return { backgroundColor: GREEN_TINT, borderColor: GREEN, opacity: 0.7 };
    if (picked) return { backgroundColor: `${colors.primary}18`, borderColor: colors.primary };
    return { backgroundColor: colors.card, borderColor: colors.border };
  };

  const tagTextColor = (done: boolean, shaking: boolean) =>
    shaking ? RED : done ? GREEN : colors.foreground;

  return (
    <View style={styles.wrap}>
      <View style={styles.racks}>
        <View style={styles.rack}>
          {board.left.map((p) => {
            const done = matched.has(p.id);
            const shaking = shakeIds.has(p.id) && leftPick === p.id;
            return (
              <PressableScale
                key={`l-${p.id}`}
                testID={`luggage-match-left-${p.id}`}
                disabled={done}
                onPress={() => {
                  // Taps are dead while the wrong pairing is still red.
                  if (shakeIds.size > 0) return;
                  const next = leftPick === p.id ? null : p.id;
                  setLeftPick(next);
                  tryResolve(next, rightPick);
                }}
                style={[styles.tag, tagStyle(leftPick === p.id, done, shaking)]}
              >
                {/* Luggage tag hole. */}
                <View
                  style={[
                    styles.hole,
                    styles.holeLeft,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                />
                <Text
                  style={[styles.tagText, nativeProps, { color: tagTextColor(done, shaking) }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {p.nativeScript}
                </Text>
                {/* Romanized reading beneath the script — the two-line stack
                    Word Match already uses here. Empty romanized (a script
                    with no romanization) renders nothing at all. */}
                {p.romanized.trim() !== '' ? (
                  <Text
                    testID={`luggage-match-romanized-${p.id}`}
                    style={[styles.tagRomanized, { color: tagTextColor(done, shaking) }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {p.romanized}
                  </Text>
                ) : null}
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.rack}>
          {board.right.map((p) => {
            const done = matched.has(p.id);
            const shaking = shakeIds.has(p.id) && rightPick === p.id;
            return (
              <PressableScale
                key={`r-${p.id}`}
                testID={`luggage-match-right-${p.id}`}
                disabled={done}
                onPress={() => {
                  if (shakeIds.size > 0) return;
                  const next = rightPick === p.id ? null : p.id;
                  setRightPick(next);
                  tryResolve(leftPick, next);
                }}
                style={[styles.tag, tagStyle(rightPick === p.id, done, shaking)]}
              >
                <View
                  style={[
                    styles.hole,
                    styles.holeRight,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                />
                <Text
                  style={[styles.tagEnglish, { color: tagTextColor(done, shaking) }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {p.english}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function LuggageMatchScreen() {
  const def = quickGameById('luggage-match')!;
  return (
    <QuickGameShell
      def={def}
      // secondsPerRound deliberately omitted: Luggage Match is untimed.
      roundsPerRun={pairCount}
      // Silent game: nothing is spoken on either platform.
      usesAudio={false}
      instruction="Pair each luggage tag with its English twin"
      renderRound={(props) => <LuggageMatchRound {...props} />}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  racks: { flexDirection: 'row', gap: 12 },
  rack: { flex: 1, gap: 8 },
  tag: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hole: {
    borderRadius: 4,
    borderWidth: 1,
    height: 8,
    marginTop: -4,
    position: 'absolute',
    top: '50%',
    width: 8,
  },
  holeLeft: { left: 6 },
  holeRight: { right: 6 },
  tagText: { fontSize: 15, textAlign: 'center' },
  tagRomanized: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    marginTop: 2,
    opacity: 0.75,
    textAlign: 'center',
  },
  tagEnglish: { fontFamily: AppFonts.semibold, fontSize: 14, textAlign: 'center' },
});
