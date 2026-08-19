// The shared "what did I get wrong" review for the games' end screens
// (mobile half of the web `game-miss-review.tsx` pair, keep the two in step).
//
// Every game ends on a score (6 / 8 correct) that used to be a dead number:
// the learner could see they missed two, never which two. Each game collects
// its own misses as GameMiss records while the run plays out and hands them to
// these two pieces:
//
//   MissReviewCta      the secondary "See what you missed" button
//   MissReviewModal    the list itself
//
// End screens own the open state, so the score card can open the same sheet
// (tapping the 6/8 is the affordance most learners reach for first). A perfect
// run renders neither piece, there is nothing to review.
//
// A miss is described in the learner's own terms, not in ids: the prompt they
// saw, what they answered, and what the answer was. Rounds that lapse pass
// answer: null, which reads as "no answer" rather than pretending they chose
// something.

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

export type GameMiss = {
  /** What the learner was asked, the prompt as it appeared on screen. */
  prompt: string;
  /** Optional second line under the prompt (romanization, native script, a hint). */
  promptSub?: string | null;
  /** What the learner answered. Null when the round lapsed with no answer. */
  answer: string | null;
  /** The answer that was expected. */
  correct: string;
  /** Romanized readings for the two lines above, when the value is native
   *  script. Section 10j: script never appears without its reading. Empty or
   *  null renders nothing, several scripts have no romanization. */
  answerSub?: string | null;
  correctSub?: string | null;
  /** Overrides for the two row labels. A game that is not answered in words
   *  (Script Trace is traced, not typed) reads better as "Your best 32 / 100"
   *  and "Pass mark 40" than as "You said" / "Answer". */
  answerLabel?: string;
  correctLabel?: string;
};

export function MissReviewCta({ count, onPress }: { count: number; onPress: () => void }) {
  const colors = useColors();
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID="miss-review-cta"
      style={({ pressed }) => [
        styles.cta,
        {
          backgroundColor: pressed ? colors.muted : colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Feather name="list" size={16} color={colors.foreground} />
      <Text style={[styles.ctaLabel, { color: colors.foreground }]}>See what you missed</Text>
    </Pressable>
  );
}

export function MissReviewModal({
  misses,
  visible,
  onClose,
}: {
  misses: GameMiss[];
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Taps inside the sheet must not close it. */}
        <Pressable
          testID="miss-review-sheet"
          onPress={() => {}}
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>What you missed</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {misses.length === 1
              ? 'One to work on. Play again to have another go at it.'
              : `${misses.length} to work on. Play again to have another go at them.`}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {misses.map((miss, i) => (
              <View
                key={i}
                testID="miss-review-row"
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.prompt, { color: colors.foreground }]}>{miss.prompt}</Text>
                {miss.promptSub ? (
                  <Text style={[styles.promptSub, { color: colors.mutedForeground }]}>
                    {miss.promptSub}
                  </Text>
                ) : null}
                <View style={styles.answerLine}>
                  <Feather name="x" size={14} color="#EF4444" style={styles.answerIcon} />
                  <Text style={[styles.answerText, { color: colors.mutedForeground }]}>
                    {miss.answerLabel ?? 'You said'}{' '}
                    <Text style={[styles.answerValue, { color: '#EF4444' }]}>
                      {miss.answer ?? 'nothing, the round ran out'}
                    </Text>
                    {miss.answer && miss.answerSub?.trim() ? (
                      <Text style={[styles.answerSub, { color: colors.mutedForeground }]}>
                        {'\n'}
                        {miss.answerSub}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                <View style={styles.answerLine}>
                  <Feather name="check" size={14} color="#10B981" style={styles.answerIcon} />
                  <Text style={[styles.answerText, { color: colors.mutedForeground }]}>
                    {miss.correctLabel ?? 'Answer'}{' '}
                    <Text style={[styles.answerValue, { color: '#10B981' }]}>{miss.correct}</Text>
                    {miss.correctSub?.trim() ? (
                      <Text style={[styles.answerSub, { color: colors.mutedForeground }]}>
                        {'\n'}
                        {miss.correctSub}
                      </Text>
                    ) : null}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={onClose} accessibilityRole="button" style={styles.closeBtn}>
            <Text style={[styles.closeLabel, { color: colors.mutedForeground }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cta: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
  },
  ctaLabel: { fontFamily: AppFonts.bold, fontSize: 15 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    maxHeight: '80%',
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  list: { marginTop: 12 },
  listContent: { gap: 10, paddingBottom: 4 },
  row: { borderWidth: 1, borderRadius: 16, padding: 14 },
  prompt: { fontFamily: AppFonts.bold, fontSize: 15 },
  promptSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  answerLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  answerIcon: { marginTop: 2 },
  answerText: { fontFamily: AppFonts.regular, fontSize: 13, flex: 1 },
  // The reading under a native-script value: same two-line stack the game
  // cards use (11px, quieter), nested so it wraps with its value.
  answerSub: { fontFamily: AppFonts.regular, fontSize: 11 },
  answerValue: { fontFamily: AppFonts.bold },
  closeBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 18, marginTop: 6 },
  closeLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
});
