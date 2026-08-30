import { Star } from "lucide-react";
import type { LeaderboardEntry } from "@workspace/api-client-react";
import { MascotAvatar } from "@/components/mascot-avatar";
import { FirstClassChip } from "@/components/gold-chip";
import { RankDelta } from "@/components/leaderboard/rank-delta";
import { type BoardMetric, metricUnit, metricValue } from "@/lib/boardRanking";
import { GOLD } from "@/lib/gold";
import { TICKET } from "@/lib/ticket-stock";

/**
 * TOP TRAVELERS (build 23 on web; mobile build 22, the owner's Leaderboard
 * mockup): the first three on a cream stage, the leader raised in the middle
 * in a gold ring, second in silver to the left, third in bronze to the right,
 * each with a medallion carrying the place, the name, the number and its
 * unit, and the places moved. Along the bottom, a curve of rails.
 *
 * The rings are the podium's own: gold here is a place somebody EARNED this
 * week, and the FirstClassChip stays the only gold that was bought.
 *
 * ONE THING THE PHONE DRAWS THAT THIS DOES NOT: two of the journey's landmark
 * silhouettes behind the seats at a whisper. Web has no per-city silhouette
 * component (its scenery is the postcard vista), so the stage stands on its
 * rails alone rather than on an approximation.
 *
 * Mobile twin: components/leaderboard/Podium.tsx.
 */
const RINGS: Record<1 | 2 | 3, readonly [string, string]> = {
  1: ["#F8DC7A", "#D4A017"],
  2: ["#EEF0F3", "#A3A9B4"],
  3: ["#F0BE93", "#B5651D"],
};

const BIG = 88;
const SMALL = 72;
const RING = 6;

function displayFor(u: { displayName?: string | null }): string {
  return u.displayName?.trim() || "Fellow learner";
}

function Seat({
  entry,
  place,
  metric,
  delta,
}: {
  entry: LeaderboardEntry | undefined;
  place: 1 | 2 | 3;
  metric: BoardMetric;
  delta: number | undefined;
}) {
  const size = place === 1 ? BIG : SMALL;
  const [ringTop, ringBottom] = RINGS[place];
  if (!entry) return <div style={{ width: size + 40 }} />;
  const value = metricValue(entry, metric);
  const outer = size + RING * 2;
  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ width: size + 40, marginTop: place === 1 ? 0 : 26 }}
      data-testid={`podium-${place}`}
    >
      <div className="relative" style={{ width: outer, height: outer }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ backgroundImage: `linear-gradient(160deg, ${ringTop}, ${ringBottom})` }}
        />
        <div
          className="absolute flex items-center justify-center rounded-full bg-card"
          style={{ left: RING, top: RING, width: size, height: size }}
        >
          <MascotAvatar user={entry} size={size - 6} />
        </div>
        {place === 1 ? (
          <span
            className="absolute left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-card"
            style={{ top: -8 }}
          >
            <Star className="h-3.5 w-3.5" style={{ color: ringBottom }} />
          </span>
        ) : null}
        <span
          className="absolute left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-card text-[13px] font-extrabold"
          style={{ bottom: -6, backgroundColor: ringBottom, color: "#1a1200" }}
        >
          {place}
        </span>
      </div>
      <div className="mt-2.5 flex max-w-full items-center gap-1">
        <span className="truncate text-sm font-bold text-foreground">{entry.isSelf ? "You" : displayFor(entry)}</span>
        {entry.firstClassActive ? <FirstClassChip /> : null}
      </div>
      <p className="font-extrabold text-foreground" style={{ fontSize: place === 1 ? 24 : 20 }}>
        <span className="tabular-nums">{value.toLocaleString()}</span>
        <span className="text-[13px] font-semibold text-muted-foreground">{` ${metricUnit(metric, value)}`}</span>
      </p>
      <RankDelta delta={delta} size={14} />
    </div>
  );
}

export function Podium({
  top,
  metric,
  deltas,
}: {
  /** The first three, best first; fewer is fine and the seats stay empty. */
  top: readonly LeaderboardEntry[];
  metric: BoardMetric;
  deltas: Record<string, number>;
}) {
  const [first, second, third] = top;
  return (
    <section
      className="overflow-hidden rounded-[22px] border pb-1.5 pt-3.5"
      style={{ backgroundColor: `${GOLD}12`, borderColor: `${GOLD}33` }}
      data-testid="podium"
    >
      <p className="mb-3 text-center text-[13px] font-extrabold tracking-[2px] text-primary">◆  TOP TRAVELERS  ◆</p>
      <div className="flex items-start justify-center gap-1 px-1.5">
        <Seat entry={second} place={2} metric={metric} delta={second ? deltas[second.userId] : undefined} />
        <Seat entry={first} place={1} metric={metric} delta={first ? deltas[first.userId] : undefined} />
        <Seat entry={third} place={3} metric={metric} delta={third ? deltas[third.userId] : undefined} />
      </div>
      {/* The rails, curving under the seats. */}
      <svg
        aria-hidden
        className="mt-1 block w-full"
        height={34}
        viewBox="0 0 360 34"
        preserveAspectRatio="none"
      >
        <path d="M0 6 Q180 44 360 6" stroke={TICKET.ink} strokeOpacity={0.16} strokeWidth={3} fill="none" />
        <path d="M0 14 Q180 52 360 14" stroke={TICKET.ink} strokeOpacity={0.16} strokeWidth={3} fill="none" />
        {Array.from({ length: 13 }, (_, i) => {
          const x = 10 + i * 28;
          const t = x / 360;
          const y = 6 + 19 * 4 * t * (1 - t);
          return <path key={i} d={`M${x} ${y - 1} L${x} ${y + 11}`} stroke={TICKET.ink} strokeOpacity={0.12} strokeWidth={4} />;
        })}
      </svg>
    </section>
  );
}
