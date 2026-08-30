import { motion, useReducedMotion } from "framer-motion";
import type { LeaderboardEntry } from "@workspace/api-client-react";
import type { BoardScope } from "@/components/board-scope";
import { BoardRow } from "@/components/leaderboard/board-row";
import { Podium } from "@/components/leaderboard/podium";
import { type BoardMetric, toPassAbove } from "@/lib/boardRanking";

/**
 * THE BOARD ITSELF: the podium for the first three and a row for everyone
 * after (build 23 on web; mobile build 22). Both the Leaderboard page and the
 * friends page's board render this, fed by their own query and states, which
 * is what makes the two boards one board. `ranked` is already in order
 * (rankEntries); this draws, it does not sort.
 *
 * Mobile twin: components/leaderboard/LeaderboardBoard.tsx.
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
  const reduceMotion = useReducedMotion();
  return (
    <div className="space-y-2.5" data-testid="leaderboard-board">
      <Podium top={ranked.slice(0, 3)} metric={metric} deltas={deltas} />
      {ranked.slice(3).map((entry, i) => {
        const index = i + 3;
        return (
          <motion.div
            key={entry.userId}
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: (Math.min(i, 8) * 45) / 1000 }}
          >
            <BoardRow
              entry={entry}
              rank={index + 1}
              metric={metric}
              delta={deltas[entry.userId]}
              toPass={toPassAbove(ranked, index, metric)}
              scope={scope}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
