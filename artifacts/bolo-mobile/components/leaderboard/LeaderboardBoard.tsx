import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { LeaderboardEntry } from '@workspace/api-client-react';
import type { BoardScope } from '@/components/BoardScope';
import { BoardRow } from '@/components/leaderboard/BoardRow';
import { Podium } from '@/components/leaderboard/Podium';
import { appearDown, useAppearSkip } from '@/lib/entrance';
import { type BoardMetric, toPassAbove } from '@/lib/boardRanking';

/**
 * THE BOARD ITSELF: the podium for the first three and a row for everyone
 * after (build 22). Both the Feed tab and the standalone Leaderboard screen
 * render this, fed by their own query and states, which is what makes the
 * two boards one board. `ranked` is already in order (rankEntries); this
 * draws, it does not sort.
 */
export function LeaderboardBoard({
  ranked,
  metric,
  deltas,
  scope,
}: {
  ranked: readonly LeaderboardEntry[];
  metric: BoardMetric;
  deltas: Record<string, number>;
  scope: BoardScope;
}) {
  const skipEnter = useAppearSkip();
  return (
    <View style={styles.wrap} testID="leaderboard-board">
      <Podium top={ranked.slice(0, 3)} metric={metric} deltas={deltas} />
      {ranked.slice(3).map((entry, i) => {
        const index = i + 3;
        return (
          <Animated.View
            key={entry.userId}
            entering={skipEnter ? undefined : appearDown(Math.min(i, 8) * 45, 360)}
          >
            <BoardRow
              entry={entry}
              rank={index + 1}
              metric={metric}
              delta={deltas[entry.userId]}
              toPass={toPassAbove(ranked, index, metric)}
              scope={scope}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
});
