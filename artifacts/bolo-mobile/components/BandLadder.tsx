import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { BAND_LABEL, BAND_LADDER, bandColor, type Band } from '@/lib/ui';

/**
 * Five-band result ladder: every band label rendered top to bottom with the
 * achieved band highlighted (filled with its brand color) and the rest muted.
 * Labels only, never a raw numeric score (ex-#874 rule). Renders nothing for
 * `nocatch`: a system miss is not a rung on the ladder (Spec 1 rule 16).
 */
export function BandLadder({ band }: { band: Band }) {
  const colors = useColors();
  if (band === 'nocatch') return null;
  return (
    <View
      style={styles.ladder}
      accessibilityLabel={`Pronunciation result: ${BAND_LABEL[band]}`}
      testID="band-ladder"
    >
      {BAND_LADDER.map((rung) => {
        const achieved = rung === band;
        const color = bandColor(rung, colors);
        return (
          <View
            key={rung}
            testID={`band-ladder-${rung}${achieved ? '-achieved' : ''}`}
            style={[
              styles.rung,
              achieved
                ? { backgroundColor: color }
                : { backgroundColor: 'transparent' },
            ]}
          >
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: achieved
                    ? 'rgba(255,255,255,0.9)'
                    : `${colors.mutedForeground}40`,
                },
              ]}
            />
            <Text
              style={[
                styles.label,
                achieved
                  ? styles.labelAchieved
                  : { color: `${colors.mutedForeground}80` },
              ]}
            >
              {BAND_LABEL[rung]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ladder: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 240,
    gap: 4,
  },
  rung: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: AppFonts.extrabold,
    fontSize: 14,
  },
  labelAchieved: {
    color: '#FFFFFF',
  },
});
