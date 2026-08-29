// The first-word lightbox: the words and the sheet. The rules, the copy and
// the ordering with the badge celebration live in lib/firstWordPrimer.ts.
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Mascot } from '@/components/Mascot';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { FIRST_WORD_PRIMER_COPY } from '@/lib/firstWordPrimer';

export function FirstWordPrimer({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      {/* An OPAQUE ground, not a dim: the score card is already laid out
          underneath and "right before they see their score" means not a
          glimpse of it through a backdrop. */}
      <View style={[styles.backdrop, { backgroundColor: colors.background }]}>
        <View
          testID="first-word-primer"
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.top}>
            <Mascot pose="cheer" size={96} motion="float" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {FIRST_WORD_PRIMER_COPY.title}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {FIRST_WORD_PRIMER_COPY.body}
          </Text>
          <ChunkyButton
            testID="first-word-primer-cta"
            title={FIRST_WORD_PRIMER_COPY.cta}
            icon="arrow-right"
            onPress={onDismiss}
            style={{ marginTop: 10, alignSelf: 'stretch' }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    maxWidth: 380,
    padding: 22,
    width: '100%',
  },
  top: { alignItems: 'center' },
  title: { fontFamily: AppFonts.extrabold, fontSize: 22, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
