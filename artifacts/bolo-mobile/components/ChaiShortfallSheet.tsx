// "You need 25 more Chai." The answer to how, at the moment it is asked.
//
// Owner ruling 2026-08-19. Before this, a spend the learner could not afford
// returned a notice telling them to keep riding, which is true but unhelpful:
// it answered the question they had not asked and ignored the one they had.
//
// IT LEADS WITH THE NUMBER, NOT THE PACKS. A learner who is four Chai short
// should see "4 more" and probably go and earn them; one who is sixty short is
// being told something useful by the size of the gap. Earning stays named at
// the bottom, because it is still the main road and a shop that pretends
// otherwise is a worse shop.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CONTENT_MAX_W } from '@/lib/contentWidth';
import { Feather } from '@expo/vector-icons';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { ChaiPackShop, useChaiPacksSellable } from '@/components/ChaiPackShop';
import { ChaiGlyph } from '@/components/ChaiStall';

export function ChaiShortfallSheet({
  needed,
  itemName,
  onClose,
}: {
  /** How many more Chai the learner needs. Always positive when shown. */
  needed: number | null;
  /** What they were trying to buy, so the sheet is about their goal. */
  itemName?: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const sellable = useChaiPacksSellable();
  // With nothing on sale the sheet has no way out to offer, and would be a
  // popup that states a problem and then shrugs. The plain notice is better.
  const open = needed !== null && needed > 0 && sellable;

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View
        testID="chai-shortfall-sheet"
        style={[styles.sheet, { backgroundColor: colors.card }]}
      >
        <View style={styles.headRow}>
          <ChaiGlyph size={28} />
          <Text
            testID="chai-shortfall-headline"
            style={[styles.headline, { color: colors.foreground }]}
          >
            {needed === 1 ? 'You need 1 more Chai' : `You need ${needed} more Chai`}
          </Text>
          <Pressable
            onPress={onClose}
            testID="chai-shortfall-close"
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
          >
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {itemName ? (
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            for {itemName}.
          </Text>
        ) : null}

        <ChaiPackShop />

        {/* Earning stays named. The packs are a shortcut, not the road. */}
        <Text style={[styles.earn, { color: colors.mutedForeground }]}>
          Or keep riding. Practice earns Chai every day, and that road is free.
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    // Capped to the content column on an iPad; the full width on a phone (build 25).
    width: '100%',
    maxWidth: CONTENT_MAX_W,
    alignSelf: 'center',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 34,
    gap: 12,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headline: { flex: 1, fontFamily: AppFonts.extrabold, fontSize: 19 },
  sub: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: -6 },
  earn: { fontFamily: AppFonts.semibold, fontSize: 12, textAlign: 'center' },
});
