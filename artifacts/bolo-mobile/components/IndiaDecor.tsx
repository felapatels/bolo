// Shared bazaar dressing: the awning and the toran. Mobile twin of
// artifacts/gujarati-coach/src/components/india-decor.tsx.
//
// Both are pure decoration — no state, no interaction, always hidden from
// assistive tech — and both draw from the fixed INDIA palette rather than
// theme tokens (see constants/india.ts for why). The Bolo Bazaar storefront
// and the Chai wallet share them so a stall looks like a stall wherever it
// appears.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { INDIA } from '@/constants/india';

/** A striped market awning with its scalloped hem. */
export function Awning({
  height = 26,
  hemHeight = 12,
  panels = 10,
}: {
  height?: number;
  hemHeight?: number;
  panels?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.row, { height }]}>
        {Array.from({ length: panels }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: i % 2 === 0 ? INDIA.stripe : INDIA.cloth,
            }}
          />
        ))}
      </View>
      <View style={styles.row}>
        {Array.from({ length: panels }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: hemHeight,
              borderBottomLeftRadius: 999,
              borderBottomRightRadius: 999,
              backgroundColor: i % 2 === 0 ? INDIA.stripe : INDIA.cloth,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** A toran of marigolds on a thread, the way a shop dresses for a festival. */
export function MarigoldString({ style }: { style?: object }) {
  return (
    <View
      style={[styles.toran, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.thread} />
      {Array.from({ length: 7 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i % 2 === 0 ? 8 : 5,
            height: i % 2 === 0 ? 8 : 5,
            borderRadius: 999,
            backgroundColor: i % 2 === 0 ? INDIA.gold : INDIA.stripe,
          }}
        />
      ))}
      <View style={styles.thread} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  toran: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thread: { flex: 1, height: 1, backgroundColor: INDIA.gold },
});
