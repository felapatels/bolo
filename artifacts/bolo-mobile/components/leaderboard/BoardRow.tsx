import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LeaderboardEntry } from '@workspace/api-client-react';
import { MascotAvatar } from '@/components/MascotAvatar';
import { FirstClassChip } from '@/components/GoldChip';
import { LearnerSafetyButton, type BoardScope } from '@/components/BoardScope';
import { RankDelta } from '@/components/leaderboard/RankDelta';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { type BoardMetric, metricUnit, metricValue } from '@/lib/boardRanking';

function displayFor(u: { displayName?: string | null }): string {
  return u.displayName?.trim() || 'Fellow learner';
}

/**
 * ONE ROW BELOW THE PODIUM (build 22, the mockup): the place in a disc, the
 * learner's dressed Bolo, the name, the number with its unit and the places
 * moved, and on the global board the flag that opens report-or-block. The
 * learner's own row sits on lavender with the disc filled in, and says what
 * it would take to pass the row above ("23 XP to pass #5").
 */
export function BoardRow({
  entry,
  rank,
  metric,
  delta,
  toPass,
  scope,
}: {
  entry: LeaderboardEntry;
  rank: number;
  metric: BoardMetric;
  delta: number | undefined;
  /** How much more of the metric passes the row above; null for the leader. */
  toPass: number | null;
  scope: BoardScope;
}) {
  const colors = useColors();
  const isSelf = entry.isSelf;
  const value = metricValue(entry, metric);
  const unit = metricUnit(metric, value);
  return (
    <View
      testID="board-row"
      style={[
        styles.row,
        {
          backgroundColor: isSelf ? `${colors.primary}14` : colors.card,
          borderColor: isSelf ? `${colors.primary}66` : colors.border,
        },
      ]}
    >
      <View style={[styles.rankDisc, { backgroundColor: isSelf ? colors.primary : colors.muted }]}>
        <Text style={[styles.rankText, { color: isSelf ? colors.primaryForeground : colors.mutedForeground }]}>
          {rank}
        </Text>
      </View>
      <MascotAvatar user={entry} size={52} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {isSelf ? 'You' : displayFor(entry)}
          </Text>
          {entry.firstClassActive ? <FirstClassChip /> : null}
        </View>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: colors.foreground }]}>
            {value.toLocaleString()}
            <Text style={[styles.unit, { color: colors.mutedForeground }]}>{` ${unit}`}</Text>
          </Text>
          <RankDelta delta={delta} size={14} />
        </View>
        {isSelf && toPass !== null ? (
          <Text style={[styles.toPass, { color: colors.primary }]}>
            {`${toPass.toLocaleString()} ${metricUnit(metric, toPass)} to pass #${rank - 1}`}
          </Text>
        ) : null}
      </View>
      {/* ONLY ON THE GLOBAL BOARD, AND NEVER ON YOUR OWN ROW. A friends board
          is people you accepted, so a flag there is a bug report about somebody
          you already chose. */}
      {scope === 'all' && !isSelf ? (
        <LearnerSafetyButton userId={entry.userId} username={entry.username ?? entry.displayName ?? null} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  rankDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: AppFonts.bold, fontSize: 17, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  value: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  unit: { fontFamily: AppFonts.semibold, fontSize: 13 },
  toPass: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 2 },
});
