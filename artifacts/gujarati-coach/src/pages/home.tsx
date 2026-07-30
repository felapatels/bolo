import { useState, useEffect } from "react";
import { BookOpen, Trophy, Sparkles, Flame, Star, Loader2, ArrowRight, Settings, HandHeart, Users, Hash, Utensils, Sun, Smile, Target, Zap, MessageCircle, HelpCircle, Mic } from "lucide-react";
import { Link } from "wouter";
import { useGetProgressSummary, useGetAccount, useListCategories, useListRecentAttempts, useListReviewPhrases, getListReviewPhrasesQueryKey, useListBadges } from "@workspace/api-client-react";
import { MilestoneToast } from "@/components/ui/milestone-toast";
import { webHaptic } from "@/lib/haptics";
import { LanguagePicker } from "@/components/language-picker";
import { UpgradeCard } from "@/components/plus";
import { Mascot } from "@/components/mascot";
import { useIsDesktop } from "@/hooks/use-mobile";
import { getBadgeIcon } from "@/lib/badge-icons";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { getJourneyLine } from "@/lib/journeyLines";
import { useJourneyProgress } from "@/lib/useJourneyProgress";
import { TrainEngine } from "@/components/train-svg";
import { PunchHole, TicketPerforationV, TicketStripes, ZoneStamp } from "@/components/ticket";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";
import { useEntitlements, upgradeHref } from "@/lib/entitlements";
import { useTour, TOUR_STEPS } from "@/lib/tour-context";
import { motion, useReducedMotion } from "framer-motion";
import { springs, FloatingTag } from "@/lib/motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/react";
import type { CSSProperties } from "react";

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
  const firstName = user?.firstName;
  const { activeLang, activeLanguage } = useLanguage();
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsDesktop();
  const native = useNativeText();
  const journeyLine = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, journeyLine.zones);
  const { isPlus, features, dailyNewLessons } = useEntitlements();
  const { startTour } = useTour();
  const { data: summary, isLoading: loadingSummary } = useGetProgressSummary({ lang: activeLang });
  const { data: account } = useGetAccount();
  const dailyGoal: number = account?.preferences?.learning.dailyGoal ?? 10;
  // Toast key — bump to re-fire the milestone toast when the goal is hit.
  const [goalToastKey, setGoalToastKey] = useState<number | null>(null);
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
  const { data: badges } = useListBadges({ lang: activeLang });
  // The most recently earned badge for the active language — surfaced on the
  // home screen so learners get an immediate hit of accomplishment on open.
  const earnedBadges = (badges ?? []).filter((b) => b.earned && b.earnedAt);
  const earnedBadgeCount = earnedBadges.length;
  const latestBadge =
    earnedBadges.length > 0
      ? [...earnedBadges].sort(
          (a, b) => new Date(b.earnedAt!).getTime() - new Date(a.earnedAt!).getTime(),
        )[0]
      : null;
  const reviewCount = reviewPhrases?.length ?? 0;
  const canReview = reviewCount > 0;
  const dailyRemaining = dailyNewLessons.remaining;
  const dailyLimit = dailyNewLessons.limit;
  const showDailyMeter = !isPlus && dailyLimit !== null && dailyRemaining !== null;
  const capReached = showDailyMeter && dailyRemaining === 0;

  // Daily goal celebration — fire once per calendar day when the learner hits
  // their goal, mirroring the AsyncStorage guard on mobile home screen.
  useEffect(() => {
    if (!summary) return;
    if (summary.attemptsToday < dailyGoal) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem('goalCelebratedDate') === today) return;
      localStorage.setItem('goalCelebratedDate', today);
    } catch {
      // localStorage unavailable; still fire once this session.
    }
    setGoalToastKey(k => (k ?? 0) + 1);
    webHaptic('success');
  }, [summary, dailyGoal]);

  if (loadingSummary || loadingCats) {
    return (
      <div className="flex min-h-screen items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  // The "review your weakest phrases" surface — shown on desktop in the right
  // rail and on mobile in the single column. Extracted so it can live in either
  // place without duplicating the branching.
  const reviewSection = (
    <section>
      {!features.review ? (
        <UpgradeCard
          icon={<Target className="h-7 w-7" />}
          title="Review your weakest phrases"
          description="All-Access builds smart review sessions from the phrases you find trickiest, so they actually stick."
          // Review is an All-Access feature.
          href={upgradeHref({ plan: "plus" })}
        />
      ) : canReview ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={springs.gentle}>
          <Link
            href="/review"
            className="relative flex items-center gap-4 overflow-hidden rounded-3xl border-2 border-secondary bg-secondary/5 p-5 shadow-[0_6px_0_hsl(var(--secondary-shadow))] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_hsl(var(--secondary-shadow))]"
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
  );

  const latestBadgeSection = latestBadge && (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.gentle, delay: 0.12 }}
    >
      <Link
        href="/progress"
        className="relative flex items-center gap-4 overflow-hidden rounded-3xl border-2 border-secondary bg-secondary/5 p-5 shadow-[0_6px_0_hsl(var(--secondary-shadow))] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_hsl(var(--secondary-shadow))]"
      >
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-secondary opacity-10" />
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-white shadow-md shadow-secondary/30">
          {(() => {
            const BadgeIcon = getBadgeIcon(latestBadge.iconName);
            return <BadgeIcon className="h-7 w-7" />;
          })()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-secondary">
            Latest badge
          </p>
          <h3 className="truncate text-lg font-black leading-tight text-foreground">
            {latestBadge.title}
          </h3>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">
            {earnedBadgeCount} {earnedBadgeCount === 1 ? "badge" : "badges"} earned
            {" · "}
            {format(new Date(latestBadge.earnedAt!), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-white">
          <ArrowRight className="h-5 w-5" />
        </div>
      </Link>
    </motion.section>
  );

  const recentSection = attempts && attempts.length > 0 && (
    <section>
      <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Recent plays</h2>
      <div className="space-y-3">
        {attempts.map((attempt) => {
          const canRetake = attempt.phraseId != null && attempt.categoryId != null;
          const cardContent = (
            <>
              <div className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black",
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
              {canRetake && (
                <span className="shrink-0 text-sm font-black text-primary">
                  Retake
                </span>
              )}
            </>
          );

          return canRetake ? (
            <Link
              key={attempt.id}
              href={`/practice/${attempt.categoryId}?phrase=${attempt.phraseId}`}
              className="flex items-center gap-4 rounded-2xl border border-card-border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0"
            >
              {cardContent}
            </Link>
          ) : (
            <div key={attempt.id} className="flex items-center gap-4 rounded-2xl border border-card-border bg-white p-4 shadow-sm">
              {cardContent}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="min-h-[100dvh] pb-28 lg:pb-12 animate-content-enter">
      {/* Header / Greeting */}
      <header className="mx-auto w-full max-w-6xl px-6 pt-6 pb-2 lg:px-10 lg:pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.smooth} className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* One mascot, sized per breakpoint via JS instead of mounting two
                CSS-hidden copies — a hidden mascot still animates and burns CPU. */}
            <Mascot pose="wave" size={isDesktop ? 92 : 76} className="shrink-0 -ml-1" />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black text-foreground tracking-tight lg:text-4xl">
                  Hello{firstName ? `, ${firstName}` : ""}!
                </h1>
                {activeLanguage && (
                  <FloatingTag
                    className="bg-secondary/10 text-secondary"
                    style={native.style}
                    dir={native.dir}
                  >
                    {activeLanguage.nativeName}
                  </FloatingTag>
                )}
              </div>
              <p className="text-muted-foreground text-lg font-semibold">
                Ready to speak some <span className="text-primary">{activeLanguage?.name ?? "..."}</span>?
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => startTour({ steps: TOUR_STEPS })}
              title="Take the product tour"
              aria-label="Take the product tour"
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white border border-card-border text-muted-foreground hover:text-foreground shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <Link
              href="/account"
              title="Account & settings"
              aria-label="Account & settings"
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center bg-white border border-card-border text-muted-foreground hover:text-foreground shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all lg:hidden"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </motion.div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <LanguagePicker />
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-2xl border border-card-border bg-white px-4 h-12 shadow-[0_4px_0_rgba(0,0,0,0.08)] text-sm font-bold text-foreground transition-all hover:border-primary/40 active:translate-y-1 active:shadow-none"
            title="Chat with Bolo the parrot"
          >
            <MessageCircle className="w-4 h-4 text-primary" />
            <span>Chat with Bolo</span>
          </Link>
        </div>

        {/* Stats Banner — vibrant, front-and-center progress */}
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.smooth, delay: 0.1 }}
            className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[hsl(220,70%,52%)] to-secondary p-5 text-white shadow-[0_14px_34px_-12px_hsl(243_62%_45%_/_0.6)] lg:p-7"
          >
            {/* soft decorative blobs */}
            <div className="pointer-events-none absolute -top-10 -right-8 h-36 w-36 rounded-full bg-white/15 blur-xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-white/10 blur-xl" />

            <div className="relative flex items-stretch">
              <StatCell
                icon={
                  <motion.div
                    animate={reduceMotion ? {} : { scale: [1, 1.15, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Flame className="w-6 h-6" fill="currentColor" />
                  </motion.div>
                }
                value={summary.currentStreakDays}
                label="Day Streak"
                delay={0.16}
              />
              <div className="w-px self-stretch bg-white/25" />
              {/* Spec D2: speaking streak — days with a nailed/close attempt.
                  Mic icon so it reads as distinct from the general streak. */}
              <StatCell
                icon={<Mic className="w-6 h-6" />}
                value={summary.speakingStreakDays ?? 0}
                label="Speaking Streak"
                delay={0.2}
              />
              <div className="w-px self-stretch bg-white/25" />
              <StatCell icon={<Star className="w-6 h-6" fill="currentColor" />} value={summary.xp} label="Total XP" delay={0.24} />
              <div className="w-px self-stretch bg-white/25" />
              <StatCell icon={<Trophy className="w-6 h-6" fill="currentColor" />} value={summary.phrasesMastered} label="Mastered" delay={0.32} />
            </div>
          </motion.div>
        )}
      </header>

      <main className="mx-auto mt-8 w-full max-w-6xl px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left / main column — the learning surface */}
          {/* min-w-0: without it the grid track honors the ticket's intrinsic
              min-content (the nowrap "Next stop: …" line + train + stub sum
              past the viewport) and the whole page scrolls horizontally on
              phones — truncate can only clip once the track is allowed to
              shrink below min-content. Same on the aside below. */}
          <div className="min-w-0 space-y-8 lg:col-span-2">
            {/* P1 v2 item 2: the journey IS the home hero — a full-width
                boarding pass in the line's accent, visually continuous with
                the /journey ticket-stub header. Carries live state (next stop,
                Stop N of M, progress at the stop) when the zone queries have
                it, and degrades to the generic line blurb when loading,
                locked, or errored. The topic grid below is demoted to
                "Browse by topic" and is otherwise untouched. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.gentle, delay: 0.05 }}
            >
              <Link
                href="/journey"
                onClick={() =>
                  track(ANALYTICS_EVENTS.JOURNEY_ENTERED_VIA_HERO, { language: activeLang })
                }
                className="group relative block w-full overflow-hidden rounded-3xl text-white shadow-[0_8px_0_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_rgba(0,0,0,0.18)]"
                style={{ backgroundColor: journeyLine.accent }}
              >
                {/* full-ticket treatment: diagonal brand-stripe ticket stock */}
                <TicketStripes ink="rgba(255,255,255,0.05)" />
                <div
                  className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl"
                  aria-hidden
                />
                <div className="relative flex items-stretch">
                  {/* main body */}
                  <div className="min-w-0 flex-1">
                    <div className="p-5 pr-3 lg:p-6 lg:pr-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-widest text-white/80">
                            Boarding pass · બોલો રેલ
                          </div>
                          <h2 className="mt-0.5 text-lg font-black leading-tight lg:text-2xl">
                            Ride the {journeyLine.lineName}
                          </h2>
                          <p className="mt-1 truncate text-sm font-semibold text-white/90">
                            {journey.current
                              ? `Next stop: ${journey.current.geoName} · Stop ${journey.current.stopNumber} of ${journey.current.stopCount}`
                              : `${journeyLine.zones[0]} to ${journeyLine.zones[5]}, station by station`}
                          </p>
                        </div>
                        <TrainEngine className="mt-1 h-10 w-auto shrink-0 text-white drop-shadow-sm lg:h-14" />
                      </div>
                      {journey.current && journey.current.phraseCount > 0 && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                            <div
                              className="h-full rounded-full bg-white transition-all duration-700"
                              style={{
                                width: `${Math.round(
                                  (journey.current.masteredCount / journey.current.phraseCount) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] font-bold text-white/90">
                            {journey.current.masteredCount}/{journey.current.phraseCount} at this stop
                          </span>
                        </div>
                      )}
                    </div>
                    {/* ticket perforation (dashed line + edge notch, retained) */}
                    <div className="relative" aria-hidden>
                      <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />
                      <div className="mx-5 border-t-2 border-dashed border-white/40" />
                    </div>
                    {/* action verb + daily-goal/streak co-located */}
                    <div className="flex items-center justify-between gap-2 p-5 pt-3.5 pr-3 lg:px-6 lg:pr-4">
                      <span className="flex items-center gap-1.5 text-sm font-black lg:text-base lg:gap-2">
                        {journey.current?.started || journey.doneCount > 0
                          ? "Continue your journey"
                          : "Begin your journey"}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 lg:h-5 lg:w-5" />
                      </span>
                      {summary && (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-black lg:px-2.5 lg:text-xs">
                            <Flame className="h-3.5 w-3.5" fill="currentColor" />
                            {summary.currentStreakDays}-day
                            <span className="hidden lg:inline"> streak</span>
                          </span>
                          <span className="hidden items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-black sm:flex lg:px-2.5 lg:text-xs">
                            <Target className="h-3.5 w-3.5" />
                            {Math.min(summary.attemptsToday, dailyGoal)}/{dailyGoal} today
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* tear-off stub: perforation with notches, punched hole,
                      fare-zone stamp, vertical line name */}
                  <TicketPerforationV light />
                  <div className="relative flex w-16 shrink-0 flex-col items-center justify-between py-4">
                    <PunchHole />
                    {journey.current && (
                      <div className="-mx-4">
                        <ZoneStamp
                          ink="rgba(255,255,255,0.8)"
                          zone={journey.current.zoneIndex + 1}
                          name={journey.current.geoName}
                        />
                      </div>
                    )}
                    <div
                      className="select-none text-[9px] font-black uppercase tracking-[0.2em] text-white/70"
                      style={{ writingMode: "vertical-rl" }}
                      aria-hidden
                    >
                      {journeyLine.lineName}
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* Categories Grid */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-accent" />
                <h2 className="text-xl font-black text-foreground tracking-tight">Browse by topic</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
                      transition={{ ...springs.gentle, delay: 0.1 + i * 0.05 }}
                    >
                      <Link href={`/learn/${cat.id}`} className="block h-full">
                        <div
                          className="group relative flex h-full flex-col overflow-hidden rounded-3xl border-2 bg-white p-4 shadow-[0_6px_0_var(--tile)] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_var(--tile)]"
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
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.4 }}>
                <Link
                  href={`/practice/${(categories.find(c => c.masteredCount < c.phraseCount) ?? categories[0]).id}?skipMastered=true`}
                  className="flex w-full items-center justify-between rounded-2xl bg-primary px-6 py-5 text-lg font-black text-primary-foreground shadow-[0_8px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))]"
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
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.42 }}>
                {capReached ? (
                  <UpgradeCard
                    icon={<Zap className="h-6 w-6" fill="currentColor" />}
                    title="You've hit today's free lessons"
                    description={`You've used all ${dailyLimit} of today's new lessons. Come back tomorrow, or go unlimited with All-Access.`}
                    cta="Go unlimited"
                    href={upgradeHref({ plan: "plus", reason: "daily_lesson_limit" })}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-white p-4 shadow-sm">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Zap className="h-5 w-5" fill="currentColor" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {dailyRemaining} of {dailyLimit} free lessons left today
                    </p>
                    <Link href={upgradeHref({ plan: "plus" })} className="ml-auto text-sm font-black text-primary shrink-0">
                      Go unlimited
                    </Link>
                  </div>
                )}
              </motion.div>
            )}

            {/* Recent Activity lives in the main column on desktop only; on mobile
                it moves to the end of the single stack below. */}
            <div className="hidden lg:block">{recentSection}</div>
          </div>

          {/* Right rail — accomplishments & next actions */}
          <aside className="min-w-0 space-y-6 lg:col-span-1">
            {latestBadgeSection}
            {reviewSection}
            {/* Recent plays shows here on mobile (in the flow), hidden on desktop
                where it sits in the main column instead. */}
            <div className="lg:hidden">{recentSection}</div>
          </aside>
        </div>
      </main>
      {/* Daily goal celebration — mirrors the MilestoneToast on mobile home */}
      <MilestoneToast message="Daily goal hit! 🎉" toastKey={goalToastKey} />
    </div>
  );
}

function StatCell({ icon, value, label, delay = 0 }: { icon: React.ReactNode; value: number; label: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 320, damping: 18 }}
      className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center"
    >
      <motion.div
        className="text-white"
        initial={{ rotate: -12, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: delay + 0.05, type: "spring", stiffness: 260, damping: 12 }}
      >
        {icon}
      </motion.div>
      <div className="text-2xl font-black leading-none lg:text-3xl">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-white">{label}</div>
    </motion.div>
  );
}
