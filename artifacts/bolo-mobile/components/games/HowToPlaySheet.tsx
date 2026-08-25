// How to play, for every quick game, at launch and on demand.
//
// WHY THIS EXISTS. Wrong Platform shipped with an `instruction` prop that the
// mobile shell rendered ONLY inside its countdown branch, and Wrong Platform
// is untimed, so it has no countdown and the string never reached the screen
// at all. Reported 2026-08-25: "no instructions and i can't even figure it
// out". Web kept the same sentence above every round, so the two shells had
// disagreed since they were written. Moving one <Text> would have fixed one
// game; this fixes the shape.
//
// TWO WAYS IN, WHICH IS THE WHOLE ASK. It opens itself the first time a
// learner plays a given game, and the `?` in the game header opens it again
// whenever they want. A sheet that only appears at launch becomes a tap you
// learn to dismiss without reading, which is how an explanation goes
// invisible for the second time.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { hapticLight } from '@/lib/haptics';

export function HowToPlaySheet({
  visible,
  title,
  lines,
  firstTime,
  onClose,
}: {
  visible: boolean;
  /** The game's own name, so the sheet says what it is explaining. */
  title: string;
  /** One paragraph per entry. The first is the game's one-line instruction. */
  lines: string[];
  /**
   * Changes the button only. "Play" reads as the start of something on the
   * launch pass; "Got it" reads as returning to a game already underway, and
   * a mid-game sheet labelled Play suggests it will restart the run.
   */
  firstTime: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headRow}>
            <Feather name="help-circle" size={18} color={colors.primary} />
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
              HOW TO PLAY
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {lines.map((line, i) => (
              <Text
                key={i}
                style={[styles.line, { color: colors.mutedForeground }]}
              >
                {line}
              </Text>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={firstTime ? 'Play' : 'Got it'}
            testID="how-to-play-dismiss"
            onPress={() => {
              hapticLight();
              onClose();
            }}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              {firstTime ? 'Play' : 'Got it'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  // Capped rather than free: a long explanation must not push the button off
  // a short screen, which is the one thing that would make the sheet a trap.
  body: { maxHeight: 260 },
  bodyContent: { gap: 10, paddingBottom: 2 },
  line: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  cta: {
    marginTop: 4,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaText: { fontFamily: AppFonts.bold, fontSize: 15 },
});
