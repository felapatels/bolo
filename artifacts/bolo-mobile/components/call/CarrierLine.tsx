import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppFonts } from '@/constants/fonts';

/**
 * "BOLO Wireless", with four bars and a 4G tag, over the caller's name on
 * both call screens (owner, build 25: "add little fun details like BOLO
 * Wireless as the network name"). Decoration that says "this is a phone",
 * so it is hidden from assistive tech: VoiceOver already reads the name and
 * the state, and a fictional carrier would only be noise there.
 */
export const CARRIER_NAME = 'BOLO Wireless';

export function CarrierLine({ testID = 'call-carrier' }: { testID?: string }) {
  return (
    <View
      testID={testID}
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.bars}>
        {[6, 9, 12, 15].map((h) => (
          <View key={h} style={[styles.bar, { height: h }]} />
        ))}
      </View>
      <Text style={styles.name}>{CARRIER_NAME}</Text>
      <Text style={styles.tag}>4G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: 2 },
  bar: { width: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.92)' },
  name: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tag: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginBottom: 1,
  },
});
