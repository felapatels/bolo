import { useGetProgressAnalytics } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { BarChart3, ChevronRight, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { bandFromScore, bandLabel } from "@/components/ui/band-pill";
import { useEntitlements, upgradeHref } from "@/lib/entitlements";
import { UpgradeCard } from "@/components/plus";

// The advanced analytics surface. For Free learners it's present but locked with
// an upgrade prompt; for Plus it renders a per-topic mastery breakdown and a
// recent-activity strip from the server analytics endpoint.
export function AdvancedAnalytics({ lang }: { lang: string }) {
  const { features } = useEntitlements();

  if (!features.advancedAnalytics) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Advanced analytics</h2>
        </div>
        <UpgradeCard
          icon={<BarChart3 className="h-7 w-7" />}
          title="See your full breakdown"
          description="Track mastery by topic, average scores, and your day-by-day activity with All-Access analytics."
          // Advanced analytics is an All-Access feature.
          href={upgradeHref({ plan: "plus" })}
        />
      </section>
    );
  }

  return <AnalyticsPanel lang={lang} />;
}

function AnalyticsPanel({ lang }: { lang: string }) {
  const { data, isLoading } = useGetProgressAnalytics({ lang });

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Advanced analytics</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 text-secondary">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : data && data.categories.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-card-border bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-muted-foreground">
              Mastery by topic
            </h3>
            <div className="space-y-4">
              {data.categories.map((cat) => {
                const pct =
                  cat.phraseCount > 0
                    ? Math.round((cat.masteredCount / cat.phraseCount) * 100)
                    : 0;
                return (
                  <Link
                    key={cat.categoryId}
                    href={`/learn/${cat.categoryId}`}
                    aria-label={`Practice ${cat.title}`}
                    className="group -mx-2 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                          {cat.title}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-muted-foreground">
                          {cat.masteredCount}/{cat.phraseCount}
                          {/* Band word instead of a raw average score — same
                              canonical thresholds as everywhere else. */}
                          {cat.averageScore > 0 && (
                            <span
                              className={cn(
                                "ml-2",
                                bandFromScore(cat.averageScore) === "nailed" &&
                                  "text-success",
                                bandFromScore(cat.averageScore) === "close" &&
                                  "text-primary",
                                bandFromScore(cat.averageScore) === "retry" &&
                                  "text-destructive",
                              )}
                            >
                              {bandLabel(bandFromScore(cat.averageScore))}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 100 ? "bg-success" : "bg-primary",
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </Link>
                );
              })}
            </div>
          </div>

          {data.daily.length > 0 && (
            <div className="rounded-3xl border border-card-border bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Recent activity
              </h3>
              <div className="flex items-end justify-between gap-1.5" style={{ height: 96 }}>
                {data.daily.slice(-14).map((d) => {
                  const max = Math.max(
                    1,
                    ...data.daily.slice(-14).map((x) => x.attempts),
                  );
                  const h = Math.round((d.attempts / max) * 100);
                  return (
                    <div
                      key={d.date}
                      className="flex flex-1 flex-col items-center justify-end"
                      title={`${d.date}: ${d.attempts} practices`}
                    >
                      <motion.div
                        className="w-full rounded-t-md bg-secondary/70"
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(h, d.attempts > 0 ? 8 : 2)}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-white py-8 text-center">
          <p className="font-medium text-muted-foreground">
            Practice a few phrases to see your analytics here.
          </p>
        </div>
      )}
    </section>
  );
}
