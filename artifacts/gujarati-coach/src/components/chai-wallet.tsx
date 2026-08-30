// Chai wallet surfaces (Chunk 5B): balance chip, wallet sheet, and the
// Express Multiplier offer moment. Server truth lives behind GET /tokens and
// POST /tokens/spend from Chunk 5A; every active/inactive decision here is
// derived from expressMultiplierActiveUntil, never from a client-side timer.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Coffee,
  Flame,
  Leaf,
  Pause,
  Plus,
  ShoppingBag,
  Star,
  Train,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Mascot } from "@/components/mascot";
import { SceneBand } from "@/components/scene-band";
import { ChaiGlyph } from "@/components/chai-stall";
import {
  ExpressTile,
  LanguagesTile,
  StationPauseTile,
  StreakMendTile,
} from "@/components/wallet-art";
import { INDIA, FIRST_CLASS_GOLD_VARS } from "@/lib/india-palette";
import { TrainEngine } from "@/components/train-svg";
import { useEntitlements } from "@/lib/entitlements";
import { repairErrorMessage } from "@/lib/chai-errors";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { ChaiPackShop } from "@/components/chai-packs";
import {
  ApiError,
  getGetProgressSummaryQueryKey,
  getGetStreakRepairQueryKey,
  getGetTokensQueryKey,
  useGetStreakRepair,
  useGetTokenHistory,
  useGetTokens,
  useBuyFirstClass,
  useRepairStreak,
  useSpendTokens,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Mirrors artifacts/api-server/src/lib/tokenEconomy.ts (server is
// authoritative; these only size copy and eligibility checks client-side).
const STATION_PAUSE_COST = 10;
const EXPRESS_MULTIPLIER_COST = 10;
const STATION_PAUSE_MAX_EQUIPPED = 2;
// Mirror of tokenEconomy.ts — server is authoritative.
const FIRST_CLASS_COST = 25;

// The wallet opens on Chacha-ji's stall itself — the painted scene, with the
// balance struck across it. (The home band still composites the layered art;
// this is a single flattened still, used only as a header.)

// Spend buttons are bazaar green, not app indigo: the kulhad glyph is
// terracotta, which muddied against indigo and pops against the signboard
// enamel. Fixed scene colours (lib/india-palette.ts) with cream lettering —
// contrast holds in both themes.
const SPEND_BTN_CLASS =
  "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition-all active:translate-y-1 active:shadow-none disabled:opacity-50";
// Enamel, not flat paint: a lit top edge fading into the board green, over the
// deep-green shadow the button presses into.
const SPEND_BTN_STYLE = {
  backgroundImage: `linear-gradient(180deg, #1E7357 0%, ${INDIA.board} 58%, #103F31 100%)`,
  color: INDIA.cream,
  boxShadow: `0 4px 0 ${INDIA.boardDeep}, inset 0 1px 0 rgba(255,247,234,0.35)`,
} as const;

/**
 * The mark every spend button carries after its amount. A bare kulhad, the
 * same treatment outfit-card.tsx uses on Buy Now, so a Chai amount looks the
 * same everywhere in the app. It was a cream-and-marigold disc with a glow;
 * on the dark spend buttons that read as a halo behind the cup rather than
 * as a coin.
 */
function ChaiCoin() {
  return <ChaiGlyph className="h-4 w-4" />;
}

// One dismissal hides the offer moment everywhere for the rest of the session.
const EXPRESS_OFFER_DISMISS_KEY = "chai-express-offer-dismissed";

function readOfferDismissed(): boolean {
  try {
    return sessionStorage.getItem(EXPRESS_OFFER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOfferDismissed(): void {
  try {
    sessionStorage.setItem(EXPRESS_OFFER_DISMISS_KEY, "1");
  } catch {
    // Session-only nicety; losing it just means the offer shows again.
  }
}

/**
 * Live "mm:ss" until expressMultiplierActiveUntil, or null when inactive or
 * expired. Remaining time is recomputed from the wall clock on every tick, so
 * a tab returning from the background lands on the correct value (or on null)
 * without any catch-up drama.
 */
export function useExpressCountdown(
  activeUntil: string | null | undefined,
): string | null {
  const target = activeUntil ? new Date(activeUntil).getTime() : null;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const active = target !== null && Number.isFinite(target) && target > now;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Wallet polish item 3: when the multiplier expires, pull fresh token
  // state so every surface returns to its default within a second, no
  // reopen required. One timeout keyed on the expiry timestamp; no polling.
  useEffect(() => {
    if (target === null || !Number.isFinite(target)) return;
    const delay = target - Date.now();
    if (delay <= 0) return;
    const id = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
    }, delay + 250);
    return () => clearTimeout(id);
  }, [queryClient, target]);

  if (!active || target === null) return null;
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Live human-readable countdown until a deadline, or null when inactive.
 * For sub-hour deadlines: "mm:ss". For longer: "Xhr Ymin" or "Xd Xhr".
 * Recomputes from the wall clock so a returning tab reads immediately correctly.
 * Schedules one cache invalidation at expiry — same pattern as Express.
 */
export function useFirstClassCountdown(
  activeUntil: string | null | undefined,
): string | null {
  const target = activeUntil ? new Date(activeUntil).getTime() : null;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const active = target !== null && Number.isFinite(target) && target > now;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (target === null || !Number.isFinite(target)) return;
    const delay = target - Date.now();
    if (delay <= 0) return;
    const id = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
    }, delay + 250);
    return () => clearTimeout(id);
  }, [queryClient, target]);

  if (!active || target === null) return null;
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  if (days >= 1) {
    const hrs = totalHours % 24;
    return hrs > 0 ? `${days}d ${hrs}hr` : `${days}d`;
  }
  if (totalHours >= 1) {
    const mins = totalMinutes % 60;
    return mins > 0 ? `${totalHours}hr ${mins}min` : `${totalHours}hr`;
  }
  if (totalMinutes >= 1) {
    const secs = totalSeconds % 60;
    return `${totalMinutes}min ${String(secs).padStart(2, "0")}s`;
  }
  const mm = String(totalMinutes).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Exact 409 copy per spend rejection; rejections are never paywall moments. */
function spendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const data = error.data as
      | { error?: string; balance?: number; cost?: number }
      | null;
    if (data?.error === "insufficient_tokens") {
      return `Not enough Chai yet. You have ${data.balance ?? 0}, this costs ${data.cost ?? 0}. Keep riding to earn more.`;
    }
    if (data?.error === "pause_max_equipped") {
      return "You already have 2 pauses equipped. That is the maximum.";
    }
    if (data?.error === "multiplier_active") {
      return "An Express Multiplier is already running.";
    }
    if (data?.error === "first_class_horizon") {
      return "Your First Class window already reaches past 30 days out. That is the clock ceiling, not a booking limit, so come back before it closes up.";
    }
  }
  return "That spend did not go through. Try again in a moment.";
}

