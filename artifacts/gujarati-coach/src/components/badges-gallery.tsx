import { useListBadges } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getBadgeIcon } from "@/lib/badge-icons";

// The per-language badges gallery shown on the Progress screen. Earned badges
// render in full color with the date earned; locked badges are dimmed with the
// unlock hint.
export function BadgesGallery({ lang }: { lang: string }) {
  const { data: badges, isLoading } = useListBadges({ lang });

  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;
  const total = badges?.length ?? 0;

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
        <div className="grid grid-cols-3 gap-3">
          {badges.map((badge, i) => {
            const Icon = getBadgeIcon(badge.iconName);
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
                    : "bg-muted/40 border-dashed border-border",
                )}
                title={badge.description}
              >
                <div
                  className={cn(
                    "mb-2 flex h-12 w-12 items-center justify-center rounded-full",
                    badge.earned
                      ? "bg-secondary text-white shadow-md shadow-secondary/30"
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
                  <p className="mt-1 text-[10px] font-medium leading-tight text-muted-foreground/80">
                    {badge.description}
                  </p>
                )}
              </motion.div>
            );
          })}
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
