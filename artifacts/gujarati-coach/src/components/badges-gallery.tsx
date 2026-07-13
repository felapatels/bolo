import { useListBadges } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Loader2, Lock, Crown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getBadgeIcon } from "@/lib/badge-icons";
import { useEntitlements, upgradeHref } from "@/lib/entitlements";
import { NEAR_THRESHOLD, progressRatio } from "@/lib/badge-progress";

// The per-language badges gallery shown on the Progress screen. Earned badges
// render in full color with the date earned; locked badges are dimmed and show
// a progress bar toward their unlock criteria, with the nearest goals
// emphasized to keep learners motivated.
export function BadgesGallery({ lang }: { lang: string }) {
  const { data: badges, isLoading } = useListBadges({ lang });
  const { isPlus } = useEntitlements();

  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;
  const total = badges?.length ?? 0;

  // The highest progress ratio among still-locked badges — used to emphasize the
  // goal(s) the learner is closest to unlocking.
  const nearestRatio = badges
    ? badges
        .filter((b) => !b.earned)
        .reduce((max, b) => Math.max(max, progressRatio(b)), 0)
    : 0;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground">Badges</h2>
        {total > 0 && (
          <span className="text-sm font-bold text-muted-foreground">
            {earnedCount}/{total} earned
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 text-secondary">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : badges && badges.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {badges.map((badge, i) => {
            const Icon = getBadgeIcon(badge.iconName);
            const ratio = progressRatio(badge);
            // Only emphasize locked badges the learner is meaningfully close to,
            // and only the very nearest so the highlight stays meaningful.
            const isNearest =
              !badge.earned &&
              ratio >= NEAR_THRESHOLD &&
              ratio === nearestRatio &&
              ratio < 1;
            return (
              <motion.div
                key={badge.key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "relative flex flex-col items-center text-center rounded-2xl p-3 border shadow-sm",
                  badge.earned
                    ? "bg-white border-card-border"
                    : isNearest
                      ? "bg-secondary/5 border-secondary ring-1 ring-secondary/40"
                      : "bg-muted/40 border-dashed border-border",
                )}
                title={badge.description}
              >
                {isNearest && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                    Almost there
                  </span>
                )}
                <div
                  className={cn(
                    "mb-2 flex h-12 w-12 items-center justify-center rounded-full",
                    badge.earned
                      ? "bg-secondary text-white shadow-md shadow-secondary/30"
                      : isNearest
                        ? "bg-secondary/15 text-secondary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {badge.earned ? (
                    <Icon className="h-6 w-6" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </div>
                <p
                  className={cn(
                    "text-xs font-bold leading-tight",
                    badge.earned ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {badge.title}
                </p>
                {badge.earned && badge.earnedAt ? (
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {format(new Date(badge.earnedAt), "MMM d, yyyy")}
                  </p>
                ) : (
                  <div className="mt-2 w-full">
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={badge.progressTarget}
                      aria-valuenow={badge.progressCurrent}
                      aria-label={`${badge.title} progress`}
                    >
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          isNearest ? "bg-secondary" : "bg-secondary/50",
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${ratio * 100}%` }}
                        transition={{ duration: 0.5, delay: i * 0.04 + 0.1 }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                      {badge.progressCurrent} / {badge.progressTarget}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
          {!isPlus && (
            <Link
              href={upgradeHref({ plan: "plus" })}
              className="relative flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3 text-center shadow-sm transition-all hover:border-primary active:scale-[0.98]"
              title="Unlock exclusive Plus badges"
            >
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-primary to-secondary text-white shadow-md">
                <Crown className="h-6 w-6" fill="currentColor" />
              </div>
              <p className="text-xs font-bold leading-tight text-foreground">
                Plus badges
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                Unlock
              </p>
            </Link>
          )}
        </div>
      ) : (
        <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-border">
          <p className="text-muted-foreground font-medium">
            No badges available yet.
          </p>
        </div>
      )}
    </section>
  );
}