function useFirstClassBuy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // The idempotency key is generated once per hook mount and holds for the
  // lifetime of the button being armed. A deliberate second purchase will
  // unmount and remount this hook (via key prop on the wallet row), which
  // generates a new UUID.
  const [refId] = useState(() => crypto.randomUUID());
  const mutation = useBuyFirstClass({
    mutation: {
      onError: (error: unknown) => {
        toast({ description: spendErrorMessage(error) });
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    },
  });
  return { mutation, refId };
}

/**
 * First Class wallet row.
 *
 * When ACTIVE: shows remaining time and "running" badge, no buy button. The
 * key prop on the parent flips this component out when the status becomes
 * inactive, which remounts useFirstClassBuy and generates a fresh UUID for
 * the next purchase — the same UUID on a second tap is the free replay,
 * not a second charge.
 *
 * When INACTIVE: shows price + buy button. The boost line makes clear it is
 * complimentary and immediate, NOT that the boost lasts 24 hours.
 *
 * Gold tile: a TrainEngine with FIRST_CLASS_GOLD_VARS pinned on its wrapper.
 * Same 64×64 Tile frame the other art tiles use. No new art.
 */
function FirstClassRow({ countdown }: { countdown: string | null }) {
  const { mutation, refId } = useFirstClassBuy();
  const isActive = countdown !== null;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4"
      style={{
        backgroundImage: `linear-gradient(90deg, ${INDIA.gold}2E 0%, transparent 55%)`,
      }}
      data-testid="wallet-first-class-row"
    >
      {/* Gold tile: TrainEngine with FIRST_CLASS_GOLD_VARS pinned.
          Same 64×64 frame as the other art tiles. */}
      <div
        aria-hidden="true"
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl"
        style={{ background: "#FBF1DF" }}
      >
        <div className="contents" style={FIRST_CLASS_GOLD_VARS}>
          <TrainEngine
            className="absolute inset-0 h-full w-auto m-auto"
            style={{ color: "#6B4A0F" }}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-black text-foreground">First Class</p>
        {isActive ? (
          <p className="text-xs leading-snug text-muted-foreground">
            Your train goes gold for {countdown} more.
          </p>
        ) : (
          <>
            <p className="text-xs leading-snug text-muted-foreground">
              24 hours of gold-train status.
            </p>
            <p className="text-xs text-muted-foreground">
              Complimentary Express boost on boarding.
            </p>
          </>
        )}
      </div>

      {isActive ? (
        <span
          className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-sm font-black text-amber-800"
          data-testid="wallet-first-class-active"
        >
          ✦ {countdown}
        </span>
      ) : (
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ data: { refId } })}
          data-testid="wallet-buy-first-class"
          className={SPEND_BTN_CLASS}
          style={SPEND_BTN_STYLE}
        >
          <span>Board · {FIRST_CLASS_COST}</span>
          <ChaiCoin />
        </button>
      )}
    </div>
  );
}

