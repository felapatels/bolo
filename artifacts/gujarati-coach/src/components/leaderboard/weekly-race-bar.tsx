import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { RankDelta } from "@/components/leaderboard/rank-delta";
import { formatRaceCountdown, weekEndsInMs } from "@/lib/boardRanking";
import { TICKET } from "@/lib/ticket-stock";

/**
 * "Weekly race ends in 2d 10h", and where you stand (build 23 on web; mobile
 * build 22, the mockup). The clock is the server's own window, Monday 00:00
 * UTC to the next, so the bar and the numbers agree. It ticks once a minute;
 * nobody watches a countdown of days by the second.
 *
 * Mobile twin: components/leaderboard/WeeklyRaceBar.tsx.
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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const left = formatRaceCountdown(weekEndsInMs(now));
  return (
    <div
      className="flex items-center gap-2 rounded-2xl border px-3.5 py-3"
      style={{ backgroundColor: TICKET.stockTop, borderColor: TICKET.rule, color: TICKET.ink }}
      data-testid="weekly-race-bar"
    >
      <Clock className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
        {metricLabel === "XP" ? `Weekly race ends in ${left}` : `Streaks: week ends in ${left}`}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {rank !== null ? (
          <>
            <span className="rounded-full bg-primary/[0.08] px-2.5 py-1 text-[13px] font-bold text-primary">
              {`You: #${rank}`}
            </span>
            <RankDelta delta={delta} size={14} />
          </>
        ) : (
          <span className="text-[13px] font-bold text-primary">Join the race</span>
        )}
      </div>
    </div>
  );
}
