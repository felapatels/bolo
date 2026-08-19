import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { BAND_LABEL, bandColor, type Band } from '@/lib/ui';

export type { Band };

/**
 * Pill that renders a pronunciation quality band label.
 * Visual weight matches the existing XP chip in the session summary.
 * Colors follow the five-band ladder gradient in lib/ui.ts (nocatch renders
 * neutral, a system miss is never presented negatively, Spec 1 rule 16).
 */
export function BandPill({ band }: { band: Band }) {
  const colors = useColors();
  const color = bandColor(band, colors);

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
