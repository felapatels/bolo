import { useGetProgressSummary, useListRecentAttempts } from "@workspace/api-client-react";
import { Star, Target, CalendarDays, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { springs } from "@/lib/motion";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { BandPill, bandFromScore, bandLabel, bandTextClass } from "@/components/ui/band-pill";
import { BadgesGallery } from "@/components/badges-gallery";
import { NextBadgeSpotlight } from "@/components/next-badge-spotlight";
import { AdvancedAnalytics } from "@/components/advanced-analytics";
import { Link } from "wouter";

export default function Progress() {
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const { data: summary, isLoading: loadingSummary } = useGetProgressSummary({ lang: activeLang });
  const { data: attempts, isLoading: loadingAttempts } = useListRecentAttempts({ lang: activeLang, limit: 50 });

  if (loadingSummary || loadingAttempts) {
    return (
      <div className="flex min-h-screen items-center justify-center text-secondary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="min-h-[100dvh] pb-28 lg:pb-12 bg-background animate-content-enter">
      <header className="mx-auto w-full max-w-6xl pt-6 px-6 pb-6 text-center flex flex-col items-center lg:pt-6">
        <Mascot pose="cheer" size={104} idle="cheer" className="mb-2" />
        <h1 className="text-3xl font-extrabold text-foreground mb-1 lg:text-4xl">Your Progress</h1>
        <p className="text-muted-foreground text-lg font-medium">
          {activeLanguage ? `Your ${activeLanguage.name} journey` : "Keep up the great work!"}
        </p>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 lg:px-10 space-y-8">
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Target className="w-6 h-6 text-primary" />}
            value={summary.phrasesMastered}
            label="Mastered"
            delay={0.1}
          />
          <StatCard
            icon={<Sparkles className="w-6 h-6 text-accent" />}
            value={summary.totalAttempts}
            label="Practices"
            delay={0.2}
          />
          <StatCard
            icon={<Star className="w-6 h-6 text-amber-400" />}
            value={
              summary.totalAttempts > 0 ? (
                <span
                  className={cn(
                    "text-xl leading-9",
                    bandTextClass(bandFromScore(summary.bestScore)),
                  )}
                >
                  {bandLabel(bandFromScore(summary.bestScore))}
                </span>
              ) : (
                "—"
              )
            }
            label="Best Attempt"
            delay={0.3}
          />
          <StatCard
            icon={<CalendarDays className="w-6 h-6 text-success" />}
            value={summary.currentStreakDays}
            label="Day Streak"
            delay={0.4}
          />
        </section>

        <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
          {/* Achievements & analytics — the wide left column on desktop. */}
          <div className="space-y-8 lg:col-span-2">
            <NextBadgeSpotlight lang={activeLang} />
            <BadgesGallery lang={activeLang} />
            <AdvancedAnalytics lang={activeLang} />
          </div>

          {/* Practice history — a dedicated column on desktop. */}
          <section className="lg:col-span-1">
            <h2 className="text-xl font-bold text-foreground mb-4">Practice History</h2>

            {attempts && attempts.length > 0 ? (
              <div className="space-y-4">
                {attempts.map((attempt, i) => (
                  <motion.div
                    key={attempt.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...springs.snappy, delay: Math.min(i * 0.04, 0.4) }}
                    className="bg-card rounded-2xl p-4 border border-card-border shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground uppercase">
                        {format(new Date(attempt.createdAt), 'MMM d, h:mm a')}
                      </span>
                      {/* Prefer the server-recorded band; older rows predate
                          banding, so fall back to deriving it from the score. */}
                      <BandPill band={attempt.band ?? bandFromScore(attempt.score)} />
                    </div>

                    <div>
                      <p className="text-xl font-bold text-foreground leading-tight" style={native.style} dir={native.dir}>{attempt.nativeScript}</p>
                      <p className="text-sm text-muted-foreground mt-1">{attempt.english}</p>
                    </div>

                    {attempt.feedback && (
                      <div className="bg-muted/50 rounded-xl p-3 mt-1">
                        <p className="text-sm text-foreground font-medium">"{attempt.feedback}"</p>
                      </div>
                    )}

                    {attempt.categoryId != null && attempt.phraseId != null && (
                      <Link
                        href={`/practice/${attempt.categoryId}?phrase=${attempt.phraseId}`}
                        onClick={blessAudioPlayback}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors self-start"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Retake
                      </Link>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border">
                <p className="text-muted-foreground font-medium">No practice history yet.</p>
              </div>
            )}
          </section>
        </div>
      </main>

    </div>
  );
}

function StatCard({ icon, value, label, delay }: { icon: React.ReactNode, value: React.ReactNode, label: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-card p-5 rounded-3xl border border-card-border shadow-sm flex flex-col items-center text-center button-spring"
    >
      <div className="mb-3 p-2 bg-muted rounded-full">
        {icon}
      </div>
      <div className="text-3xl font-black text-foreground mb-1">{value}</div>
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
    </motion.div>
  );
}
