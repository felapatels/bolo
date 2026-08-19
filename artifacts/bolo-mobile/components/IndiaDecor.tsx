// Shared bazaar dressing: the awning and the toran. Mobile twin of
// artifacts/gujarati-coach/src/components/india-decor.tsx.
//
// Both are pure decoration, no state, no interaction, always hidden from
// assistive tech, and both draw from the fixed INDIA palette rather than
// theme tokens (see constants/india.ts for why). The Bolo Bazaar storefront
// and the Chai wallet share them so a stall looks like a stall wherever it
// appears.
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { INDIA } from '@/constants/india';

/**
 * A striped market awning whose hem is cut into half-round scallops.
 *
 * ONE cloth, not a band plus a row of tabs: every scallop is exactly one
 * stripe wide and sits under its own stripe, so the two never drift apart.
 * Cells are a fixed width and the row clips the overflow, flex cells would
 * make the scallop radius (which must be half the cell) unknowable up front.
 */
export function Awning({
  height = 26,
  stripeWidth = 22,
}: {
  height?: number;
  /** Width of one colour band. The scallops are one stripe wide. */
  stripeWidth?: number;
}) {
  const radius = stripeWidth / 2;
  const cells = Math.ceil(Dimensions.get('window').width / stripeWidth) + 1;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.awning}
      testID="awning"
    >
      {Array.from({ length: cells }).map((_, i) => {
        const color = i % 2 === 0 ? INDIA.stripe : INDIA.cloth;
        return (
          <View key={i} style={{ width: stripeWidth }}>
            <View style={{ height, backgroundColor: color }} />
            <View
              style={{
                height: radius,
                backgroundColor: color,
                borderBottomLeftRadius: radius,
                borderBottomRightRadius: radius,
              }}
            />
          </View>
        );
      })}
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
  awning: { flexDirection: 'row', overflow: 'hidden' },
  row: { flexDirection: 'row' },
  toran: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thread: { flex: 1, height: 1, backgroundColor: INDIA.gold },
});
