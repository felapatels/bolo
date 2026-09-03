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
import { CountUpNumber } from "@/components/count-up-number";
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
import { useElementSize } from "@/hooks/use-element-size";
import { getBadgeIcon } from "@/lib/badge-icons";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { JOURNEY_ZONES, getRailBrand, getJourneyLine } from "@/lib/journeyLines";
import { playStopSplash } from "@/lib/stop-splash";
import { useJourneyProgress } from "@/lib/useJourneyProgress";
import { TrainEngine } from "@/components/train-svg";
import { BandPill, normalizeBand } from "@/components/ui/band-pill";
import { MiniTicket, stampSizeForExtent, stationFontSize } from "@/components/ticket";
import { StopDots } from "@/components/stop-dots";
import { PARCHMENT_PAPER, PARCHMENT_TOP, ParchmentPass } from "@/components/parchment-pass";
import { ZONE_BOARD } from "@/lib/zone-backdrops";
import { BADGE, TICKET } from "@/lib/ticket-stock";
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
import { BookOpen, Trophy, Flame, Star, ArrowRight, Settings, Target, Zap, MessageCircle, ChevronRight, HelpCircle, MapPin, Train } from "lucide-react";
import {
  BOARD_TRAIN_VARS as boardTrainVars,
  FIRST_CLASS_GOLD_VARS as firstClassGoldVars,
} from "@/lib/india-palette";
const PASS_PRESS_SCALE = 0.94;
const PASS_PRESS_SPRING = { type: "spring", stiffness: 480, damping: 12 } as const;

