import type { LeaderboardEntry } from "@workspace/api-client-react";
import { MascotAvatar } from "@/components/mascot-avatar";
import { FirstClassChip } from "@/components/gold-chip";
import { LearnerSafetyButton, type BoardScope } from "@/components/board-scope";
import { RankDelta } from "@/components/leaderboard/rank-delta";
import { type BoardMetric, metricUnit, metricValue } from "@/lib/boardRanking";
import { cn } from "@/lib/utils";

function displayFor(u: { displayName?: string | null }): string {
  return u.displayName?.trim() || "Fellow learner";
}

/**
 * ONE ROW BELOW THE PODIUM (build 23 on web; mobile build 22, the mockup):
 * the place in a disc, the learner's dressed Bolo, the name, the number with
 * its unit and the places moved, and on the global board the flag that opens
 * report-or-block. The learner's own row sits on lavender with the disc
 * filled in, and says what it would take to pass the row above ("23 XP to
 * pass #5").
 *
 * Mobile twin: components/leaderboard/BoardRow.tsx.
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
  const isSelf = entry.isSelf;
  const value = metricValue(entry, metric);
  const unit = metricUnit(metric, value);
  return (
    <div
      data-testid="board-row"
      className={cn(
        "flex items-center gap-3 rounded-[18px] border-[1.5px] px-3 py-3",
        isSelf ? "border-primary/40 bg-primary/[0.08]" : "border-card-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold",
          isSelf ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {rank}
      </div>
      <MascotAvatar user={entry} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[17px] font-bold text-foreground">{isSelf ? "You" : displayFor(entry)}</span>
          {entry.firstClassActive ? <FirstClassChip /> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2.5">
          <p className="text-lg font-extrabold text-foreground">
            <span className="tabular-nums">{value.toLocaleString()}</span>
            <span className="text-[13px] font-semibold text-muted-foreground">{` ${unit}`}</span>
          </p>
          <RankDelta delta={delta} size={14} />
        </div>
        {isSelf && toPass !== null ? (
          <p className="mt-0.5 text-[13px] font-semibold text-primary">
            {`${toPass.toLocaleString()} ${metricUnit(metric, toPass)} to pass #${rank - 1}`}
          </p>
        ) : null}
      </div>
      {/* ONLY ON THE GLOBAL BOARD, AND NEVER ON YOUR OWN ROW. A friends board
          is people you accepted, so a flag there is a bug report about somebody
          you already chose. */}
      {scope === "all" && !isSelf ? (
        <LearnerSafetyButton userId={entry.userId} username={entry.username ?? entry.displayName ?? null} />
      ) : null}
    </div>
  );
}
