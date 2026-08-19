/**
 * The gold status pill.
 *
 * One shape, three surfaces: the language picker's All-Access chip, and now the
 * First Class chip on leaderboard and feed rows. The gold, the white hairline
 * ring and the brown-on-gold text were settled on the picker; typing them a
 * third time is how two golds end up half a shade apart. Web twin:
 * gujarati-coach/src/components/gold-chip.tsx.
 *
 * Gold means STATUS SOMEBODY PAID FOR, and nothing else. A leaderboard position
 * is not bought, which is why rank stays indigo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppFonts } from '@/constants/fonts';

const GOLD_INK = '#4A2C00';

export function GoldChip({
  label,
  testID,
}: {
  label: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.chip, styles.chipAllAccess]}>
      <Feather name="star" size={8} color={GOLD_INK} />
      <Text style={[styles.chipText, { color: GOLD_INK }]}>{label}</Text>
    </View>
  );
}

/**
 * First Class, on a friend's row. Renders only while the window is open, the
 * server sends a boolean and never an expiry, so there is nothing to count down.
 */
export function FirstClassChip() {
  return <GoldChip label="First Class" testID="row-first-class" />;
}

export const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  chipAllAccess: { backgroundColor: '#F5B31B' },
  chipText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