// R1 amendment: the stub column's fixed width (w-16) and the stamp that fits
// it. The stamp's ROTATED extent (not its nominal square) must clear the
// column with a 4px margin per side, so label + circle scale as one unit to
// the stub (mobile JourneyPassCard parity).
// THE MINI TICKET'S WIDTH, matched to mobile's STUB_W. It grew from 64 when
// the stub became a whole ticket: a body that names what it admits and which
// line needs a run to name them in.
// 148 FROM BUILD 18, WAS 176, in step with mobile's build 17. Inside home's
// "Your Journey" frame the board is narrower than at full bleed, and the stub
// took none of the loss, so the eyebrow ("BOARDING PASS · બોલો રેલ")
// truncated. The stamp's extent (46) and ADMIT ONE still fit: both size off
// STUB_W with margin to spare, and ADMIT ONE eased to 10 over 1.2 with it.
const STUB_W = 148;
// THE STAMP FITS THE TICKET'S INTERIOR, not its outer width: the ticket carries
// a 2px border AND a hairline rule set 4 in from it, and it is landscape now,
// so the stamp is sized off the stub's own run rather than off STUB_W. Mobile
// twin: STAMP_SIZE in JourneyPassCard.tsx. 46 is the stamp's rotated extent
// at scale 1.
const HOME_STAMP_EXTENT = 46;
// THE TICKET SCALES WITH THE BOARD ON WEB (build 18, off the owner's desktop
// screenshot: "boarding pass ticket on web is too small and not responsive
// to size"). Mobile's 148 is right for a phone, where the board's content box
// is about 294 wide (358 of board, the art's insets, the nudge); web's hero
// runs from that same phone to a 700px desktop column, and a 148px ticket on
// a 700px board reads as a postage stamp beside a 30px title. The WHOLE
// ticket scales as one unit off the measured content width: never below 1,
// so the phone keeps parity with mobile to the pixel, and never past 1.8,
// which is where the panel budget bites. MEASURED IN CHROME with the real
// MiniTicket rendered to static markup in Inter: at scale 1.63 (the lg
// breakpoint's 478px content box) the stack of ticket row, dots and CTA is
// 163 tall against a content box the panel's aspect makes about 176; at 1.8
// (a 1280 viewport's 562px box) the ticket is 266 by 104 and the stack 172
// against about 226. The stamp at 1.8 is 69px and its three rows take 53 of
// its 65px interior, which is the crowding the screenshot showed, gone.
// Unmeasured (jsdom, first paint) is 1.
export const HOME_TICKET_BASE_W = 294;
export const HOME_TICKET_MAX_SCALE = 1.8;
export function homeTicketScale(contentW: number): number {
  if (!(contentW > 0)) return 1;
  return Math.min(HOME_TICKET_MAX_SCALE, Math.max(1, contentW / HOME_TICKET_BASE_W));
}
// THE WHOLE FACE OF THE BOARD SCALES, NOT ONLY THE TICKET (build 21, off the
// owner's screenshot of the live home at a 704px column: "text too small and
// boarding pass ticket is too small, should fill space"). Build 18 scaled the
// ticket and left the type on viewport breakpoints, so at the desktop column
// the panel was a 647 by 285 cream board with a 140px stack of small print in
// the middle of it. Now the eyebrow, the station, the stop line, the dots,
// the engine, the tail, the verb and every margin between them are multiples
// of ONE factor, the same one the ticket takes, so a bigger board is the same
// pass, larger, rather than a wider one with the same small print.
//
// TWO BUDGETS, AND THE SMALLER WINS. Width gives the factor the ticket always
// had (homeTicketScale). Height is the new one: the panel's shape is fixed by
// HOME_PANEL_ASPECT and the panel CLIPS, and a board that does not fit its
// content does not look wrong, it looks BLANK. HOME_STACK_BASE_H is the whole
// stack's height at scale 1 with the tail wrapped to two lines, ADDED UP FROM
// THE COMPONENTS' OWN NUMBERS rather than measured: the ticket row is the
// ticket's minimum height (a 46 stamp extent plus its border and 10 of
// padding, 60), the dots row is its 8 margin plus the 16 ring (24), and the
// CTA row is its 10 margin, 8 of padding and two 13px lines of tail (44).
// Dividing the measured content box by it is the largest factor that still
// fits. Where the two-column grid pinches the column (a 1024 viewport gives
// the board 626px and its panel 250) height is the one that bites; at a 1280
// viewport width and height agree within a tenth; on a phone width holds it
// at exactly 1, so the phone case is still mobile's pass to the pixel. The
// 704px column was looked at in dev by the owner on 2026-08-29 ("yes good");
// the pinch has not been, and if anything ever clips there this constant is
// the first suspect: raise it, never lower it to taste.
//
// Unmeasured height (jsdom, first paint) leaves width in charge alone.
// 180 WITH THE PARCHMENT (2026-08-30), was 128 on the carved board: the ticket
// row is still 60, but the stops row now seats the 46px engine (its 14 up and
// 4 back, plus the row's 10 margin: 66), and the CTA row is a 38px pill under
// a 14px margin with 2px of padding (54).
export const HOME_STACK_BASE_H = 180;
export function homeBoardScale(contentW: number, contentH: number): number {
  const byWidth = homeTicketScale(contentW);
  if (!(contentH > 0)) return byWidth;
  return Math.min(byWidth, Math.max(1, contentH / HOME_STACK_BASE_H));
}
// THE HOME BOARD'S PANEL, IN PX, and it is a budget rather than a taste.
// ZONE_BOARD's content insets take about 27% of the panel before a word is
// drawn, and inside what is left the panel has to hold the eyebrow, the
// station name, the stop line, the progress row and the CTA plate, beside a
// ticket that is itself an ADMIT ONE stub plus a rotated stamp. Written out
// here for the same reason journey-board-budget.test.ts writes PC_H out: a
// board that does not fit its content does not look wrong, it looks BLANK,
// because the panel clips. Raise it for real content growth, never lower it
// to taste. Mobile twin: HOME_PANEL_H in JourneyPassCard.tsx (200pt there;
// web's type runs a little larger, so it gets a little more room).
// MEASURED, NOT CHOSEN. 200 (mobile's value) clips: with the Chai clause the
// CTA tail wraps to two lines, and the populated panel — eyebrow, station,
// stop line, ticket, progress row, plate — then needs 168px inside a content
// box that ZONE_BOARD's insets cut to 73.2% of the panel, i.e. 230px of panel
// for zero headroom. 240 leaves about 8px.
//
// A BOARD THAT DOES NOT FIT DOES NOT LOOK WRONG, IT LOOKS BLANK, because the
// panel clips: this was checked by comparing the content box's scrollHeight
// against its clientHeight in the browser, which is the only thing that can
// tell "does not fit" from "is not there". Raise it for real content growth,
// never lower it to taste.
const HOME_PANEL_H = 240;
// THE PAPER'S SHAPE, so a fluid sheet does not letterbox. Mobile's parchment
// is 358pt wide over a 222pt sheet (1.61). 2.5 was the carved board's shape
// and it starved the taller stack the parchment carries (the engine closes
// the stops row now, and the verb is a 38px pill): at the 704px desktop
// column the height budget held the face at 1.33 where the owner had
// approved 1.8. 1.9 lands that column on a 370px sheet, where width and
// height agree at the cap, and keeps the phone on the floor above.
const HOME_PANEL_ASPECT = 1.9;

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
    if (tearing) return;
    // THE ARRIVAL FILM STARTS HERE, AT THE TEAR, NOT WHEN THE JOURNEY MOUNTS
    // (build 21, owner: "can't we crossfade the homepage with the splash that
    // plays?"). The journey used to start its zone film only once its queries
    // resolved: home dissolved into a bare loading page, then the film faded
    // in. Started here, the overlay (mounted above the router) covers the
    // navigation and the map build, and home dissolves straight into the
    // scene; the journey sees it up and stands down. A no-op on a wide
    // viewport, where the film never plays. Mobile twin: JourneyPassCard's
    // handleActivate.
    if (arrivalZoneId != null) playStopSplash(arrivalZoneId);
    if (reduceMotion) return; // instant native Link navigation
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
  const railBrand = getRailBrand(activeLang);
  const journey = useJourneyProgress(activeLang, journeyLine.zones);
  // The zone whose film the pass starts at the tear (handlePassActivate).
  // Journey 1's zone ids are the six in JOURNEY_ZONES; with no current stop
  // there is no zone to name and the journey keeps its own arrival.
  const arrivalZoneId = journey.current
    ? (JOURNEY_ZONES[journey.current.zoneIndex]?.id ?? null)
    : null;
  // The board's content box, measured, so the whole face can scale with it.
  // See homeBoardScale.
  const passContent = useElementSize<HTMLDivElement>();
  const boardScale = homeBoardScale(passContent.width, passContent.height);
  const ticketW = Math.round(STUB_W * boardScale);
  // THE RUN LEFT FOR THE STATION NAME beside the ticket: the measured box less
  // the art-nudge padding it carries, the ticket, and the row's gap. Zero when
  // unmeasured, which stationFontSize reads as "give me the ceiling".
  const stationRun =
    passContent.width > 0
      ? passContent.width - ticketW - Math.round(12 * boardScale)
      : 0;
  const stationLabel = journey.current
    ? journey.current.geoName
    : `Ride the ${journeyLine.lineName}`;
  const stationFont = stationFontSize(stationLabel, stationRun, boardScale);
  // Progress-aware boarding-pass CTA. Uses only the data the pass already
  // receives from useJourneyProgress (no new API calls); when the current
  // stop is unknown (loading, locked, errored) the copy falls back to the
  // pre-existing generic verbs.
  const hasJourneyProgress = Boolean(journey.current?.started) || journey.doneCount > 0;
  // THE VERB, AND NOTHING THE BOARD ALREADY SAYS. It used to read "Resume at
  // Stop 5 · 10 phrases to go", which wrapped to two lines in the plate and
  // repeated the two things sitting directly above it: "Stop 5 of 11" and the
  // progress bar. Ported from mobile with the carved board, 2026-08-28.
  //
  // planBlocked keeps its words. It is the one state where the board above
  // says nothing useful, because there IS no current stop to name, so a bare
  // verb would leave a learner staring at a button with no reason attached.
  const journeyCta = !hasJourneyProgress
    ? "Start"
    : journey.current
      ? "Resume"
      : journey.planBlocked
        ? "Unlock with All-Access"
        : "Continue";
  // THE SECOND HALF OF THE PLATE. The verb alone left a wide button mostly
  // empty once the ticket went landscape and the plate got the whole panel
  // back.
  //
  // STOPS LEFT IN THE ZONE, not phrases at this stop, and that is a change
  // rather than a restoration: the old sentence counted phrases, which the
  // progress bar directly above already draws. Stops left is the one number
  // nothing else on the board is showing.
  const stopsLeftInZone = journey.current
    ? Math.max(journey.current.stopCount - journey.current.stopNumber, 0)
    : 0;
  /**
   * THE CHAI PROMISE RIDES IN THE BUTTON (owner, 2026-08-28: "just add the text
   * in the resume button text", after a standalone line under the progress bar
   * turned out to be invisible against the ticket art). Mobile twin says the
   * same words.
   *
   * IT SAYS "SURPRISES" ON PURPOSE. Chai on the journey is not only the
   * predictable 10 for finishing a zone: Chacha-ji turns up trackside every
   * fourth station with a gift, clearing a signal pays, and a capstone pays
   * more. A learner told only about the zone bonus will not notice the rest,
   * and the unexpected ones are the ones worth riding for.
   */
  // A BARE VERB IN A FULL-WIDTH PLATE READS AS MISSING TEXT, which is exactly
  // how it was reported ("start button missing text", owner). Mobile leaves
  // this null when there is no current stop, and on a phone-width plate one
  // word fills it; on web the plate runs the width of the board and "Start"
  // alone sits in a lot of empty paper.
  //
  // A LEARNER WITH NO PROGRESS IS THE ONE WHO MOST NEEDS THE CHAI PROMISE, so
  // the clause rides here too. There is no stop to count down from yet, so it
  // goes on its own.
  const journeyCtaTail = !journey.current
    ? "Chai and surprises along the way."
    : stopsLeftInZone === 0
      ? "Last stop in this zone! Chai and surprises along the way."
      : `Only ${stopsLeftInZone} more ${stopsLeftInZone === 1 ? "stop" : "stops"} to go. Chai and surprises along the way.`;
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
        {splash.active && <BrandSplash exiting={splash.exiting} onSkip={splash.skip} />}
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
      {/* HEADROOM FOR THE BIRD (build 23, one of the owner's web corrections
          off a screenshot: "the mascot cut off at the top of the web home").
          The greeting's mascot floats on its idle loop and the header gave
          it the same top padding as the words; the float carried the head
          past the top of the page. More room above, and the row may
          overflow rather than clip. Applied from the report rather than a
          reproduction: the web app cannot run against data on this Mac. */}
      <header className="mx-auto w-full max-w-6xl overflow-visible px-6 pb-2 pt-8 lg:px-10 lg:pt-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.smooth} className="flex items-start justify-between gap-3 overflow-visible">
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
                  ? `You've had your free taste of ${activeLanguage?.name ?? "this language"}. Unlock it to keep going.`
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
              {/* THE "YOUR JOURNEY" FRAME (owner's mockup, build 17 on mobile,
                  build 18 here). The pass used to sit bare on the page, one
                  world dropped into another. The mockup frames it: a thin
                  gold-lined card with a small pediment and a train at its
                  crown, a kicker and a line of copy, and a "View Map" pill.
                  Its annotation: "The Your Journey container creates a visual
                  bridge between the modern app and the journey world." View
                  Map opens the one-pager map (build 20): the whole line on one
                  poster with a live legend. The pass still opens the journey.
                  Mobile twin: home-journey-frame in (tabs)/index.tsx. It
                  bleeds 8 past the column and pads 4, so the board keeps all
                  but a few px of the column's width. */}
              {/* ROOM TO BREATHE (owner, 2026-08-30, off the desktop preview:
                  "outer box gets passed during throb. make outer box a little
                  bigger on boarding card"). The pass breathes to 1.025 and the
                  frame gave it 4px a side, so on a 700px column the paper grew
                  about 9px past the frame line at the top of every breath and
                  about 5px on a phone. The padding now clears the throb with
                  margin at both widths. */}
              <div
                data-testid="home-journey-frame"
                className="relative -mx-2 rounded-[20px] border-[1.5px] bg-card px-2.5 pb-3 pt-4 lg:px-5 lg:pb-5"
                style={{ borderColor: BADGE.brassEdge }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-3 left-1/2 flex h-[22px] w-[52px] -translate-x-1/2 items-start justify-center rounded-t-[26px] border-[1.5px] border-b-0 bg-card pt-1"
                  style={{ borderColor: BADGE.brassEdge }}
                >
                  <Train className="h-[13px] w-[13px]" style={{ color: BADGE.brassBg }} />
                </div>
                <div className="mb-2.5 flex items-center gap-2.5 px-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black tracking-[1.6px] text-primary">
                      YOUR JOURNEY
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Board your train and continue learning
                    </div>
                  </div>
                  {/* IT PULSES, SLOWLY (build 21): the one-pager map is a new
                      area and the owner wants the eye drawn to its door. The
                      halo is CSS (view-map-pulse in index.css); the class is
                      withheld under reduced motion the way every idle motion
                      on this page is. Mobile twin: AttentionPulse around the
                      same pill in (tabs)/index.tsx. */}
                  <Link
                    href="/map"
                    data-testid="home-view-map"
                    aria-label="View the journey map"
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-[7px] text-[13px] font-bold text-primary transition-colors hover:bg-muted",
                      !reduceMotion && "animate-view-map-pulse",
                    )}
                  >
                    <MapPin className="h-[13px] w-[13px]" />
                    View Map
                  </Link>
                </div>
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
              {/* THE GLOW IS BACK WITH THE PAPER (mobile twin: pass-glow in
                  JourneyPassCard). It went with the carved board, whose art
                  had a drawn frame and transparent margins that turned a halo
                  into a white box; the parchment is a torn sheet with no
                  frame, and the line's accent pulsing under it is what lifts
                  it off the page. Inset to the sheet's middle and well under
                  its ragged top edge, so only the shadow escapes. */}
              {!reduceMotion && !tearing && (
                <div
                  aria-hidden
                  data-testid="pass-glow"
                  className="pointer-events-none absolute animate-pass-glow rounded-[14px]"
                  style={{
                    left: "12%",
                    right: "12%",
                    top: PARCHMENT_TOP * 0.6,
                    bottom: 10,
                    backgroundColor: journeyLine.accent,
                    boxShadow: `0 6px 28px ${journeyLine.accent}`,
                  }}
                />
              )}
              <Link
                href="/journey"
                // Stable hook for the order pin (Task #1049): the pass must
                // render ABOVE the stall inside the entrance wrapper.
                data-testid="journey-pass-card"
                onClick={handlePassActivate}
                className="group relative block w-full transition-transform hover:-translate-y-0.5 active:translate-y-[3px]"
              >
                {/* THE BOARD IS THE PASS NOW. It was a full-width card in the
                    line's accent — bright green for Hindi, magenta for another
                    line — with the ticket furniture drawn on top of it in
                    white. Mobile replaced that on 2026-08-27 with a carved
                    station board and a paper ticket lying on it, and the
                    accent went with it ("the hero drops the green"): a line
                    identity belongs to the rail name, the postcards and the
                    comet, not to the paper. This is that port.
                    The board does NOT flinch when the ticket tears. A carved
                    board is bolted to a wall; what comes apart is the ticket. */}
                {/* THE PARCHMENT, NOT THE CARVED BOARD (2026-08-30, owner:
                    "the boarding pass on web is not updated with new UX from
                    mobile"; mobile made this move in build 21 off the owner's
                    home mockup). The board with its pediment stays the
                    journey's zone header; the pass is a sheet of aged paper
                    with a brass nameplate on its top edge, the zone in faint
                    ink under it, and the city's landmark seeping through
                    behind the words. Open for the length of the tear, as the
                    board was. The sheet is symmetric, so the art nudge the
                    board needed is gone with it. */}
                <ParchmentPass
                  testId="home-parchment-pass"
                  minHeight={HOME_PANEL_H}
                  aspect={HOME_PANEL_ASPECT}
                  nameplate={journeyLine.lineName}
                  plate={journey.current ? `ZONE ${journey.current.zoneIndex + 1}` : "DEPARTURES"}
                  landmark={journey.current ? journey.current.geoName : journeyLine.zones[0]}
                  clipContent={!tearing}
                >

                  <div
                    ref={passContent.ref}
                    data-testid="home-pass-content"
                    className="flex h-full min-w-0 flex-col justify-center"
                  >
                    {/* THE TOP LINE, with the ticket lying in the corner beside
                        it. The ticket used to be a full-height column down the
                        right, which pushed everything under it into a narrow
                        run; landscape in the corner, the progress bar and the
                        CTA plate get the whole panel back. */}
                    <div
                      className="flex items-start justify-between"
                      style={{ gap: Math.round(12 * boardScale) }}
                    >
                      <div className="min-w-0 flex-1">
                        {/* The brand is native-script "Bolo Rail" in the
                            LEARNER'S OWN script and must render with that
                            language's font or it comes out as tofu. This line
                            used to be the Gujarati wordmark, hardcoded, on
                            every one of the 22 lines. */}
                        {/* THE HYBRID TICKET (owner's mockup, build 17 on
                            mobile, build 18 here): the pass keeps its paper
                            and takes the app's purple for its accents, so it
                            reads as part of the app rather than as a prop
                            from another one. The eyebrow, the station dots
                            and the verb are the accents; the ink stays for
                            the copy. Tracking eased 1.4 to 0.9 with the
                            narrower stub, so the brand fits whole. */}
                        {/* EVERY SIZE ON THE FACE IS boardScale TIMES MOBILE'S
                            (build 21). These used to step up on the viewport's
                            sm/lg breakpoints, which is why a 704px column got
                            11px small print: the breakpoints know the window,
                            not the board. Mobile's points are the scale-1
                            values, so a phone is still mobile to the pixel. */}
                        <div
                          className="truncate font-black uppercase text-primary"
                          style={{ fontSize: 9 * boardScale, letterSpacing: 0.9 * boardScale }}
                        >
                          Boarding pass ·{" "}
                          <span
                            className={cn(!railBrand.native && "uppercase")}
                            style={
                              railBrand.native
                                ? { ...native.style, fontSize: 11 * boardScale, letterSpacing: 0 }
                                : undefined
                            }
                          >
                            {railBrand.text}
                          </span>
                        </div>
                        {/* THE STATION, exactly as the zone card names one, in
                            the board's own ink: the panel is cream in both
                            themes and a cool slate token reads cold on it.
                            FITTED TO ITS RUN, TWO LINES AT MOST, NEVER AN
                            ELLIPSIS (mobile parity, build 21): stationFontSize
                            shrinks the type until the longest word fits one
                            line and the whole name two, floored at 12 times
                            the scale. `truncate` used to cut "Thiruvananthapuram
                            Central" to its first word at any width. */}
                        <h2
                          className="mt-px line-clamp-2 font-black"
                          style={{
                            color: ZONE_BOARD.ink,
                            fontSize: stationFont,
                            lineHeight: `${Math.round(stationFont * 1.2)}px`,
                          }}
                        >
                          {stationLabel}
                        </h2>
                        <p
                          className="truncate font-semibold"
                          style={{
                            color: ZONE_BOARD.inkMuted,
                            fontSize: 11 * boardScale,
                            lineHeight: `${Math.round(16 * boardScale)}px`,
                            marginTop: Math.round(2 * boardScale),
                          }}
                        >
                          {journey.current
                            ? `Stop ${journey.current.stopNumber} of ${journey.current.stopCount}`
                            : `${journeyLine.zones[0]} to ${journeyLine.zones[5]}, station by station`}
                        </p>
                      </div>
                      {/* The gold wrapper moved OFF this: MiniTicket reads none
                          of the train's palette vars, and First Class recolours
                          the ENGINE, which now stands in the CTA plate below. */}
                      <div className="contents">
                        <MiniTicket
                          lineName={journeyLine.lineName}
                          zone={journey.current ? journey.current.zoneIndex + 1 : null}
                          stationName={journey.current ? journey.current.geoName : null}
                          stampSize={stampSizeForExtent(Math.round(HOME_STAMP_EXTENT * boardScale))}
                          width={ticketW}
                          scale={boardScale}
                          tearing={tearing}
                          bodyRef={tearBodyRef}
                          stubRef={tearStubRef}
                          notchFill={PARCHMENT_PAPER.mid}
                        />
                      </div>
                    </div>
                    {/* THE STATIONS, NOT A BAR (owner's mockup, build 17 on
                        mobile, build 18 here). The brass bar drew mastered
                        phrases within ONE stop; the mockup draws the zone as
                        a row of stops with the learner's own ringed, which is
                        what "Stop 5 of 11" above already says in words. The
                        mastered count still reaches the learner on the stop
                        card. StopDots is the one drawing of that row; the
                        journey's cards use it too. */}
                    {/* THE LOCOMOTIVE CLOSES THE ROW (mobile build 21, the
                        owner's home mockup; here 2026-08-30): a real engine at
                        the end of the line where it used to stand small in the
                        CTA row. Sat a little below the dots' line, wheels on
                        the rail, so the plume above the stack clears the
                        ticket stub's foot; the negative bottom margin gives the
                        row back the height. It still drives on the heartbeat
                        and First Class still recolours it. With no current
                        stop the dots have nothing to draw and the engine
                        stands at the platform alone. */}
                    <div
                      className="flex items-center pr-0.5"
                      style={{ marginTop: Math.round(10 * boardScale) }}
                    >
                      {journey.current && journey.current.stopCount > 0 ? (
                        <StopDots
                          testId="pass-stops-row"
                          total={journey.current.stopCount}
                          done={journey.current.stopNumber - 1}
                          current={journey.current.stopNumber}
                          accent="hsl(var(--primary))"
                          muted={ZONE_BOARD.inkMuted}
                          scale={boardScale}
                          terminus
                        />
                      ) : (
                        <span className="min-w-0 flex-1" />
                      )}
                      <div
                        className="contents"
                        data-testid="boarding-pass-train-gold-wrapper"
                        style={
                          tokensQuery.data?.firstClassActiveUntil &&
                          new Date(tokensQuery.data.firstClassActiveUntil) > new Date()
                            ? firstClassGoldVars
                            : boardTrainVars
                        }
                      >
                        <TrainEngine
                          className={cn(
                            "w-auto shrink-0",
                            !reduceMotion && "animate-train-drive",
                          )}
                          style={{
                            height: Math.round(46 * boardScale),
                            marginLeft: Math.round(6 * boardScale),
                            marginTop: Math.round(14 * boardScale),
                            marginBottom: Math.round(-4 * boardScale),
                          }}
                        />
                      </div>
                    </div>
                    {/* THE DOOR. BOXED AGAIN (mobile build 21, the owner's
                        home mockup: a filled violet Resume pill at the right,
                        the reason beside a chai cup at the left; here
                        2026-08-30). The unboxed verb was the owner's earlier
                        mockup and the newer one reverses it; the newest wins.
                        The cup before the reason: the sentence says where
                        Chai comes from, and the kulhad is Chai's mark on every
                        surface. Verb and arrow ride together inside one filled
                        pill so the two halves of the ACTION are one control. */}
                    <div
                      className="flex items-center"
                      style={{
                        marginTop: Math.round(14 * boardScale),
                        paddingTop: Math.round(2 * boardScale),
                        paddingBottom: Math.round(2 * boardScale),
                        gap: Math.round(8 * boardScale),
                      }}
                    >
                      {journeyCtaTail && (
                        <div
                          className="flex min-w-0 flex-1 items-center"
                          style={{ gap: Math.round(6 * boardScale) }}
                        >
                          <ChaiGlyph
                            className="shrink-0"
                            style={{ width: Math.round(18 * boardScale), height: Math.round(18 * boardScale) }}
                          />
                          {/* THREE LINES, NEVER ONE WITH AN ELLIPSIS: the
                              clamp keeps the Chai clause, which is the half of
                              the sentence most likely to be lost, and the
                              panel clips, so a fourth line must be impossible
                              rather than unlikely. */}
                          <span
                            className="line-clamp-3 min-w-0 flex-1 font-semibold"
                            style={{
                              color: ZONE_BOARD.inkMuted,
                              fontSize: 10 * boardScale,
                              lineHeight: `${Math.round(13 * boardScale)}px`,
                            }}
                          >
                            {journeyCtaTail}
                          </span>
                        </div>
                      )}
                      <span
                        data-testid="pass-cta-button"
                        className="inline-flex shrink-0 items-center rounded-full bg-primary text-primary-foreground"
                        style={{
                          height: Math.round(38 * boardScale),
                          paddingLeft: Math.round(16 * boardScale),
                          paddingRight: Math.round(12 * boardScale),
                          gap: Math.round(6 * boardScale),
                          boxShadow: "0 3px 6px rgba(59, 42, 30, 0.22)",
                        }}
                      >
                        <span
                          className="truncate font-black"
                          style={{
                            fontSize: 17 * boardScale,
                            lineHeight: `${Math.round(22 * boardScale)}px`,
                          }}
                        >
                          {journeyCta}
                        </span>
                        {/* A SOLID arrow, not a hairline one: beside a 17px
                            black verb a thin stroke reads as a different
                            weight of voice. */}
                        <span
                          className={cn("inline-flex shrink-0", !reduceMotion && "animate-cta-arrow-nudge")}
                          aria-hidden
                        >
                          <ArrowRight
                            className="transition-transform group-hover:translate-x-0.5"
                            strokeWidth={3}
                            style={{
                              width: Math.round(20 * boardScale),
                              height: Math.round(20 * boardScale),
                            }}
                          />
                        </span>
                      </span>
                    </div>
                  </div>
                </ParchmentPass>
                {/* The shimmer sweep, once per heartbeat. It was pulled for a
                    round while the "white box behind it" was being chased; the
                    box turned out to be `.depth-shadow` outlining the board's
                    rectangle, not this, so the sweep comes back.
                    Gradient and geometry are iOS's exactly: a band one third of
                    the pass wide, warm cream at 0.55 in the middle and fully
                    transparent at both ends, riding the same 3.2s heartbeat as
                    the breathe (ticket-shimmer runs the sweep over the first
                    45% and parks off-face for the rest). Warm rather than
                    white, because a white streak on cream paper and varnished
                    wood reads as a wash rather than as light crossing it. */}
                {!reduceMotion && !tearing && (
                  <div
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    aria-hidden
                  >
                    <div
                      data-testid="pass-shimmer"
                      className="absolute inset-y-0 left-0 w-1/3 animate-ticket-shimmer"
                      style={{
                        background:
                          "linear-gradient(to right, rgba(255,244,222,0), rgba(255,249,236,0.55), rgba(255,244,222,0))",
                      }}
                    />
                  </div>
                )}
                {/* NO GLOW HALO HERE, AND IT IS NOT AN OVERSIGHT. The old
                    green pass was a flat coloured card that needed lifting off
                    the page, so it carried an opacity-pulsed box-shadow. On the
                    carved board the same overlay drew a soft rounded rectangle
                    noticeably larger than the board's own art, which read as a
                    white box behind it with a green cast off the page gradient
                    ("still has green glow, white box behind it", owner) — the
                    art already has a drawn frame and a depth-shadow, so the
                    halo was adding a second, wrong edge. The board is heavy
                    furniture; it does not need to float. */}
              </Link>
              </motion.div>
              </div>
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
              {/* THE STALL SAYS WHAT IT IS FOR, ON ITSELF. These started as
                  a row UNDERNEATH the art, on the reasoning that a painted
                  band with Chacha-ji standing in it should not be covered. The
                  owner moved them onto it and gave the reason: "I want this
                  text on chai stall so people know what chai stall is for...
                  you can do all of those things via the chai stall." Detached,
                  the row was three links that happened to sit near a picture;
                  on the art it is a shop sign, and the picture stops being
                  decoration nobody knows the purpose of.
                  THE FOOT OF THE ART IS THE PLACE IT COSTS NOTHING: Chacha-ji
                  stands left of centre, the kettle steams to his left, and the
                  title and balance plate already own the top right corner. */}
              <div className="relative mt-3">
                <ChaiStallVignette
                  film
                  label="Chacha-ji's Chai stall, open your Chai wallet"
                  onClick={() => setWalletOpen(true)}
                  // One click to the Bazaar (owner, build 25), beside the wallet door.
                  balance={tokensQuery.data?.balance}
                />
                {/* Bottom-up, so the art reads through the top of it and the
                    type sits on something solid. Not interactive: the links
                    above take the clicks and the rest of the stall still opens
                    the wallet. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-b-2xl bg-gradient-to-b from-transparent to-[rgba(23,14,8,0.82)]"
                />
                <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    data-testid="stall-link-history"
                    aria-label="Purchase history, opens your Chai wallet"
                    onClick={() => setWalletOpen(true)}
                    className="text-xs font-semibold text-white/90 hover:text-white"
                  >
                    Purchase History
                  </button>
                  <span aria-hidden className="text-xs font-bold text-white/50">·</span>
                  <Link
                    href="/bazaar"
                    data-testid="stall-link-shop"
                    aria-label="Go shopping in the bazaar"
                    className="text-[15px] font-black text-white hover:underline"
                  >
                    Go Shopping!
                  </Link>
                  <span aria-hidden className="text-xs font-bold text-white/50">·</span>
                  <button
                    type="button"
                    data-testid="stall-link-buy"
                    aria-label="Buy more Chai, opens your Chai wallet"
                    onClick={() => setWalletOpen(true)}
                    className="text-xs font-semibold text-white/90 hover:text-white"
                  >
                    Buy More Chai
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Social strip: rank + top friends, or a single invite affordance
                when the learner has no friends yet. Replaces the old referral
                card so there is exactly one invite affordance on home, and
                links through to the board (/leaderboard).

                It sits BELOW the stall, not between the pass and the stall:
                Task #1049's pass-then-platform adjacency and their shared
                entrance wrapper stay intact, and home's order of intent reads
                practise → spend → compare. */}
            <HomeSocialStrip />

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
                      Everything your Journey has opened
                    </span>
                    {/* WHAT IT IS FOR, under what it holds. The line above says
                        what is inside and carefully says it is not a way past
                        the Journey; it never said why a learner would open it.
                        Asked for on mobile 2026-08-27 and brought here by the
                        parity sweep. */}
                    <span className="block truncate text-sm font-semibold text-muted-foreground">
                      Practice here to gain confidence.
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
                    description="Come back tomorrow for more, or unlock every language and feature with All-Access."
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
      {splash.active && <BrandSplash exiting={splash.exiting} onSkip={splash.skip} />}
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
      {/* THE NUMBER, COUNTED UP. The Chai cell passes a STRING when the wallet
          has not loaded ('-'), so this branches on the type rather than
          assuming: counting up to a dash is not a thing. Mobile twin does the
          same check for the same reason. */}
      <div className="text-2xl font-black leading-none lg:text-3xl">
        {typeof value === "number" ? <CountUpNumber value={value} /> : value}
      </div>
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
