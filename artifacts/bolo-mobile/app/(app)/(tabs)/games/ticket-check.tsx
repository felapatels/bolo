// Build 35 mobile parity, first quick game: Ticket Check (script match, floor 4).
//
// A ticket shows the English meaning and the romanized reading; the learner
// punches the matching native-script ticket. Selection game riding the frozen
// listen-and-pick correctness model (selectedPhraseId === phraseId), declared
// on the roster entry — this file adds no server game id and touches no
// server file.
//
// Ported from the web game (gujarati-coach/src/pages/games/ticket-check.tsx),
// which this must stay behaviourally identical to:
//   - UNTIMED by design: `secondsPerRound` is omitted entirely, so the shell
//     runs no clock, no chip and no 3-2-1 count-in. Web deliberately removed
//     the 700ms auto-advance on correct answers so the learner controls how
//     long the romanized and meaning lines stay up. Adding time pressure here
//     would undo that.
//   - the reveal rides an explicit "Tap to continue" for BOTH outcomes.
//   - the game NEVER persists anything: it reports each round through
//     api.submitRound and the shell owns the single end-of-run POST.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Phrase } from '@workspace/api-client-react';
import {
  QuickGameShell,
  type QuickRoundProps,
} from '@/components/games/QuickGameShell';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { hapticNotify } from '@/lib/haptics';
import { quickGameById } from '@/lib/quick-games';

const ROUNDS = 8;
const CHOICES = 4;

export type TicketQuestion = {
  phrase: Phrase;
  choices: Phrase[];
  correctIdx: number;
};

/**
 * Local Fisher-Yates. The planner owns its own shuffle rather than reaching
 * into the shell: shuffling is a game concern, and keeping it here is what
 * lets buildPlan stay pure and testable without rendering anything.
 * Returns a new array — the caller's phrase list is never mutated.
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
 * The pool is shuffled ONCE and walked with a cursor, reshuffling and
 * resetting when the cursor passes the end. That is what spreads anchors
 * evenly over a short category — picking a random anchor each round would
 * repeat some phrases and never show others.
 *
 * `correctIdx` is derived by findIndex AFTER the final shuffle, never carried
 * through it. Tracking an index across a shuffle is the classic way these
 * planners rot into marking the wrong tile correct.
 */
export function buildPlan(phrases: Phrase[], count: number): TicketQuestion[] {
  const plan: TicketQuestion[] = [];
  let pool = shuffle(phrases);
  let poolIdx = 0;
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = shuffle(phrases);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++]!;
    const distractors = shuffle(phrases.filter((p) => p.id !== phrase.id)).slice(
      0,
      CHOICES - 1,
    );
    const choices = shuffle([phrase, ...distractors]);
    plan.push({
      phrase,
      choices,
      correctIdx: choices.findIndex((c) => c.id === phrase.id),
    });
  }
  return plan;
}

