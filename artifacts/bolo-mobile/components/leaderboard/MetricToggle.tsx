import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import type { BoardMetric } from '@/lib/boardRanking';

/**
 * XP or Streak: which number ranks the board (build 22, the owner's
 * Leaderboard mockup). Two wide pills, the chosen one filled in the primary
 * because choosing is a touch. One payload feeds both; the toggle only
 * changes the sort, so it costs no request.
 */
export function MetricToggle({
  metric,
  onChange,
}: {
  metric: BoardMetric;
  onChange: (next: BoardMetric) => void;
}) {
  const colors = useColors();
  const pill = (value: BoardMetric, label: string, glyph: React.ReactNode) => {
    const active = metric === value;
    return (
      <PressableScale
        key={value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Rank by ${label}`}
        testID={`board-metric-${value}`}
        onPress={() => onChange(value)}
        style={[
          styles.pill,
          {
            backgroundColor: active ? colors.primary : colors.card,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
      >
        {glyph}
        <Text style={[styles.label, { color: active ? colors.primaryForeground : colors.foreground }]}>
          {label}
        </Text>
      </PressableScale>
    );
  };
  const ink = (value: BoardMetric) => (metric === value ? colors.primaryForeground : colors.mutedForeground);
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="Which number ranks the board">
      {pill('xp', 'XP', <Feather name="zap" size={17} color={ink('xp')} />)}
      {pill('streak', 'Streak', <MaterialCommunityIcons name="fire" size={19} color={ink('streak')} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  label: { fontFamily: AppFonts.extrabold, fontSize: 16 },
});
