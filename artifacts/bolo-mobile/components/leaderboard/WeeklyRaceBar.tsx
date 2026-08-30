import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RankDelta } from '@/components/leaderboard/RankDelta';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { formatRaceCountdown, weekEndsInMs } from '@/lib/boardRanking';
import { TICKET } from '@/lib/ticketStock';

/**
 * "Weekly race ends in 2d 10h", and where you stand (build 22, the mockup).
 * The clock is the server's own window, Monday 00:00 UTC to the next, so
 * the bar and the numbers agree. It ticks once a minute; nobody watches a
 * countdown of days by the second.
 */
export function WeeklyRaceBar({
  rank,
  delta,
  metricLabel,
}: {
  /** The learner's 1-based standing, or null when they are not on the board. */
  rank: number | null;
  delta: number | undefined;
  /** "XP" or "streak": the bar names the race it is timing. */
  metricLabel: string;
}) {
  const colors = useColors();
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const left = formatRaceCountdown(weekEndsInMs(now));
  return (
    <View style={[styles.bar, { backgroundColor: TICKET.stockTop, borderColor: TICKET.rule }]} testID="weekly-race-bar">
      <Feather name="clock" size={16} color={TICKET.ink} />
      <Text style={[styles.text, { color: TICKET.ink }]} numberOfLines={1}>
        {metricLabel === 'XP' ? `Weekly race ends in ${left}` : `Streaks: week ends in ${left}`}
      </Text>
      <View style={styles.right}>
        {rank !== null ? (
          <>
            <View style={[styles.youPill, { backgroundColor: `${colors.primary}14` }]}>
              <Text style={[styles.youText, { color: colors.primary }]}>{`You: #${rank}`}</Text>
            </View>
            <RankDelta delta={delta} size={14} />
          </>
        ) : (
          <Text style={[styles.joinText, { color: colors.primary }]}>Join the race</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  text: { fontFamily: AppFonts.semibold, fontSize: 14, flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  youPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  youText: { fontFamily: AppFonts.bold, fontSize: 13 },
  joinText: { fontFamily: AppFonts.bold, fontSize: 13 },
});