function TicketCheckRound({ phrases, api, activeLanguage }: QuickRoundProps) {
  const colors = useColors();
  const nativeProps = nativeTextStyle(activeLanguage);
  const [plan] = useState(() => buildPlan(phrases, ROUNDS));
  const [picked, setPicked] = useState<number | null>(null);

  // api.round is ZERO-BASED (shell contract), so it indexes the plan directly.
  useEffect(() => {
    setPicked(null);
  }, [api.round]);

  const q = plan[api.round];
  if (!q) return null;

  const answered = picked !== null;
  const wasCorrect = answered && picked === q.correctIdx;

  const handlePick = (idx: number) => {
    if (answered) return;
    api.lockRound();
    setPicked(idx);
    hapticNotify(
      idx === q.correctIdx
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  };

  return (
    <View style={styles.wrap}>
      {/* The ticket being checked. */}
      <View testID="ticket-prompt" style={[styles.ticket, { backgroundColor: colors.card }]}>
        <Feather name="check-square" size={22} color="#D97706" />
        <Text
          testID="ticket-english"
          style={[styles.ticketEnglish, { color: colors.foreground }]}
        >
          {q.phrase.english}
        </Text>
        {/* No romanized line on the question (web parity): printing the
            reading on the prompt handed over what the learner is here to
            recognise. It lives under the script on the answers instead. */}
      </View>

      <View style={styles.grid}>
        {q.choices.map((choice, idx) => {
          const isCorrect = answered && idx === q.correctIdx;
          const isWrong = answered && !wasCorrect && idx === picked;
          return (
            <PressableScale
              key={choice.id}
              testID={`ticket-choice-${idx}`}
              onPress={() => handlePick(idx)}
              disabled={answered}
              style={[
                styles.choice,
                {
                  backgroundColor: colors.card,
                  borderColor: isCorrect
                    ? '#10B981'
                    : isWrong
                      ? '#EF4444'
                      : colors.border,
                },
              ]}
            >
              <Text
                style={[styles.choiceNative, nativeProps, { color: colors.foreground }]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {choice.nativeScript}
              </Text>

              {/* Every answer carries its own reading under the script, from
                  the first look — the pairing IS the lesson. The correct tile
                  adds its English meaning once answered. Languages with no
                  romanization render no empty slot. */}
              {choice.romanized.trim() !== '' && (
                <Text
                  style={[styles.choiceSub, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {choice.romanized}
                </Text>
              )}
              {isCorrect && (
                <Text style={[styles.choiceMeaning, { color: '#10B981' }]} numberOfLines={1}>
                  {choice.english}
                </Text>
              )}

              {(isCorrect || isWrong) && (
                <View style={styles.mark}>
                  <Feather
                    name={isCorrect ? 'check-circle' : 'x-circle'}
                    size={16}
                    color={isCorrect ? '#10B981' : '#EF4444'}
                  />
                </View>
              )}
            </PressableScale>
          );
        })}
      </View>

      {/* The reveal rides the house continue beat for BOTH outcomes, so the
          learner decides how long to study the romanized and meaning lines. */}
      {answered && (
        <PressableScale
          testID="ticket-check-continue"
          onPress={() =>
            api.submitRound({
              phraseId: q.phrase.id,
              selectedPhraseId: q.choices[picked!]!.id,
              correct: wasCorrect,
              // The ticket showed the meaning; the pick was a script card.
              review: {
                prompt: q.phrase.english,
                answer: q.choices[picked!]!.nativeScript,
                answerSub: q.choices[picked!]!.romanized.trim() || null,
                correct: q.phrase.nativeScript,
                // The reading rides under the script it belongs to rather than
                // under the English prompt, so each line reads on its own.
                correctSub: q.phrase.romanized.trim() || null,
              },
            })
          }
          style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.continueLabel}>Tap to continue</Text>
        </PressableScale>
      )}
    </View>
  );
}

export default function TicketCheckScreen() {
  const def = quickGameById('ticket-check')!;
  return (
    <QuickGameShell
      def={def}
      // secondsPerRound deliberately omitted: Ticket Check is untimed.
      roundsPerRun={ROUNDS}
      // SILENT: the game speaks nothing, so the shell must not offer a mute
      // control over silence. This landed after the port did — usesAudio
      // defaults to true, so the first game on the shell never opted out.
      usesAudio={false}
      instruction="Punch the ticket that matches the script"
      renderRound={(props) => <TicketCheckRound {...props} />}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 14 },
  ticket: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: '#FCD34D',
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 2,
    gap: 4,
    maxWidth: 380,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
  },
  ticketEnglish: { fontFamily: AppFonts.extrabold, fontSize: 19, textAlign: 'center' },
  ticketRomanized: { fontFamily: AppFonts.regular, fontSize: 13, textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  choice: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 3,
    justifyContent: 'center',
    minHeight: 88,
    padding: 12,
    width: '47.5%',
  },
  choiceNative: { fontSize: 17, textAlign: 'center' },
  choiceSub: { fontFamily: AppFonts.regular, fontSize: 11, textAlign: 'center' },
  choiceMeaning: { fontFamily: AppFonts.semibold, fontSize: 11, textAlign: 'center' },
  mark: { position: 'absolute', right: 8, top: 8 },
  continueBtn: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    paddingVertical: 15,
  },
  continueLabel: { color: '#FFFFFF', fontFamily: AppFonts.bold, fontSize: 15 },
});
