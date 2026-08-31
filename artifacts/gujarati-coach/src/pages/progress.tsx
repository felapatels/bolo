import { useState } from "react";
import {
  useGetProgressSummary,
  useListRecentAttempts,
  useListBadges,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import {
  Award,
  BarChart2,
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Share2,
  Star,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { format } from "date-fns";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { useEntitlements, upgradeHref } from "@/lib/entitlements";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { bandFromScore, bandTextClass } from "@/components/ui/band-pill";
import { BadgesGallery } from "@/components/badges-gallery";
import { NextBadgeSpotlight } from "@/components/next-badge-spotlight";
import { AdvancedAnalytics } from "@/components/advanced-analytics";
import { AllAccessCard } from "@/components/plus";
import { JourneyProgressCard } from "@/components/progress/journey-progress-card";
import { SpeechBubble } from "@/components/speech-bubble";
import { LanguagePicker } from "@/components/language-picker";
import { CountUpNumber } from "@/components/count-up-number";
import { findNearestLockedBadge } from "@/lib/badge-progress";
import {
  copyProgressMessage,
  progressShareMessage,
  shareProgress,
} from "@/lib/progress-share";
import { getJourneyLine } from "@/lib/journeyLines";
import { useJourneyProgress } from "@/lib/useJourneyProgress";

/**
 * THE PROGRESS PAGE, REBUILT TO THE OWNER'S MOCKUP (build 23 on web; mobile
 * build 22, 2026-08-29: "update the progress page. I want it to be a close
 * match to this example"). Top to bottom, the same run as the phone:
 *
 *   1. "Your progress" with the language under it as a door to the picker,
 *      and Bolo with a speech bubble that names the next milestone ("Nice
 *      work, Alex! You're 6 away from Phrase Master.").
 *   2. The next milestone as a ticket (NextBadgeSpotlight).
 *   3. Four stats in ONE row: Mastered, Practices, Best score, Day streak.
 *      They were a 2 by 2 grid of cards titled "Mastered", "Practices",
 *      "Best Attempt" and "Day Streak"; the mockup's row is the pin now, and
 *      the best score is the number, as on the phone.
 *   4. The journey card: line, city, zone bars, "View all stops".
 *   5. The All-Access card for free learners; the analytics for Plus. The
 *      phone has a separate analytics screen and draws a door to it; web has
 *      no such page, so the analytics stay inline where they always were.
 *   6. Overall mastery, the badges, and the practice history.
 *
 * WHERE WEB KEEPS ITS OWN SHAPE. The badges gallery stays inline (the phone
 * has a Badges door to its own screen; web has no /badges route), and on a
 * wide screen the practice history takes its own column beside everything
 * else, as it did before. A history row keeps its date and the coach's
 * feedback line, which the phone's row drops: a desktop list without dates
 * reads as a timeline with no time.
 *
 * Mobile twin: bolo-mobile/app/(app)/(tabs)/progress.tsx.
 */
export default function Progress() {
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const { isPlus } = useEntitlements();
  const { user } = useUser();
  const firstName = user?.firstName ?? "friend";
  const reduceMotion = useReducedMotion();

  const { data: summary, isLoading: loadingSummary } = useGetProgressSummary({ lang: activeLang });
  const { data: attempts, isLoading: loadingAttempts } = useListRecentAttempts({ lang: activeLang, limit: 30 });
  const { data: badges } = useListBadges({ lang: activeLang });
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);

  // SHARING THE STATS, NOT A BADGE (owner's ruling, build 26, option A): a
  // stat line is postable on any day, a badge only on the rare day you earn
  // one. The share sheet where the browser has one, the clipboard and a beat
  // of "Copied" on the button everywhere else, exactly as the bazaar's Flex
  // share does it. THE HOOK SITS ABOVE THE LOADING RETURNS on purpose.
  const [shared, setShared] = useState<"copied" | null>(null);
  const onShareProgress = async () => {
    const message = progressShareMessage({
      languageName: activeLanguage?.name,
      phrasesMastered: summary?.phrasesMastered ?? 0,
      streakDays: summary?.currentStreakDays ?? 0,
    });
    await shareProgress(message, async () => {
      if (await copyProgressMessage(message)) {
        setShared("copied");
        window.setTimeout(() => setShared(null), 1800);
      }
    });
  };

  if (loadingSummary || loadingAttempts) {
    return (
      <div className="flex min-h-screen items-center justify-center text-secondary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  const masteryPct =
    summary.totalPhrases > 0
      ? Math.round((summary.phrasesMastered / summary.totalPhrases) * 100)
      : 0;

  // Bolo celebrates real momentum, otherwise cheers the learner on.
  const mascotPose =
    summary.phrasesMastered > 0 || summary.currentStreakDays > 1 ? "cheer" : "thumbsup";

  // WHAT BOLO SAYS: the next milestone by name, with how far off it is, in
  // the same terms the ticket below counts in. No badges known yet, or every
  // one earned, and the bird still has a line.
  const nearest = findNearestLockedBadge(badges);
  const remaining = nearest ? Math.max(nearest.progressTarget - nearest.progressCurrent, 0) : 0;
  const totalBadges = badges?.length ?? 0;

  // The entrance, in the phone's order and at its offsets.
  const enter = (delayMs: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: -8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay: delayMs / 1000 },
        };

  return (
    <div className="min-h-[100dvh] pb-nav lg:pb-12 bg-background animate-content-enter">
      <main className="mx-auto w-full max-w-6xl px-5 pt-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
          <div className="space-y-6 lg:col-span-2">
            <motion.header {...enter(0)} className="flex items-start gap-2" data-testid="progress-head">
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-extrabold text-foreground">Your progress</h1>
                {/* The language line is the door to the picker (the mockup:
                    "Hindi" with a chevron under the title), and the share
                    action sits beside it (build 26, the owner's option A).
                    Both carry a word as well as a glyph. */}
                <div className="flex flex-wrap items-center gap-3">
                  <LanguagePicker
                    trigger={
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center gap-1 text-[15px] font-semibold text-primary hover:opacity-80"
                        aria-label={`Language: ${activeLanguage?.name ?? "loading"}`}
                        data-testid="progress-language"
                      >
                        {activeLanguage?.name ?? "Loading..."}
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    }
                  />
                  <button
                    type="button"
                    onClick={onShareProgress}
                    className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-80"
                    aria-label="Share your progress"
                    data-testid="progress-share"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {shared === "copied" ? "Copied!" : "Share"}
                  </button>
                </div>
                <SpeechBubble className="mr-1 mt-3.5" testId="progress-bubble">
                  {nearest ? (
                    <>
                      {`Nice work, ${firstName}! You're ${remaining} away from `}
                      <span className="text-primary">{nearest.title}</span>
                      {"."}
                    </>
                  ) : totalBadges > 0 ? (
                    `Every badge is yours, ${firstName}!`
                  ) : (
                    `Ready when you are, ${firstName}!`
                  )}
                </SpeechBubble>
              </div>
              <Mascot pose={mascotPose} size={96} idle="float" />
            </motion.header>

            <NextBadgeSpotlight lang={activeLang} />

            {/* ONE ROW OF FOUR (the mockup). Each cell is a column: a tinted
                icon disc, the number, the label, with a hairline between
                cells. */}
            <motion.section
              {...enter(120)}
              className="flex items-stretch rounded-[18px] border border-card-border bg-card px-1 py-3.5 shadow-sm"
              data-testid="progress-stat-row"
            >
              <Stat icon={<Award className="h-[18px] w-[18px]" />} tint="text-success" disc="bg-success/[0.12]" value={summary.phrasesMastered} label="Mastered" />
              <Divider />
              <Stat icon={<Mic className="h-[18px] w-[18px]" />} tint="text-primary" disc="bg-primary/[0.12]" value={summary.totalAttempts} label="Practices" />
              <Divider />
              <Stat icon={<Star className="h-[18px] w-[18px]" />} tint="text-[#F59E0B]" disc="bg-[#F59E0B]/[0.12]" value={summary.bestScore} label="Best score" />
              <Divider />
              <Stat icon={<Zap className="h-[18px] w-[18px]" />} tint="text-accent" disc="bg-accent/[0.12]" value={summary.currentStreakDays} label="Day streak" />
            </motion.section>

            <motion.div {...enter(200)}>
              <JourneyProgressCard lineName={line.lineName} fallbackCity={line.zones[0]} journey={journey} />
            </motion.div>

            {/* Advanced analytics: live for Plus learners, one warm All-Access
                card (routing to the paywall) for everyone else. */}
            <motion.div {...enter(260)}>
              {isPlus ? (
                <section className="space-y-3">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary/[0.12] text-primary">
                      <BarChart2 className="h-[22px] w-[22px]" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-foreground">Advanced analytics</p>
                      <p className="text-[13px] text-muted-foreground">Mastery by topic and your recent activity</p>
                    </div>
                  </div>
                  <AdvancedAnalytics lang={activeLang} />
                </section>
              ) : (
                <AllAccessCard href={upgradeHref({ plan: "plus" })} />
              )}
            </motion.div>

            {/* Overall mastery */}
            <motion.section
              {...enter(300)}
              className="rounded-[14px] border border-card-border bg-card p-[18px] shadow-sm"
              data-testid="progress-mastery"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-base font-bold text-foreground">Overall mastery</p>
                <p className="text-xl font-extrabold text-primary">{masteryPct}%</p>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={masteryPct}
                aria-label="Overall mastery"
              >
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${masteryPct}%` }}
                  transition={{ duration: 0.7, delay: 0.32 }}
                />
              </div>
              <p className="mt-2.5 text-[13px] text-muted-foreground">
                {summary.phrasesMastered} of {summary.totalPhrases} phrases
              </p>
            </motion.section>

            <motion.div {...enter(340)}>
              <BadgesGallery lang={activeLang} />
            </motion.div>
          </div>

          {/* Practice history: a dedicated column on desktop. */}
          <section className="lg:col-span-1">
            <h2 className="mb-3 text-xl font-bold text-foreground">Practice history</h2>

            {attempts && attempts.length > 0 ? (
              <div className="space-y-2.5">
                {attempts.map((attempt, i) => {
                  const canRetake = attempt.categoryId != null && attempt.phraseId != null;
                  const band = attempt.band ?? bandFromScore(attempt.score);
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-bold text-foreground" style={native.style} dir={native.dir}>
                          {attempt.nativeScript}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{attempt.english}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {format(new Date(attempt.createdAt), "MMM d, h:mm a")}
                        </p>
                        {attempt.feedback ? (
                          <p className="mt-1 truncate text-xs text-foreground/80">"{attempt.feedback}"</p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "min-w-[44px] rounded-[10px] bg-muted px-2.5 py-1.5 text-center text-base font-extrabold tabular-nums",
                          bandTextClass(band),
                        )}
                      >
                        {attempt.score}
                      </span>
                      {canRetake ? <RotateCcw className="ml-1.5 h-[17px] w-[17px] text-muted-foreground" /> : null}
                    </>
                  );
                  const rowClass =
                    "flex items-center gap-3 rounded-xl border border-card-border bg-card p-3.5 shadow-sm";
                  return (
                    <motion.div key={attempt.id} {...enter(Math.min(i, 8) * 45)}>
                      {canRetake ? (
                        // The whole row is the Retake door, as on the phone.
                        <Link
                          href={`/practice/${attempt.categoryId}?phrase=${attempt.phraseId}`}
                          onClick={blessAudioPlayback}
                          aria-label={`Retake ${attempt.english ?? "phrase"}`}
                          className={cn(rowClass, "transition-colors hover:border-primary/40")}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className={rowClass}>{inner}</div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-8 text-center">
                <MicOff className="h-8 w-8 text-muted-foreground" />
                <p className="max-w-[240px] text-sm leading-5 text-muted-foreground">
                  No practice yet. Record your first phrase to see it here.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 w-px bg-card-border" />;
}

function Stat({
  icon,
  tint,
  disc,
  value,
  label,
}: {
  icon: React.ReactNode;
  tint: string;
  disc: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 px-0.5 text-center">
      <div className={cn("flex h-[38px] w-[38px] items-center justify-center rounded-xl", disc, tint)}>{icon}</div>
      <div className="text-[22px] font-extrabold text-foreground">
        <CountUpNumber value={value} />
      </div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
