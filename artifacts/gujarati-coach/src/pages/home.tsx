import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ChaiWalletSheet } from "@/components/chai-wallet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChaiPurchaseReturn } from "@/components/chai-packs";
import { ChaiGlyph, ChaiStallVignette } from "@/components/chai-stall";
import { Link, useLocation } from "wouter";
import { useGetProgressSummary, getGetProgressSummaryQueryKey, useGetAccount, useListCategories, getListCategoriesQueryKey, useListRecentAttempts, useListReviewPhrases, getListReviewPhrasesQueryKey, useListBadges, useGetTokens, useGetStreakRepair, useRepairStreak, getGetStreakRepairQueryKey, getGetTokensQueryKey } from "@workspace/api-client-react";
import type { StreakRepairOffer } from "@workspace/api-client-react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { MilestoneToast } from "@/components/ui/milestone-toast";
import { webHaptic } from "@/lib/haptics";
import { repairErrorMessage } from "@/lib/chai-errors";
import { preloadTearAudio, playTearSfx } from "@/lib/tearAudio";
import { loadSoundPref } from "@/lib/soundPref";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { LanguagePicker } from "@/components/language-picker";
import { NamePromptCard } from "@/components/name-prompt-card";
import { AddToHomeScreen } from "@/components/add-to-home-screen";
import { HomeSocialStrip } from "@/components/home-social-strip";
import { UpgradeCard } from "@/components/plus";
import { Mascot } from "@/components/mascot";
import { HomeSkeleton } from "@/components/home-skeleton";
import { BrandSplash, useBrandSplash } from "@/components/brand-splash";
import { useIsDesktop } from "@/hooks/use-mobile";
import { getBadgeIcon } from "@/lib/badge-icons";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { getJourneyLine } from "@/lib/journeyLines";
import { useJourneyProgress } from "@/lib/useJourneyProgress";
import { TrainEngine } from "@/components/train-svg";
import { BandPill, normalizeBand } from "@/components/ui/band-pill";
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  fitStubWordmark,
  stampSizeForExtent,
} from "@/components/ticket";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";
import { useEntitlements, upgradeHref, upgradeHrefForDenial, asUpgradeRequired } from "@/lib/entitlements";
import { motion, useReducedMotion } from "framer-motion";
import { springs, FloatingTag } from "@/lib/motion";
import { format } from "date-fns";
import { cn, cssTimeMs } from "@/lib/utils";
import { useUser } from "@clerk/react";

// Boarding-pass press feedback tuning. The CSS idle-motion constants (breathe,
// shimmer, glow, arrow, train) live in index.css under "Boarding pass and
// journey CTA idle motion"; these two cover the framer press spring only.
// Low damping is what produces the overshoot spring-back on release.
import { BookOpen, Trophy, Flame, Star, ArrowRight, Settings, Target, Zap, MessageCircle, ChevronRight, HelpCircle } from "lucide-react";
const PASS_PRESS_SCALE = 0.94;
const PASS_PRESS_SPRING = { type: "spring", stiffness: 480, damping: 12 } as const;

// R1 amendment: the stub column's fixed width (w-16) and the stamp that fits
// it. The stamp's ROTATED extent (not its nominal square) must clear the
// column with a 4px margin per side, so label + circle scale as one unit to
// the stub (mobile JourneyPassCard parity).
const STUB_W = 64;
const HOME_STAMP_SIZE = stampSizeForExtent(STUB_W - 8);

/** Vertical line-name wordmark, sized to its measured vertical run so it can
 *  never ellipsize (R1 amendment; fixed 9px + 0.2em used to overflow the run
 *  for long line names). Before the first measurement (and in jsdom, where
 *  clientHeight is 0) it renders the full name at top size; the observer
 *  corrects it in real browsers. */
function StubWordmark({ lineName }: { lineName: string }) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [extent, setExtent] = useState(0);
  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const measure = () => setExtent(el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { text, fontSize } = fitStubWordmark(lineName, extent);
  return (
    <div
      ref={slotRef}
      className="flex min-h-0 w-full flex-1 items-center justify-center"
      aria-hidden
    >
      <div
        data-testid="stub-line-name"
        className="select-none font-black uppercase text-white/70"
        style={{
          writingMode: "vertical-rl",
          fontSize,
          lineHeight: 1.2,
          letterSpacing: fontSize >= 7 ? "0.15em" : "0.08em",
        }}
      >
        {text}
      </div>
    </div>
  );
}
// Stub-tear navigation fallback. The authoritative delay lives in index.css
// as --tear-nav-delay (the :root tuning constants block, in ms); this value
// is only used when the CSS var cannot be read (jsdom, ancient UA).
const TEAR_NAV_DELAY_FALLBACK_MS = 500;
// Task #905: overlay cleanup deadline fallback, mirroring
// --tear-overlay-cleanup in the same :root block. Measured from the
// hand-off at navigation; must stay longer than --gust-stagger +
// --gust-duration so the animationend path normally wins the race.
const TEAR_OVERLAY_CLEANUP_FALLBACK_MS = 900;