function useSpendWithRefresh() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useSpendTokens({
    mutation: {
      onError: (error: unknown) => {
        toast({ description: spendErrorMessage(error) });
      },
      onSettled: () => {
        // Success and rejection both refresh from the server truth.
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    },
  });
}

/**
 * The name of the day that got away, e.g. "Tuesday". Parsed at UTC noon so the
 * label never slides a day either side of a timezone; the key itself was cut
 * on the learner's own calendar, server-side.
 */
function missedDayLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "That day";
  return d.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
}

/**
 * Streak repair: shown ONLY when the server says there is a real break inside
 * the window, and silent otherwise — no greyed-out row, no "you could have",
 * nothing to notice on a day the learner did nothing wrong. Eligibility is
 * never inferred here; the button posts an empty body and the server picks the
 * day it is willing to sell.
 */
export function StreakRepairRow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const offerQuery = useGetStreakRepair();
  const offer = offerQuery.data;
  const repair = useRepairStreak({
    mutation: {
      onError: (error: unknown) => {
        toast({ description: repairErrorMessage(error) });
      },
      onSuccess: (result) => {
        toast({
          description: `${missedDayLabel(result.repairedDay)} is covered. Your ${result.restoredStreakDays}-day streak rides on.`,
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetStreakRepairQueryKey(),
        });
        // The streak the learner just bought back is derived server-side, so
        // every surface showing it has to re-ask rather than patch a number.
        queryClient.invalidateQueries({
          queryKey: [getGetProgressSummaryQueryKey()[0]],
        });
      },
    },
  });

  if (!offer?.eligible || !offer.missedDay) return null;

  return (
    <div
      data-testid="wallet-streak-repair"
      className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4"
      style={{
        backgroundImage: `linear-gradient(90deg, ${INDIA.gold}2E 0%, transparent 55%)`,
      }}
    >
      <StreakMendTile />
      <div className="min-w-0 flex-1">
        <p className="font-black text-foreground">Mend the line</p>
        <p className="text-xs leading-snug text-muted-foreground">
          {missedDayLabel(offer.missedDay)} got away from you. Cover it and your{" "}
          {offer.restoresStreakDays}-day streak rides on.
        </p>
      </div>
      <button
        type="button"
        disabled={repair.isPending}
        onClick={() => repair.mutate()}
        data-testid="wallet-repair-streak"
        className={SPEND_BTN_CLASS}
        style={SPEND_BTN_STYLE}
      >
        <span>Mend · {offer.cost}</span>
        <ChaiCoin />
      </button>
    </div>
  );
}

// THE ROWS BELOW ARE SHARED SURFACES. The wallet sheet and the bazaar street
// (pages/bazaar.tsx) render the same components rather than two copies of the
// same markup, so a price, a testid or a line of copy can only ever change in
// one place. Each row owns its own token query - react-query hands every
// caller the one cached result, so rendering a row on either surface costs
// nothing extra and both stay on the server's number.

/**
 * First Class, with the remount key the idempotency contract needs.
 *
 * The key flips when the status changes inactive→active, which remounts
 * useFirstClassBuy and generates a fresh UUID: the same UUID on a second tap
 * is the free-replay path, not a second charge.
 */
