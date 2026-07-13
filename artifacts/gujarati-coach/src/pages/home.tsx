import { BookOpen, Trophy, Sparkles, Flame, Star, Loader2, ArrowRight, Hand, LogOut, HandHeart, Users, Hash, Utensils, Sun, Smile, Target, Zap } from "lucide-react";
import { Link } from "wouter";
import { useGetProgressSummary, useListCategories, useListRecentAttempts, useListReviewPhrases, getListReviewPhrasesQueryKey } from "@workspace/api-client-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { LanguagePicker } from "@/components/language-picker";
import { UpgradeCard } from "@/components/plus";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUser, useClerk } from "@clerk/react";
import type { CSSProperties } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const iconMap: Record<string, React.ElementType> = {
  HandHeart,
  Users,
  Hash,
  Utensils,
  Sun,
  Smile,
  BookOpen,
  Star,
  Sparkles,
  Flame,
};

export default function Home() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const firstName = user?.firstName;
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const { isPlus, features, dailyNewLessons } = useEntitlements();
  const { data: summary, isLoading: loadingSummary } = useGetProgressSummary({ lang: activeLang });
  const { data: categories, isLoading: loadingCats } = useListCategories({ lang: activeLang });
  const { data: attempts } = useListRecentAttempts({ lang: activeLang, limit: 3 });
  // Review is a Plus feature; only fetch the review queue when it's unlocked
  // (Free callers 402 on this route).
  const { data: reviewPhrases } = useListReviewPhrases(
    { lang: activeLang },
    {
      query: {
        enabled: features.review,
        queryKey: getListReviewPhrasesQueryKey({ lang: activeLang }),
      },
    },
  );
  const reviewCount = reviewPhrases?.length ?? 0;
  const canReview = reviewCount > 0;
  const dailyRemaining = dailyNewLessons.remaining;
  const dailyLimit = dailyNewLessons.limit;
  const showDailyMeter = !isPlus && dailyLimit !== null && dailyRemaining !== null;
  const capReached = showDailyMeter && dailyRemaining === 0;

  if (loadingSummary || loadingCats) {
    return (
      <div className="flex min-h-screen items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-28 bg-background">
      {/* Header / Greeting */}
      <header className="pt-12 px-6 pb-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-black text-foreground mb-1 tracking-tight">
              Hello{firstName ? `, ${firstName}` : ""}! <Hand className="inline-block w-8 h-8 text-primary origin-bottom-right animate-wave" />
            </h1>
            <p className="text-muted-foreground text-lg font-semibold">
              Ready to speak some <span className="text-foreground">{activeLanguage?.name ?? "..."}</span>?
            </p>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            title="Sign out"
            className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center bg-white border border-card-border text-muted-foreground hover:text-foreground shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </motion.div>

        <div className="mt-5">
          <LanguagePicker />
        </div>

        {/* Stats Banner — vibrant, front-and-center progress */}
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[hsl(24,100%,47%)] via-[hsl(0,85%,50%)] to-[hsl(330,82%,46%)] p-5 text-white shadow-[0_10px_30px_-8px_hsl(27,100%,40%,0.55)]"
          >
            {/* soft decorative blobs */}
            <div className="pointer-events-none absolute -top-10 -right-8 h-36 w-36 rounded-full bg-white/15 blur-xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-white/10 blur-xl" />

            <div className="relative flex items-stretch">
              <StatCell icon={<Flame className="w-6 h-6" fill="currentColor" />} value={summary.currentStreakDays} label="Day Streak" />
              <div className="w-px self-stretch bg-white/25" />
              <StatCell icon={<Star className="w-6 h-6" fill="currentColor" />} value={summary.xp} label="Total XP" />
              <div className="w-px self-stretch bg-white/25" />
              <StatCell icon={<Trophy className="w-6 h-6" fill="currentColor" />} value={summary.phrasesMastered} label="Mastered" />
            </div>
          </motion.div>
        )}
      </header>

      <main className="px-6 space-y-8 mt-8">
        {/* Categories Grid */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-black text-foreground tracking-tight">Pick a topic</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {categories?.map((cat, i) => {
              const Icon = iconMap[cat.iconName] || BookOpen;
              const accent = cat.accent || "var(--color-primary)";
              const progress = cat.phraseCount > 0 ? Math.round((cat.masteredCount / cat.phraseCount) * 100) : 0;
              const done = progress >= 100;

              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                >
                  <Link href={`/learn/${cat.id}`} className="block h-full">
                    <div
                      className="group relative flex h-full flex-col rounded-3xl border-2 bg-white p-4 shadow-[0_6px_0_var(--tile)] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_var(--tile)]"
                      style={{ borderColor: accent, ["--tile" as string]: accent } as CSSProperties}
                    >
                      <div
                        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-10"
                        style={{ backgroundColor: accent }}
                      />

                      <div className="flex items-center justify-between">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm"
                          style={{ backgroundColor: accent }}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className="text-xs font-black" style={{ color: accent }}>
                          {done ? "Done!" : `${progress}%`}
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-black leading-tight text-foreground">{cat.title}</h3>
                      {cat.titleNative && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground" style={native.style} dir={native.dir}>
                          {cat.titleNative}
                        </p>
                      )}

                      <div className="mt-auto pt-4">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${progress}%`, backgroundColor: accent }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        {categories && categories.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Link
              href={`/practice/${categories[0].id}`}
              className="flex w-full items-center justify-between rounded-2xl bg-primary px-6 py-5 text-lg font-black text-primary-foreground shadow-[0_8px_0_hsl(27,100%,45%)] transition-all active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)]"
            >
              <span className="flex items-center gap-3">
                <Flame className="h-6 w-6" fill="currentColor" />
                Start Daily Practice!
              </span>
              <div className="rounded-full bg-white/20 p-2">
                <ArrowRight className="h-6 w-6" />
              </div>
            </Link>
          </motion.div>
        )}

        {/* Daily lesson allowance (Free only) */}
        {showDailyMeter && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
            {capReached ? (
              <UpgradeCard
                icon={<Zap className="h-6 w-6" fill="currentColor" />}
                title="You've hit today's free lessons"
                description={`You've used all ${dailyLimit} of today's new lessons. Come back tomorrow, or go unlimited with Plus.`}
                cta="Go unlimited"
              />
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Zap className="h-5 w-5" fill="currentColor" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {dailyRemaining} of {dailyLimit} free lessons left today
                </p>
                <Link href="/upgrade" className="ml-auto text-sm font-black text-primary shrink-0">
                  Go unlimited
                </Link>
              </div>
            )}
          </motion.div>
        )}

        {/* Review Weakest Phrases */}
        <section>
          {!features.review ? (
            <UpgradeCard
              icon={<Target className="h-7 w-7" />}
              title="Review your weakest phrases"
              description="Plus builds smart review sessions from the phrases you find trickiest, so they actually stick."
            />
          ) : canReview ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              <Link
                href="/review"
                className="relative flex items-center gap-4 overflow-hidden rounded-3xl border-2 border-secondary bg-secondary/5 p-5 shadow-[0_6px_0_hsl(190,100%,42%)] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_hsl(190,100%,42%)]"
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-secondary opacity-10" />
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-white shadow-sm">
                  <Target className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black leading-tight text-foreground">Review your weakest phrases</h3>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                    {reviewCount} {reviewCount === 1 ? "phrase" : "phrases"} to sharpen up
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-white">
                  <ArrowRight className="h-5 w-5" />
                </div>
              </Link>
            </motion.div>
          ) : (
            <div className="flex items-center gap-4 rounded-3xl border border-card-border bg-muted/40 p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Target className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold leading-tight text-muted-foreground">Review your weakest phrases</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Practice a few phrases first — the ones you find tricky will show up here to review.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Recent Activity */}
        {attempts && attempts.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Recent plays</h2>
            <div className="space-y-3">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="flex items-center gap-4 rounded-2xl border border-card-border bg-white p-4 shadow-sm">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-lg font-black",
                    attempt.score >= 80 ? "bg-success/15 text-success" :
                    attempt.score >= 60 ? "bg-primary/15 text-primary" :
                    "bg-destructive/15 text-destructive"
                  )}>
                    {Math.round(attempt.score)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg leading-tight" style={native.style} dir={native.dir}>{attempt.nativeScript}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{attempt.english}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function StatCell({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center">
      <div className="text-white">{icon}</div>
      <div className="text-2xl font-black leading-none">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-white">{label}</div>
    </div>
  );
}