// Task #905: the tear's final beat used to be cut when navigation at
// --tear-nav-delay unmounted home mid-animation. In the same beat as
// navigate(), the two torn halves now HAND OFF to a fixed-position overlay
// appended to document.body: each half is cloned in place with a negative
// animation-delay so its tear keyframes resume exactly where the in-tree
// copy stopped, then a gust (transform/opacity-only wrapper animation)
// sweeps each piece away over the incoming journey route — the stub first,
// the ticket body a --gust-stagger later, each continuing its own tear
// trajectory (never morphing toward the journey header ticket). The overlay
// is deliberately NOT React-owned (a portal would unmount with home), is
// inert (pointer-events none, aria-hidden), and removes itself when the
// final gust ends — with a timeout fallback (--tear-overlay-cleanup) for
// environments where animation events never fire (backgrounded tab, jsdom).
// Any failure here is swallowed by the caller: navigation always proceeds.
function spawnTearHandoffOverlay(body: HTMLElement, stub: HTMLElement): void {
  // Read the cleanup deadline BEFORE touching the DOM so a failing style
  // read can never leave an orphaned node behind. Unit-aware (cssTimeMs):
  // the production minifier rewrites "900ms" as ".9s", which a bare
  // parseFloat would read as 0.9 milliseconds.
  const cleanupMs = cssTimeMs(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--tear-overlay-cleanup",
    ),
    TEAR_OVERLAY_CLEANUP_FALLBACK_MS,
  );
  const container = document.createElement("div");
  container.setAttribute("data-tear-overlay", "");
  container.setAttribute("aria-hidden", "true");
  Object.assign(container.style, {
    position: "fixed",
    inset: "0",
    zIndex: "60",
    pointerEvents: "none",
  });
  // Layout-true (untransformed) placement: offsets against the half's
  // offsetParent (the flex row, which never carries a tear transform), so
  // each clone lands exactly on its in-tree half's base box no matter where
  // the tear animation currently has it. The breathe wrapper is paused
  // while tearing (see the JSX) so no ancestor scale skews this. jsdom has
  // no offsetParent/offsets; everything degrades to 0-rects there, which
  // the lifecycle tests accept.
  const place = (el: HTMLElement, wrapper: HTMLElement) => {
    const parentRect =
      el.offsetParent instanceof HTMLElement
        ? el.offsetParent.getBoundingClientRect()
        : { top: 0, left: 0 };
    Object.assign(wrapper.style, {
      position: "absolute",
      top: `${parentRect.top + el.offsetTop}px`,
      left: `${parentRect.left + el.offsetLeft}px`,
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`,
    });
  };
  const mkHalf = (el: HTMLElement, dir: 1 | -1, gustFinal: boolean) => {
    const wrapper = document.createElement("div");
    wrapper.className = "animate-gust-away";
    place(el, wrapper);
    // Per-half gust direction: each piece drifts along its own tear
    // trajectory (stub right, body left). Values resolve against the :root
    // tuning constants at computed-value time.
    wrapper.style.setProperty(
      "--gust-x",
      dir === 1 ? "var(--gust-drift)" : "calc(-1 * var(--gust-drift))",
    );
    wrapper.style.setProperty(
      "--gust-r",
      dir === 1 ? "var(--gust-rotate)" : "calc(-1 * var(--gust-rotate))",
    );
    wrapper.style.animationDelay = dir === 1 ? "0ms" : "var(--gust-stagger)";
    if (gustFinal) wrapper.setAttribute("data-gust-final", "");
    const clone = el.cloneNode(true) as HTMLElement;
    // Resume the tear keyframes exactly where the in-tree half stopped
    // (the inline delay outranks the class shorthand's implicit 0s).
    clone.style.animationDelay = "calc(-1 * var(--tear-nav-delay))";
    clone.style.margin = "0";
    wrapper.appendChild(clone);
    container.appendChild(wrapper);
  };
  mkHalf(stub, 1, false);
  // The body half gusts last (--gust-stagger), so its gust end is the
  // overlay's removal signal.
  mkHalf(body, -1, true);
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(timer);
    container.remove();
  };
  const timer = window.setTimeout(remove, cleanupMs);
  container.addEventListener("animationend", (e) => {
    // The clones' own tear-keyframe ends bubble through here first; only
    // the FINAL wrapper's gust end may remove the overlay.
    if ((e as AnimationEvent).animationName !== "gust-away") return;
    if (!(e.target instanceof Element) || !e.target.hasAttribute("data-gust-final"))
      return;
    remove();
  });
  document.body.appendChild(container);
}

/** Day-of-week name for a YYYY-MM-DD string (noon anchor avoids DST shifts). */
function missedDayLabel(day: string | null | undefined): string {
  if (!day) return "That day";
  return new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
  });
}

/**
 * Streak-repair popup, anchored on the DAY STREAK cell (Task #1081).
 *
 * This used to be an inline card wedged between the stats banner and the main
 * grid: a 25 Chai spend surface floating with nothing to tie it to the number
 * it was talking about. It is now a bottom sheet that opens only when the
 * learner taps DAY STREAK, so the promise and the figure it mends are the same
 * object. Built on ChaiWalletSheet's shape (components/chai-wallet.tsx) — the
 * house pattern for a Chai spend surface, and one mobile can twin with an RN
 * Modal. Deliberately NOT a popover: mobile has no equivalent and the two
 * platforms would fork.
 *
 * It never opens by itself, it is dismissible without repairing, and when
 * there is no repairable break the cell it hangs off does not open it at all
 * (see the DAY STREAK cell below) — a permanent "mend your streak" is a daily
 * reproach.
 */
function StreakRepairSheet({
  open,
  onOpenChange,
  offer,
  balance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: StreakRepairOffer | undefined;
  balance?: number;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const repairMutation = useRepairStreak({
    mutation: {
      onSuccess: (result) => {
        setNotice(
          `${missedDayLabel(result.repairedDay)} is covered. Your ${result.restoredStreakDays}-day streak rides on.`,
        );
      },
      onError: (error: unknown) => {
        // The server says WHY it refused (empty pockets, window gone, break
        // too long); say that, rather than sending the learner to the wallet
        // to meet the same refusal a second time.
        setNotice(repairErrorMessage(error));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetStreakRepairQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/progress/summary"] });
      },
    },
  });

  // The notice replaces the offer row while it is up, so it has to expire:
  // a refusal the learner can still act on (empty pockets today, full pockets
  // tomorrow) must hand the Mend button back. Mobile does the same, 4s.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // A fresh open starts from the offer, never from the last visit's notice.
  useEffect(() => {
    if (!open) setNotice(null);
  }, [open]);

  if (!offer?.eligible || !offer.missedDay) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-3xl"
        data-testid="home-streak-repair-offer"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            Mend your streak
          </SheetTitle>
          {/* The number here is the POST-REPAIR streak — what the learner
              walks away with, not what they have now — and the copy says so.
              It comes from the same server computation the banner climbs
              (lib/streakDays.ts), so the figure sold and the figure shown
              cannot drift. */}
          <SheetDescription className="text-foreground">
            {notice ?? (
              <>
                <span className="font-bold">{missedDayLabel(offer.missedDay)}</span>{" "}
                got away from you. Cover it and your {offer.restoresStreakDays}-day
                streak rides on.
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {!notice && (
          <div className="mt-5 flex items-center justify-between gap-3">
            {/* The balance is context, not a second action: this is the only
                Chai sink that fires from outside the wallet, so what the
                learner holds has to be visible next to what the tap costs.
                Same glyph + number + unit treatment as the stall band and the
                wallet balance band. Omitted ENTIRELY when the balance is
                unknown — a "-" or a 0 sitting beside a real spend button
                would be a wrong number, not a placeholder. */}
            {balance !== undefined ? (
              <span
                data-testid="home-repair-balance"
                className="flex shrink-0 items-center gap-1.5 leading-none text-muted-foreground"
              >
                <ChaiGlyph className="h-4 w-4" />
                <span className="text-sm font-bold">{balance}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Chai
                </span>
              </span>
            ) : (
              <span />
            )}
            <button
              data-testid="home-repair-streak"
              disabled={repairMutation.isPending}
              onClick={() => repairMutation.mutate()}
              className="shrink-0 rounded-lg bg-amber-600 px-3.5 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-amber-500"
            >
              Mend · {offer.cost}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Home() {
  const { user } = useUser();
  const firstName = user?.firstName;
  const { activeLang, activeLanguage } = useLanguage();
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  // Wallet polish item 4: Chai lives in the stats row as a fifth cell that
  // opens the wallet sheet (the 5B corner chip is gone). Loading renders a
  // dash, never a spinner (5B ruling).
  const tokensQuery = useGetTokens();
  const [walletOpen, setWalletOpen] = useState(false);
  // The streak-repair offer is read HERE, not inside the popup, because the
  // DAY STREAK cell has to know whether there is anything to open before it is
  // tapped: with a repairable break it opens the popup, without one it keeps
  // taking the learner to /progress exactly as it always has (Task #1081).
  const streakRepairOffer = useGetStreakRepair().data;
  const streakRepairable = Boolean(
    streakRepairOffer?.eligible && streakRepairOffer.missedDay,
  );
  const [streakRepairOpen, setStreakRepairOpen] = useState(false);
  // Boarding-pass stub tear (home pass only). `tearing` toggles the CSS
  // classes; the timer ref lets unmount cancel a pending delayed navigation.
  const [tearing, setTearing] = useState(false);
  const tearTimerRef = useRef<number | null>(null);
  // The in-tree torn halves; measured + cloned into the body-level hand-off
  // overlay at the navigation moment (Task #905).
  const tearStubRef = useRef<HTMLDivElement | null>(null);
  const tearBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => () => {
      if (tearTimerRef.current !== null) window.clearTimeout(tearTimerRef.current);
    },
    [],
  );
  // Pre-warm the AudioContext for the tear SFX so the first play has zero lag.
  useEffect(() => { preloadTearAudio(); }, []);
  // Pass activation: analytics, then the stub tear, then the journey.
  // Navigation is NEVER blocked: reduced motion returns early so the Link
  // navigates natively and instantly, and any animation-path failure falls
  // through to an immediate navigate(). Keyboard Enter fires the anchor's
  // click event, so it plays the same tear as pointer activation.
  const handlePassActivate = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Chunk 1 item 4a: unlock programmatic audio inside this entry gesture so
    // the first coach phrase can autoplay once the learner reaches practice.
    blessAudioPlayback();
    track(ANALYTICS_EVENTS.JOURNEY_ENTERED_VIA_HERO, { language: activeLang });
    if (reduceMotion || tearing) return; // instant native Link navigation
    try {
      e.preventDefault();
      // Haptic + SFX fire immediately -- both are fire-and-forget and never
      // delay the animation or navigation regardless of browser support.
      webHaptic("light");
      if (loadSoundPref()) { playTearSfx(); }
      setTearing(true);
      // Unit-aware read (cssTimeMs): the production minifier rewrites
      // "500ms" as ".5s"; a bare parseFloat made the tear beat 0.5ms in prod.
      const delay = cssTimeMs(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--tear-nav-delay",
        ),
        TEAR_NAV_DELAY_FALLBACK_MS,
      );
      tearTimerRef.current = window.setTimeout(() => {
        // Hand-off (Task #905): clone the mid-tear halves into the
        // body-level overlay in the same beat as navigation, so React's
        // unmount swaps the pixels seamlessly and the tear + gust finish
        // over the journey. Overlay failure is cosmetic and must never
        // block or delay the navigation below.
        try {
          const bodyHalf = tearBodyRef.current;
          const stubHalf = tearStubRef.current;
          if (bodyHalf && stubHalf) spawnTearHandoffOverlay(bodyHalf, stubHalf);
        } catch {
          /* tear tail lost; navigation proceeds */
        }
        navigate("/journey");
      }, delay);
    } catch {
      navigate("/journey");
    }
  };
  const native = useNativeText();
  const journeyLine = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, journeyLine.zones);
  // Progress-aware boarding-pass CTA. Uses only the data the pass already
  // receives from useJourneyProgress (no new API calls); when the current
  // stop is unknown (loading, locked, errored) the copy falls back to the
  // pre-existing generic verbs.
  const hasJourneyProgress = Boolean(journey.current?.started) || journey.doneCount > 0;
  const phrasesLeftAtStop = journey.current
    ? Math.max(journey.current.phraseCount - journey.current.masteredCount, 0)
    : 0;
  const journeyCta = !hasJourneyProgress
    ? "Start your journey"
    : journey.current
      ? `Resume at Stop ${journey.current.stopNumber}${
          phrasesLeftAtStop > 0
            ? ` · ${phrasesLeftAtStop} ${phrasesLeftAtStop === 1 ? "phrase" : "phrases"} to go`
            : ""
        }`
      : journey.planBlocked
        ? "Unlock your next stop with All-Access"
        : "Continue your journey";
  const { isPlus, features, dailyNewLessons } = useEntitlements();
  // placeholderData: keepPreviousData — when LanguageProvider reconciles the
  // active language from /account and the key flips, the prior language's
  // data stays visible (transitional only) instead of restarting from a
  // spinner; the refetch then settles on the server's language.
  const {
    data: summary,
    isPlaceholderData: summaryIsPlaceholder,
    isError: summaryFailed,
    error: summaryError,
    refetch: refetchSummary,
  } = useGetProgressSummary(
    { lang: activeLang },
    {
      query: {
        placeholderData: keepPreviousData,
        queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
      },
    },
  );
  // A locked-language denial on the summary (402 upgrade_required with reason
  // language_locked / teaser_exhausted) is a plan boundary, not an error —
  // home renders the showroom/upgrade state for it, never the retry shell.
  const summaryUpgrade = asUpgradeRequired(summaryError);
  const { data: account } = useGetAccount();
  const dailyGoal: number = account?.preferences?.learning.dailyGoal ?? 10;
  // Toast key — bump to re-fire the milestone toast when the goal is hit.
  const [goalToastKey, setGoalToastKey] = useState<number | null>(null);
  const { data: categories, isLoading: loadingCats } = useListCategories(
    { lang: activeLang },
    {
      query: {
        placeholderData: keepPreviousData,
        queryKey: getListCategoriesQueryKey({ lang: activeLang }),
      },
    },
  );
  // Cold-start brand splash v2: overlays the loading home on the first
  // arrival of a page load. It never delays the queries above/below (they
  // fire on this same render, exactly as before), HOLDS until categories
  // land (the ready signal), releases with a max-hold failsafe, renders a
  // static frame under reduced motion, and skips for warm cache, navigation
  // back, and any decision failure. Lifecycle lives in brand-splash.tsx;
  // timing constants in the index.css :root tuning block.
  const splash = useBrandSplash(!loadingCats);
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
    // During the language flip `summary` is the PRIOR language's data held as
    // a placeholder — never fire the goal toast off transitional data.
    if (summaryIsPlaceholder) return;
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
  }, [summary, summaryIsPlaceholder, dailyGoal]);

  // First paint blocks on categories only — the page's structural content.
  // The stats summary fills into a height-reserved banner when it arrives.
  // While categories load, home shows the ticket-and-card skeleton (task 902,
  // replacing the old blocking spinner); on a cold load the brand splash
  // overlays it until data lands or the beat finishes.
  if (loadingCats) {
    return (
      <>
        <HomeSkeleton />
        {splash.active && <BrandSplash exiting={splash.exiting} />}
      </>
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
            onClick={blessAudioPlayback}
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
              <BandPill band={normalizeBand(attempt.band, attempt.score)} />
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
              onClick={blessAudioPlayback}
              className="flex items-center gap-4 rounded-2xl border border-card-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0"
            >
              {cardContent}
            </Link>
          ) : (
            <div key={attempt.id} className="flex items-center gap-4 rounded-2xl border border-card-border bg-card p-4 shadow-sm">
              {cardContent}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="min-h-[100dvh] pb-nav lg:pb-12 animate-content-enter">
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
            <Link
              href="/account"
              title="Account & settings"
              aria-label="Account & settings"
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center bg-card border border-card-border text-muted-foreground hover:text-foreground shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all lg:hidden"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </motion.div>

        <NamePromptCard />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <LanguagePicker />
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-2xl border border-card-border bg-card px-4 h-12 shadow-[0_4px_0_rgba(0,0,0,0.08)] text-sm font-bold text-foreground transition-all hover:border-primary/40 active:translate-y-1 active:shadow-none"
            title="Chat with Bolo the parrot"
          >
            <MessageCircle className="w-4 h-4 text-primary" />
            <span>Chat with Bolo</span>
          </Link>
        </div>

        {/* Stats Banner — vibrant, front-and-center progress. The banner is
            ALWAYS rendered: summary no longer blocks first paint, so its late
            arrival must not shift the layout below. The cell row is invisible
            (same DOM, exact height reserved) until data lands, then remounts
            so the entrance springs still play. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springs.smooth, delay: 0.1 }}
          className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[hsl(220,70%,52%)] to-secondary p-5 text-white shadow-[0_14px_34px_-12px_hsl(243_62%_45%_/_0.6)] lg:p-7"
        >
          {/* soft decorative blobs */}
          <div className="pointer-events-none absolute -top-10 -right-8 h-36 w-36 rounded-full bg-white/15 blur-xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-white/10 blur-xl" />

          <div
            key={summary ? "stats-ready" : "stats-pending"}
            className={`relative flex items-stretch ${summary ? "" : "invisible"}`}
            aria-hidden={!summary}
          >
            {/* DAY STREAK stands on its own, exactly as the Chai cell does:
                it owns the streak-repair popup, and a button cannot be nested
                inside an anchor. It still reaches /progress — that is what it
                does when there is nothing to mend — so nothing is lost by
                pulling it out of the link (Task #1081). Total XP and Mastered
                remain one target into /progress; Chai stays separate and opens
                the wallet. */}
            <StatCell
              icon={
                <motion.div
                  animate={reduceMotion ? {} : { scale: [1, 1.15, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Flame className="w-6 h-6" fill="currentColor" />
                </motion.div>
              }
              value={summary?.currentStreakDays ?? 0}
              label="Day Streak"
              delay={0.16}
              onClick={() =>
                streakRepairable ? setStreakRepairOpen(true) : navigate("/progress")
              }
              // The chevron is the popup's affordance, so it appears only when
              // there is a repair behind the tap. Without one the cell behaves
              // like the two beside it, and must look like them too.
              showChevron={streakRepairable}
              ariaLabel={
                streakRepairable ? "Mend your streak" : "See your progress"
              }
              testId="stat-day-streak"
            />
            {/* Spec D2 speaking streak is still tracked server-side
                (`speakingStreakDays`), but it no longer earns a permanent
                tile here — the bar reads as four figures. */}
            <div className="w-px self-stretch bg-white/25" />
            <Link
              href="/progress"
              data-testid="stats-progress-link"
              aria-label="See your progress"
              className="flex flex-[2] items-stretch rounded-2xl transition-colors hover:bg-white/10"
            >
              <StatCell icon={<Star className="w-6 h-6" fill="currentColor" />} value={summary?.xp ?? 0} label="Total XP" delay={0.24} />
              <div className="w-px self-stretch bg-white/25" />
              <StatCell icon={<Trophy className="w-6 h-6" fill="currentColor" />} value={summary?.phrasesMastered ?? 0} label="Mastered" delay={0.32} />
            </Link>
            <div className="w-px self-stretch bg-white/25" />
            <StatCell
              icon={<ChaiGlyph className="w-6 h-6" />}
              value={tokensQuery.data?.balance ?? "-"}
              label="Chai"
              delay={0.4}
              onClick={() => setWalletOpen(true)}
              ariaLabel="Chai balance"
              testId="stat-chai"
            />
          </div>

          {/* Locked-language 402 (86ae84f restoration): an upgrade_required
              denial (language_locked / teaser_exhausted) is NOT a failure —
              it means the active language isn't on the plan. Render the
              showroom/upgrade state instead of the error-retry shell: retrying
              can never succeed, but the journey showroom and the paywall can. */}
          {!summary && summaryUpgrade && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="text-sm font-bold text-white/90">
                {summaryUpgrade.reason === "teaser_exhausted"
                  ? `You've had your free taste of ${activeLanguage?.name ?? "this language"} — unlock it to keep going.`
                  : `${activeLanguage?.name ?? "This language"} is waiting to be unlocked.`}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href="/journey"
                  className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-black text-white transition-colors hover:bg-white/30"
                >
                  Preview the journey
                </Link>
                <Link
                  href={upgradeHrefForDenial(summaryUpgrade, activeLang)}
                  className="rounded-full bg-card px-4 py-1.5 text-sm font-black text-primary transition-colors hover:bg-white/90"
                >
                  Unlock
                </Link>
              </div>
            </div>
          )}

          {/* Failure feedback — without this, a failed summary fetch leaves a
              permanently EMPTY gradient shell (the reserved-height cells above
              stay invisible), which reads as "the stats banner disappeared".
              Overlays the reserved space; stale data (keepPreviousData) still
              wins over the error state. */}
          {!summary && summaryFailed && !summaryUpgrade && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="text-sm font-bold text-white/90">Your stats couldn&apos;t load.</p>
              <button
                onClick={() => refetchSummary()}
                className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-black text-white transition-colors hover:bg-white/30"
              >
                Try again
              </button>
            </div>
          )}
        </motion.div>

        <ChaiWalletSheet open={walletOpen} onOpenChange={setWalletOpen} />
        {/* Streak repair (Ruling 2), now anchored on the DAY STREAK cell above
            rather than floating below the banner. It opens only from that tap
            — never on load — and closes without charging anything. */}
        <StreakRepairSheet
          open={streakRepairOpen}
          onOpenChange={setStreakRepairOpen}
          offer={streakRepairOffer}
          balance={tokensQuery.data?.balance}
        />
      </header>

      {/* Return leg from a Stripe Chai-pack purchase (?chai=success|cancel).
          Absent unless we just came back from checkout. */}
      <ChaiPurchaseReturn />

      <main className="mx-auto mt-8 w-full max-w-6xl px-6 lg:px-10">
        {/* Social strip: rank + top friends, or single invite affordance when
            the learner has no friends yet. Replaces the old referral card so
            there is exactly one invite affordance on home. Links to /friends. */}
        <HomeSocialStrip />
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
              {/* Task #1049: the pass renders FIRST, with Chacha-ji's stall
                  directly beneath it — home's order of intent is practise →
                  progress → spend, so the primary "start practising" action
                  is never pushed below a spend surface. Both still enter
                  together inside this one entrance wrapper. */}
              {/* The idle breathe lives on a dedicated wrapper: framer drives
                  the entrance motion.div and press motion.div inline
                  transforms, and a CSS transform animation on either of those
                  elements would override them while running. */}
              {/* Breathe pauses while tearing (Task #905): the hand-off
                  overlay measures the halves' layout boxes at navigation,
                  and an ancestor scale mid-breathe would skew the clone
                  placement by up to the breathe amplitude. */}
              <div className={cn("relative", !reduceMotion && !tearing && "animate-ticket-breathe")}>
              {/* Tactile press: pronounced scale-down, overshoot spring back
                  on release (PASS_PRESS_* constants above). */}
              <motion.div
                className="relative"
                whileTap={reduceMotion ? undefined : { scale: PASS_PRESS_SCALE }}
                transition={PASS_PRESS_SPRING}
              >
              <Link
                href="/journey"
                // Stable hook for the order pin (Task #1049): the pass must
                // render ABOVE the stall inside the entrance wrapper.
                data-testid="journey-pass-card"
                onClick={handlePassActivate}
                className={cn(
                  "group relative block w-full rounded-3xl text-white transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_rgba(0,0,0,0.18)]",
                  // While tearing, the container itself disappears (transparent
                  // bg, no shadow, no clipping): the widening gap between the
                  // two departing halves shows the actual page behind the
                  // pass, so it reads as a ticket floating over the page.
                  tearing
                    ? "overflow-visible shadow-none"
                    : "overflow-hidden shadow-[0_8px_0_rgba(0,0,0,0.18)]",
                )}
                style={{
                  backgroundColor: tearing ? "transparent" : journeyLine.accent,
                }}
              >
                {/* full-ticket treatment: diagonal brand-stripe ticket stock
                    (hidden while tearing; the halves carry their own stock) */}
                {!tearing && <TicketStripes ink="rgba(255,255,255,0.05)" />}
                {/* shimmer sweep across the ticket face, once per heartbeat
                    (transform-only band; the Link's overflow-hidden clips it) */}
                {!reduceMotion && !tearing && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-ticket-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    aria-hidden
                  />
                )}
                {!tearing && (
                  <div
                    className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl"
                    aria-hidden
                  />
                )}
                <div className="relative flex items-stretch">
                  {/* main body (pulls away leftward while the stub tears off;
                      while tearing it carries its own ticket stock + rounded
                      left corners so it reads as a torn half of the pass) */}
                  <div
                    ref={tearBodyRef}
                    className={cn(
                      "min-w-0 flex-1",
                      tearing && "animate-body-tear rounded-l-3xl",
                    )}
                    style={
                      tearing
                        ? { backgroundColor: journeyLine.accent }
                        : undefined
                    }
                  >
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
                        <TrainEngine
                          className={cn(
                            "mt-1 h-[var(--train-ticket-h)] w-auto shrink-0 text-white drop-shadow-sm lg:h-[var(--train-ticket-h-lg)]",
                            !reduceMotion && "animate-train-drive",
                          )}
                        />
                      </div>
                      {journey.current && journey.current.phraseCount > 0 && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                            <div
                              className="h-full rounded-full bg-card transition-all duration-700"
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
                    {/* ticket perforation (dashed line + LEFT-EDGE bite,
                        retained per the cutout ruling: -left-2.5 puts the
                        20px circle at x −10..+10 relative to the card, so the
                        root's overflow-hidden clips it to a half-moon bite
                        straddling the outer left edge at the perforation end
                        — it is NOT a floating interior dot; measured
                        STRADDLES-EDGE by qa/task879-shots.mjs). */}
                    <div className="relative" aria-hidden>
                      <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />
                      <div className="mx-5 border-t-2 border-dashed border-white/40" />
                    </div>
                    {/* action verb + daily-goal/streak co-located */}
                    <div className="flex items-center justify-between gap-2 p-5 pt-3.5 pr-3 lg:px-6 lg:pr-4">
                      <span className="flex items-center gap-1.5 text-sm font-black lg:text-base lg:gap-2">
                        {journeyCta}
                        <span
                          className={cn("inline-flex", !reduceMotion && "animate-cta-arrow-nudge")}
                          aria-hidden
                        >
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 lg:h-5 lg:w-5" />
                        </span>
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
                  {/* tear-off stub: perforation with notches (edge bites),
                      fare-zone stamp, vertical line name. No floating punch
                      dot — cutout circles only ever straddle card edges
                      (approved ruling, ported from the mobile build-28 pass). */}
                  {/* the perforation hides while tearing: the dashed line is
                      replaced by the two jagged torn edges */}
                  {!tearing && <TicketPerforationV light />}
                  <div
                    ref={tearStubRef}
                    className={cn(
                      "relative flex w-16 shrink-0 flex-col items-center gap-2 py-4",
                      tearing && "animate-stub-tear rounded-r-3xl",
                    )}
                    // While tearing, the piece carries its own ticket stock so
                    // it reads as a torn-off piece of the pass, not floating
                    // stamp art (at rest the Link's identical accent shows).
                    style={tearing ? { backgroundColor: journeyLine.accent } : undefined}
                  >
                    {journey.current && (
                      <ZoneStamp
                        ink="rgba(255,255,255,0.8)"
                        zone={journey.current.zoneIndex + 1}
                        name={journey.current.geoName}
                        size={HOME_STAMP_SIZE}
                      />
                    )}
                    <StubWordmark lineName={journeyLine.lineName} />
                  </div>
                </div>
              </Link>
              {/* soft glow / elevated shadow pulse lifting the pass off the
                  page (opacity-only overlay; outside the Link so its outward
                  shadow is not clipped by overflow-hidden) */}
              {!reduceMotion && !tearing && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-3xl animate-pass-glow"
                  style={{ boxShadow: `0 6px 28px 2px ${journeyLine.accent}` }}
                  aria-hidden
                />
              )}
              </motion.div>
              </div>
              {/* Chai treatment tier 1: Chacha-ji's stall, full width at its
                  natural aspect, directly BELOW the pass (Task #1049) — the
                  platform the boarding pass has just pulled away from. It
                  enters WITH the pass (inside this entrance wrapper, outside
                  the breathe wrapper above, which must keep driving the ticket
                  alone) and opens the same wallet sheet the Chai stat cell
                  opens. */}
              {/* The balance is the SAME query the Chai stat cell reads
                  (tokensQuery above), passed down rather than fetched again:
                  spends are server-authoritative and every surface refetches
                  on change, so the band can never drift from the wallet. */}
              <ChaiStallVignette
                className="mt-3"
                label="Chacha-ji's Chai stall — open your Chai wallet"
                onClick={() => setWalletOpen(true)}
                balance={tokensQuery.data?.balance}
              />
            </motion.div>

            {/* Phrasebook door (Task #906): the topic grid moved to the
                /phrasebook library surface; home keeps one quiet bordered
                card so the boarding pass stays the loudest element on the
                page. The chip row reuses the categories this page already
                fetches (no new API calls). The header row is a stretched
                link over the card; chips sit above it (relative) and
                deep-link into their topic. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.gentle, delay: 0.1 }}
            >
              <section
                aria-label="Phrasebook"
                data-testid="phrasebook-door"
                className="relative rounded-3xl border border-card-border bg-card p-5 shadow-[0_4px_0_rgba(0,0,0,0.08)] transition-all hover:-translate-y-0.5"
              >
                <Link
                  href="/phrasebook"
                  data-testid="link-phrasebook-door"
                  className="group flex items-center gap-3"
                >
                  {/* Stretched hit area: the whole card opens the Phrasebook */}
                  <span className="absolute inset-0 rounded-3xl" aria-hidden />
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-foreground">Phrasebook</span>
                    <span className="block truncate text-sm font-semibold text-muted-foreground">
                      Browse and practice any topic
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
                {(categories ?? []).length > 0 && (
                  <div className="relative mt-4 flex flex-wrap gap-2">
                    {categories?.slice(0, 3).map((cat) => (
                      <Link
                        key={cat.id}
                        href={`/learn/${cat.id}`}
                        data-testid={`phrasebook-chip-${cat.id}`}
                        onClick={() =>
                          track(ANALYTICS_EVENTS.TOPIC_OPENED, {
                            categoryId: cat.id,
                            language: activeLang,
                            source: "home_chip",
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-background px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
                      >
                        {cat.title}
                        {cat.masteredCount > 0 && (
                          <span className="font-black text-muted-foreground">
                            {cat.masteredCount}/{cat.phraseCount}
                          </span>
                        )}
                      </Link>
                    ))}
                    {(categories ?? []).length > 3 && (
                      <Link
                        href="/phrasebook"
                        data-testid="phrasebook-chip-more"
                        className="inline-flex items-center rounded-full border border-dashed border-card-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        +{(categories ?? []).length - 3} more
                      </Link>
                    )}
                  </div>
                )}
              </section>
            </motion.div>

            {/* Daily lesson allowance (Free only) */}
            {showDailyMeter && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.gentle, delay: 0.42 }}>
                {capReached ? (
                  <UpgradeCard
                    icon={<Zap className="h-6 w-6" fill="currentColor" />}
                    title="You've finished today's free lessons"
                    description="Come back tomorrow for more — or unlock every language and feature with All-Access."
                    cta="Get All-Access"
                    href={upgradeHref({ plan: "plus", reason: "daily_lesson_limit" })}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4 shadow-sm">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Zap className="h-5 w-5" fill="currentColor" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {dailyRemaining} of {dailyLimit} free lessons left today
                    </p>
                    <Link href={upgradeHref({ plan: "plus" })} className="ml-auto text-sm font-black text-primary shrink-0">
                      Get All-Access
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

        {/* Secondary chrome: how to keep Bolo on the home screen, plus the
            App Store badge for iOS. Quiet, bottom of the page, never
            competing with the journey and practice content above. */}
        <AddToHomeScreen />
      </main>
      {/* Daily goal celebration — mirrors the MilestoneToast on mobile home */}
      <MilestoneToast message="Daily goal hit! 🎉" toastKey={goalToastKey} />
      {/* Splash exit fade can outlive the skeleton by a beat when data cuts
          the moment short — keep it mounted (portaled to body) until done. */}
      {splash.active && <BrandSplash exiting={splash.exiting} />}
    </div>
  );
}

function StatCell({
  icon,
  value,
  label,
  delay = 0,
  onClick,
  showChevron,
  ariaLabel,
  testId,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  delay?: number;
  onClick?: () => void;
  /**
   * Whether to show the trailing chevron. Defaults to "this cell is tappable",
   * which is what every caller but DAY STREAK wants; that one is always
   * tappable but only sometimes opens something, so it drives the affordance
   * off the offer instead (Task #1081).
   */
  showChevron?: boolean;
  ariaLabel?: string;
  testId?: string;
}) {
  // Same structure whether static or tappable; the Chai cell passes onClick
  // so it renders as a button that opens the wallet sheet. Tappable cells get
  // the home page's existing press feedback (whileTap, reduced-motion aware)
  // and a trailing chevron affordance; static cells stay exactly as they are.
  const reduceMotion = useReducedMotion();
  const Cell = onClick ? motion.button : motion.div;
  const withChevron = showChevron ?? Boolean(onClick);
  return (
    <Cell
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={onClick && !reduceMotion ? { scale: PASS_PRESS_SCALE } : undefined}
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
      <div className="text-[11px] font-bold uppercase tracking-wider text-white">
        {withChevron ? (
          <span className="inline-flex items-center gap-0.5">
            {label}
            <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />
          </span>
        ) : (
          label
        )}
      </div>
    </Cell>
  );
}
