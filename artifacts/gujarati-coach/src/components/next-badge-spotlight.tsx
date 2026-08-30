import { useListBadges } from "@workspace/api-client-react";
import { motion, useReducedMotion } from "framer-motion";
import { Train, Trophy } from "lucide-react";
import { getBadgeIcon } from "@/lib/badge-icons";
import { findNearestLockedBadge, progressRatio } from "@/lib/badge-progress";
import { TICKET } from "@/lib/ticket-stock";

/**
 * THE NEXT MILESTONE, AS A TICKET (build 23, ported from mobile's
 * components/NextBadgeSpotlight.tsx, build 22, the owner's Progress mockup).
 * A prominent card at the top of the Progress page that calls out the single
 * locked badge the learner is closest to unlocking, turning the gallery into
 * a directed goal rather than a reference grid. It used to be a tinted "Next
 * goal" card; the mockup makes it a slip of ticket stock with a gold edge,
 * the badge in a gold tile, a purple bar, "19 / 25 phrases" on the left and
 * "6 more to unlock" on the right, and a faint stamp in the corner. When
 * every badge is earned it shows a celebratory all-earned state instead.
 * Mobile twin: NextBadgeSpotlight; the two must spotlight the same badge.
 */

/** The unit a milestone counts in, read off its own description ("Master 25
 *  phrases", "a 7 day streak"). Empty when the description does not say, so
 *  the count stands alone rather than guessing. */
export function milestoneUnit(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("phrase")) return "phrases";
  if (d.includes("day")) return "days";
  if (d.includes("game")) return "games";
  if (d.includes("stop")) return "stops";
  return "";
}

/** Mobile's gold (constants/colors.ts, light). Web has no gold token. */
const GOLD = "#F59E0B";
const STAMP = 72;

const stock: React.CSSProperties = {
  backgroundImage: `linear-gradient(${TICKET.stockTop}, ${TICKET.stockBottom})`,
  borderColor: TICKET.edgeGold,
};

export function NextBadgeSpotlight({ lang }: { lang: string }) {
  const { data: badges, isLoading } = useListBadges({ lang });
  const reduceMotion = useReducedMotion();

  // Nothing to spotlight until we know the catalog for this language.
  if (isLoading || !badges || badges.length === 0) return null;

  const nearest = findNearestLockedBadge(badges);

  if (!nearest) {
    return (
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex flex-col items-center overflow-hidden rounded-[22px] border-[1.5px] p-[18px] text-center"
        style={stock}
      >
        <div
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: GOLD }}
        >
          <Trophy className="h-[26px] w-[26px]" style={{ color: "#1a1200" }} />
        </div>
        <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-primary">
          All badges earned
        </p>
        <h2 className="mt-1 text-lg font-extrabold" style={{ color: TICKET.ink }}>
          You've unlocked them all!
        </h2>
        <p className="mt-1 text-[13px] leading-[18px]" style={{ color: TICKET.inkMuted }}>
          Keep practicing to stay sharp. New goals await.
        </p>
      </motion.section>
    );
  }

  const Icon = getBadgeIcon(nearest.iconName);
  const ratio = progressRatio(nearest);
  const remaining = Math.max(nearest.progressTarget - nearest.progressCurrent, 0);
  const unit = milestoneUnit(nearest.description);

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[22px] border-[1.5px] p-[18px]"
      style={stock}
      data-testid="next-milestone"
    >
      {/* The stamp: two rings, the outer one perforated, a train in the
          middle, in the primary ink at a whisper. Decoration; it carries no
          state, so it can be as faint as it likes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-4 top-3.5 text-primary"
        style={{ width: STAMP, height: STAMP, opacity: 0.32, transform: "rotate(-8deg)" }}
      >
        <svg width={STAMP} height={STAMP} viewBox={`0 0 ${STAMP} ${STAMP}`}>
          <circle
            cx={STAMP / 2}
            cy={STAMP / 2}
            r={STAMP / 2 - 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
          <circle cx={STAMP / 2} cy={STAMP / 2} r={STAMP / 2 - 9} fill="none" stroke="currentColor" strokeWidth={1} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Train className="h-7 w-7" />
        </div>
      </div>

      <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[1.2px] text-primary">
        ◆  Next milestone  ◆
      </p>
      <div className="flex items-center gap-3.5" style={{ paddingRight: STAMP - 6 }}>
        <motion.div
          className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[18px]"
          style={{ backgroundColor: `${GOLD}2E`, color: GOLD }}
          animate={reduceMotion ? undefined : { opacity: [1, 0.5, 1] }}
          transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon className="h-[30px] w-[30px]" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-extrabold" style={{ color: TICKET.ink }}>
            {nearest.title}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-sm leading-[19px]" style={{ color: TICKET.inkMuted }}>
            {nearest.description}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-[9px] w-full overflow-hidden rounded-full bg-primary/[0.13]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={nearest.progressTarget}
          aria-valuenow={nearest.progressCurrent}
          aria-label={`${nearest.title} progress`}
        >
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
          />
        </div>
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="text-sm font-semibold tabular-nums" style={{ color: TICKET.ink }}>
            {`${nearest.progressCurrent} / ${nearest.progressTarget}${unit ? ` ${unit}` : ""}`}
          </span>
          <span className="text-sm font-bold text-primary">{`${remaining} more to unlock`}</span>
        </div>
      </div>
    </motion.section>
  );
}