export function FirstClassWalletRow() {
  const tokensQuery = useGetTokens();
  const countdown = useFirstClassCountdown(
    tokensQuery.data?.firstClassActiveUntil,
  );
  return <FirstClassRow key={countdown ?? "inactive"} countdown={countdown} />;
}

/** Station Pause: bought BEFORE a miss and spent automatically. */
export function StationPauseRow() {
  const tokensQuery = useGetTokens();
  const spend = useSpendWithRefresh();
  const tokens = tokensQuery.data;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4"
      style={{
        backgroundImage: `linear-gradient(90deg, ${INDIA.gold}1F 0%, transparent 55%)`,
      }}
    >
      <StationPauseTile />
      <div className="min-w-0 flex-1">
        <p className="font-black text-foreground">Station Pause</p>
        {/* Deliberately forward-looking. The old line ("Covers a missed
            day...") read like the Mend row above it, so the two sinks
            were indistinguishable: this one is bought BEFORE the miss and
            spends itself automatically, and the copy has to say so or a
            learner has no reason to hold one on a day nothing is wrong. */}
        <p className="text-xs leading-snug text-muted-foreground">
          Equip it before you need it. The next day you miss is already covered,
          so your streak is safe.
        </p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          {tokens?.stationPausesEquipped ?? 0} of {STATION_PAUSE_MAX_EQUIPPED}{" "}
          equipped
        </p>
      </div>
      <button
        type="button"
        disabled={spend.isPending}
        onClick={() => spend.mutate({ data: { item: "station_pause" } })}
        data-testid="wallet-equip-pause"
        className={SPEND_BTN_CLASS}
        style={SPEND_BTN_STYLE}
      >
        <span>Equip · {STATION_PAUSE_COST}</span>
        <ChaiCoin />
      </button>
    </div>
  );
}

/** Express Multiplier: double XP for 20 minutes, one at a time. */
export function ExpressMultiplierRow() {
  const tokensQuery = useGetTokens();
  const spend = useSpendWithRefresh();
  const countdown = useExpressCountdown(
    tokensQuery.data?.expressMultiplierActiveUntil,
  );

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4"
      style={{
        backgroundImage: `linear-gradient(90deg, ${INDIA.express}1A 0%, transparent 55%)`,
      }}
    >
      <ExpressTile running={countdown !== null} />
      <div className="min-w-0 flex-1">
        <p className="font-black text-foreground">Express Multiplier</p>
        <p className="text-xs leading-snug text-muted-foreground">
          Double XP for 20 minutes.
        </p>
      </div>
      {countdown ? (
        <p
          className="shrink-0 text-sm font-black text-primary"
          data-testid="wallet-express-countdown"
        >
          Express running: {countdown} left
        </p>
      ) : (
        <button
          type="button"
          disabled={spend.isPending}
          onClick={() => spend.mutate({ data: { item: "express_multiplier" } })}
          data-testid="wallet-start-express"
          className={SPEND_BTN_CLASS}
          style={SPEND_BTN_STYLE}
        >
          <span>Start · {EXPRESS_MULTIPLIER_COST}</span>
          <ChaiCoin />
        </button>
      )}
    </div>
  );
}

/**
 * Unlock a Language: a SIGNPOST, not a till. Nothing is bought here - the
 * button explains where the spend actually happens (a stop on a locked
 * language's journey), which is why it is a free-tier row only: a paid plan
 * already owns the stops it would explain how to buy.
 */
