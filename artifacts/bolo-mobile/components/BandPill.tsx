import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

export type Band = 'nocatch' | 'nailed' | 'close' | 'retry';

const BAND_LABEL: Record<Band, string> = {
  nailed: 'Nailed it',
  close: 'Close',
  retry: 'Try again',
  nocatch: "Didn't catch that",
};

/**
 * Pill that renders a pronunciation quality band label.
 * Visual weight matches the existing XP chip in the session summary.
 * Colors mirror the ScoreRing / ScoreTrail thresholds:
 *   nailed → success green, close → gold/amber, retry/nocatch → destructive red.
 */
export function BandPill({ band }: { band: Band }) {
  const colors = useColors();
  const color =
    band === 'nailed'
      ? colors.success
      : band === 'close'
        ? (colors as any).gold ?? '#F59E0B'
        : colors.destructive;

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: `${color}18`, borderColor: color },
      ]}
    >
      <Text style={[styles.label, { color }]}>{BAND_LABEL[band]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  label: {
    fontFamily: AppFonts.extrabold,
    fontSize: 15,
  },
});
