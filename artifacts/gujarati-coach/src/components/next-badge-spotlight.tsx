import { useListBadges } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { getBadgeIcon } from "@/lib/badge-icons";
import { findNearestLockedBadge, progressRatio } from "@/lib/badge-progress";

// A prominent "next goal" card at the top of the Progress screen that calls out
// the single locked badge the learner is closest to unlocking, so the badges
// gallery becomes a directed goal rather than a reference grid. When every badge
// is earned it shows a celebratory all-earned state instead.
export function NextBadgeSpotlight({ lang }: { lang: string }) {
  const { data: badges, isLoading } = useListBadges({ lang });

  // Nothing to spotlight until we know the catalog for this language.
  if (isLoading || !badges || badges.length === 0) return null;

  const nearest = findNearestLockedBadge(badges);

  if (!nearest) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-secondary/30 bg-gradient-to-br from-secondary/10 to-primary/10 p-5 text-center shadow-sm"
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-white shadow-md shadow-secondary/30">
          <Trophy className="h-7 w-7" />
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-secondary">
          All badges earned
        </p>
        <h2 className="mt-1 text-lg font-extrabold text-foreground">
          You've unlocked them all!
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Keep practicing to stay sharp, new goals await.
        </p>
      </motion.section>
    );
  }

  const Icon = getBadgeIcon(nearest.iconName);
  const ratio = progressRatio(nearest);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-secondary/40 bg-gradient-to-br from-secondary/10 to-primary/5 p-5 shadow-sm"
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-secondary">
        Next goal
      </p>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
          <Icon className="h-8 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold text-foreground">
            {nearest.title}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium text-muted-foreground">
            {nearest.description}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={nearest.progressTarget}
          aria-valuenow={nearest.progressCurrent}
          aria-label={`${nearest.title} progress`}
        >
          <motion.div
            className="h-full rounded-full bg-secondary"
            initial={{ width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ duration: 0.6, delay: 0.15 }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-secondary">
            {Math.round(ratio * 100)}% there
          </span>
          <span className="text-sm font-black tabular-nums text-foreground">
            {nearest.progressCurrent} / {nearest.progressTarget}
          </span>
        </div>
      </div>
    </motion.section>
  );
}
