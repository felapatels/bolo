import { Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardMetric } from "@/lib/boardRanking";

/**
 * XP or Streak: which number ranks the board (build 23 on web; mobile build
 * 22, the owner's Leaderboard mockup). Two wide pills, the chosen one filled
 * in the primary because choosing is a touch. One payload feeds both; the
 * toggle only changes the sort, so it costs no request.
 *
 * Mobile twin: components/leaderboard/MetricToggle.tsx.
 */
export function MetricToggle({
  metric,
  onChange,
}: {
  metric: BoardMetric;
  onChange: (next: BoardMetric) => void;
}) {
  const pill = (value: BoardMetric, label: string, Glyph: typeof Zap) => {
    const active = metric === value;
    return (
      <button
        key={value}
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`Rank by ${label}`}
        data-testid={`board-metric-${value}`}
        onClick={() => onChange(value)}
        className={cn(
          "flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] text-base font-extrabold transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-card-border bg-card text-foreground hover:border-primary/40",
        )}
      >
        <Glyph className={cn("h-[18px] w-[18px]", active ? "text-primary-foreground" : "text-muted-foreground")} />
        {label}
      </button>
    );
  };
  return (
    <div className="flex gap-3" role="tablist" aria-label="Which number ranks the board">
      {pill("xp", "XP", Zap)}
      {pill("streak", "Streak", Flame)}
    </div>
  );
}