export function LanguageSignpostRow() {
  const { isPaid, isLoading: entitlementsLoading } = useEntitlements();
  const [languageInfoOpen, setLanguageInfoOpen] = useState(false);

  if (entitlementsLoading || isPaid) return null;

  return (
    <>
      <div
        data-testid="wallet-language-row"
        className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4"
        style={{
          backgroundImage: `linear-gradient(90deg, ${INDIA.board}1F 0%, transparent 55%)`,
        }}
      >
        <LanguagesTile />
        <div className="min-w-0 flex-1">
          <p className="font-black text-foreground">Unlock a Language</p>
          <p className="text-xs leading-snug text-muted-foreground">
            Chai opens stops beyond Hindi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLanguageInfoOpen(true)}
          data-testid="wallet-language-info"
          className={SPEND_BTN_CLASS}
          style={SPEND_BTN_STYLE}
        >
          How it works
        </button>
      </div>

      <Dialog open={languageInfoOpen} onOpenChange={setLanguageInfoOpen}>
        <DialogContent
          className="max-w-sm"
          data-testid="wallet-language-info-dialog"
        >
          <DialogHeader>
            <DialogTitle>Unlock a language with Chai</DialogTitle>
            <DialogDescription>
              You can use Chai to unlock additional non-Hindi stops. Open the
              journey for a locked language and spend your Chai on a stop to
              ride it.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => setLanguageInfoOpen(false)}
            className={cn(SPEND_BTN_CLASS, "w-full justify-center")}
            style={SPEND_BTN_STYLE}
          >
            Got it
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Chai history: the last ten movements on the ledger, newest first, straight
 * from GET /tokens/history.
 *
 * The label is the SERVER's word for the row. The ledger's own `reason` column
 * holds machine strings (spend_outfit, earn_zone_complete) and never leaves
 * the server, so there is one wording for both platforms and no map to keep in
 * sync here.
 *
 * Loading and error both render NOTHING (the HomeSocialStrip rule): a wallet
 * that flashes a skeleton or an apology where its history goes is worse than
 * one that shows the balance, the shop and the door and stays quiet about the
 * rest.
 */
/** Which tile a movement wears, read off the server's label. Decoration
 *  keyed on words, never on the raw reason (which is never sent). Mobile
 *  twin: historyGlyph in components/ChaiWallet.tsx, same words, same tints. */
function historyGlyph(label: string): { Icon: LucideIcon; tint: string } {
  const l = label.toLowerCase();
  if (/streak/.test(l)) return { Icon: Flame, tint: "#22C55E" };
  if (/signal/.test(l)) return { Icon: Star, tint: "#F59E0B" };
  if (/first class/.test(l)) return { Icon: Train, tint: "#3B2A1E" };
  if (/express/.test(l)) return { Icon: Zap, tint: "#4F46E5" };
  if (/pause/.test(l)) return { Icon: Pause, tint: "#F0A32B" };
  if (/mend|repair/.test(l)) return { Icon: Wrench, tint: "#1E7357" };
  if (/pack|top.?up|adjust|grant|bonus/.test(l)) return { Icon: Plus, tint: "#1E7357" };
  if (/chacha|stall|halt/.test(l)) return { Icon: Coffee, tint: "#B5651D" };
  if (/outfit|bazaar|kurta|pagdi|cap|saree|sherwani|anarkali|kediyu|choli|wear/.test(l)) return { Icon: ShoppingBag, tint: "#4F46E5" };
  return { Icon: Coffee, tint: "#B5651D" };
}

/** "May 12, 9:20 AM", in the browser's own locale. */
function historyWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

type HistoryFilter = "all" | "earned" | "spent";
const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
  all: "All activity",
  earned: "Earned",
  spent: "Spent",
};
/** Five rows at rest (the owner's ruling: the last five, then the full
 *  history behind a door). The door opens the rest in place. */
const HISTORY_AT_REST = 5;

/**
 * CHAI HISTORY (mobile build 22, here build 23, the owner's wallet mockup):
 * a clock, the heading, a filter pill that cycles all / earned / spent, then
 * tiled rows with the movement's glyph, its label, when it happened, and the
 * signed amount with a kulhad; five at rest, "View full history" for the
 * rest. The labels come from the server as they always did; loading and
 * error still show nothing, so a wallet that cannot reach the ledger is a
 * balance and a door.
 */
function WalletHistory() {
  const history = useGetTokenHistory();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [showAll, setShowAll] = useState(false);
  if (history.isLoading) return null;
  if (history.isError) return null;

  const entries = history.data?.entries ?? [];

  // Nothing earned and nothing spent yet. A wallet that never mentions history
  // teaches a learner there is none, so the empty case still says where
  // movements will land, in the same frame with the same heading.
  if (entries.length === 0) {
    return (
      <div data-testid="wallet-history-placeholder" className="rounded-[18px] border border-card-border bg-card p-3.5">
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
            <Clock className="h-4 w-4" />
          </span>
          <p className="font-black text-foreground">Chai history</p>
        </div>
        <p className="py-2 text-sm font-bold text-muted-foreground">Cups you earn and buy will appear here.</p>
      </div>
    );
  }

  const filtered = entries.filter((e) => (filter === "all" ? true : filter === "earned" ? e.delta > 0 : e.delta < 0));
  const shown = showAll ? filtered : filtered.slice(0, HISTORY_AT_REST);
  const more = filtered.length - shown.length;
  return (
    <div data-testid="wallet-history-list" className="rounded-[18px] border border-card-border bg-card p-3.5">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
          <Clock className="h-4 w-4" />
        </span>
        <p className="flex-1 font-black text-foreground">Chai history</p>
        <button
          type="button"
          aria-label={`Showing ${HISTORY_FILTER_LABEL[filter]}. Change filter`}
          onClick={() => setFilter((f) => (f === "all" ? "earned" : f === "earned" ? "spent" : "all"))}
          data-testid="wallet-history-filter"
          className="inline-flex items-center gap-1 rounded-full border border-primary/35 px-3 py-1.5 text-[13px] font-bold text-primary"
        >
          {HISTORY_FILTER_LABEL[filter]}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul>
        {shown.map((entry) => {
          const { Icon, tint } = historyGlyph(entry.label);
          return (
            <li
              key={entry.id}
              data-testid="wallet-history-entry"
              className="flex items-center gap-2.5 border-b border-card-border py-2 last:border-b-0"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${tint}1F`, color: tint }}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{entry.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{historyWhen(entry.createdAt)}</span>
              </span>
              <span
                className="shrink-0 text-sm font-black tabular-nums"
                style={{ color: entry.delta > 0 ? INDIA.board : "hsl(var(--destructive))" }}
              >
                {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
              </span>
              <ChaiGlyph className="h-4 w-4 shrink-0" />
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 ? (
        <p className="py-2 text-sm font-bold text-muted-foreground">Nothing {filter} yet.</p>
      ) : null}
      {more > 0 || showAll ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          data-testid="wallet-history-more"
          className="flex w-full items-center justify-center gap-1 pt-2.5 text-sm font-bold text-primary"
        >
          {showAll ? "Show less" : "View full history"}
          {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );
}

/** Bottom sheet: balance, Station Pause row, Express Multiplier row. First Class row. */
export function ChaiWalletSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tokensQuery = useGetTokens();
  const tokens = tokensQuery.data;
  const [, navigate] = useLocation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[80vh] max-w-md flex-col overflow-hidden rounded-t-3xl p-0 [&>button]:z-10 [&>button]:right-4 [&>button]:top-8 [&>button]:flex [&>button]:h-9 [&>button]:w-9 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-white/90 [&>button]:text-[#3B2A1E] [&>button]:opacity-100"
        data-testid="chai-wallet-sheet"
      >
        {/* THE WALLET OPENS ON THE STALL (mobile build 22, here build 23, the
            owner's wallet mockup): the painted stall with Chacha-ji waving is
            the header, under a scalloped awning, with the name and its line
            on the left and the balance on a cream card. The scene is the same
            picture every other Chai surface draws. */}
        <div className="relative h-[232px] shrink-0 overflow-hidden" data-testid="wallet-header">
          <SceneBand stall="chai" className="absolute inset-0 !rounded-none" />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-[62%]"
            style={{
              background:
                "linear-gradient(90deg, rgba(251,243,230,0.92) 0%, rgba(251,243,230,0.35) 50%, rgba(251,243,230,0) 100%)",
            }}
          />
          {/* The awning: a row of scallops clipped to half by the sheet's edge. */}
          <div aria-hidden className="pointer-events-none absolute -left-1 -right-1 -top-[15px] flex justify-between">
            {Array.from({ length: 15 }, (_, i) => (
              <span key={i} className="h-[30px] w-[30px] shrink-0 rounded-full" style={{ backgroundColor: i % 2 === 0 ? "#7C5CBF" : "#FBF3E6" }} />
            ))}
          </div>
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-[22px] h-[5px] w-[38px] -translate-x-1/2 rounded-full bg-[#3B2A1E]/30" />
          <SheetHeader className="absolute left-[18px] right-[18px] top-11 space-y-0 p-0 text-left">
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 -rotate-[30deg] text-primary" />
              <SheetTitle className="text-[26px] font-black leading-tight" style={{ color: "#2B1A0E" }}>
                Chai Wallet
              </SheetTitle>
              <Leaf className="h-4 w-4 -scale-x-100 -rotate-[30deg] text-primary" />
            </div>
            <p className="ml-6 mt-0.5 text-[13px] font-semibold" style={{ color: "#3B2A1E" }}>
              Your chai, your progress.
            </p>
            <div
              data-testid="wallet-balance-band"
              className="mt-3.5 w-fit rounded-[18px] px-[18px] py-3"
              style={{ backgroundColor: "rgba(251,243,230,0.9)" }}
            >
              <p className="text-[11px] font-black tracking-[1.4px] text-primary">YOUR CHAI BALANCE</p>
              <div className="flex items-center gap-3">
                <ChaiGlyph className="h-10 w-10" />
                <span className="text-[44px] font-black leading-[48px]" style={{ color: "#2B1A0E" }}>
                  {tokens?.balance ?? "-"}
                </span>
              </div>
              <p className="text-xs font-bold uppercase tracking-[1.2px]" style={{ color: "#7A6551" }}>
                Chai
              </p>
            </div>
          </SheetHeader>
        </div>

        {/* Only the rows scroll; the painted header above stays put.
            THE WALLET IS A BALANCE AND A DOOR. Every sink it used to sell is
            stocked in the bazaar, behind its four doors; what is left is what
            only the wallet can do: show the balance, its history, top it up,
            and point at the street. */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <WalletHistory />

          <div
            className="flex items-center gap-2.5 rounded-[18px] border p-3"
            style={{ backgroundColor: "#EFEBFA", borderColor: "#D9D2F3" }}
          >
            <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center">
              <Mascot pose="wave" size={72} idle="none" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-foreground">Bolo Bazaar</p>
              <p className="text-xs leading-snug text-muted-foreground">
                Fits, boosts and streak savers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                // The only in-app door to the bazaar, so it is the only
                // gesture that can bless the welcome voice before it
                // tries to play. A direct URL or refresh stays silent.
                blessAudioPlayback();
                onOpenChange(false);
                navigate("/bazaar");
              }}
              data-testid="wallet-open-wardrobe"
              className="shrink-0 rounded-full bg-primary px-3.5 py-2.5 text-[13px] font-bold text-primary-foreground"
            >
              Browse Bazaar
            </button>
          </div>

          {/* Dark until CHAI_PACKS_LIVE is flipped; renders nothing at all
              while the flag is off, so the wallet is unchanged today. */}
          <ChaiPackShop />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The multiplier offer moment (result card and zone-completion celebration).
 * Renders exactly one of:
 *  - while the multiplier runs: a small "2x XP" indicator on the result card
 *    only (the celebration shows nothing),
 *  - otherwise, when the balance covers the cost and the offer has not been
 *    dismissed this session: the one-line offer with a single Start action,
 *  - otherwise nothing. Short balances never see an offer.
 */
export function ExpressOfferMoment({
  surface,
  className,
}: {
  surface: "result" | "celebration";
  className?: string;
}) {
  const tokensQuery = useGetTokens();
  const spend = useSpendWithRefresh();
  const [dismissed, setDismissed] = useState(readOfferDismissed);
  const tokens = tokensQuery.data;
  const countdown = useExpressCountdown(tokens?.expressMultiplierActiveUntil);

  if (countdown) {
    if (surface !== "result") return null;
    return (
      <div className={cn("flex justify-center", className)}>
        <span
          data-testid="express-2x-indicator"
          className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary"
        >
          2x XP
        </span>
      </div>
    );
  }

  const balance = tokens?.balance;
  if (
    dismissed ||
    balance === undefined ||
    balance < EXPRESS_MULTIPLIER_COST
  ) {
    return null;
  }

  return (
    <div
      data-testid="express-offer"
      className={cn(
        "flex items-center gap-2 rounded-2xl border border-card-border bg-card p-3 text-left",
        className,
      )}
    >
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
        Double your XP for the next 20 minutes? 10 Chai.
      </p>
      <button
        type="button"
        disabled={spend.isPending}
        onClick={() => spend.mutate({ data: { item: "express_multiplier" } })}
        data-testid="express-offer-start"
        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
      >
        Start
      </button>
      <button
        type="button"
        aria-label="Dismiss offer"
        data-testid="express-offer-dismiss"
        onClick={() => {
          writeOfferDismissed();
          setDismissed(true);
        }}
        className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
