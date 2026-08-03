// Chai wallet surfaces (Chunk 5B): balance chip, wallet sheet, and the
// Express Multiplier offer moment. Server truth lives behind GET /tokens and
// POST /tokens/spend from Chunk 5A; every active/inactive decision here is
// derived from expressMultiplierActiveUntil, never from a client-side timer.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Coffee, X } from "lucide-react";
import {
  ApiError,
  getGetTokensQueryKey,
  useGetTokens,
  useSpendTokens,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Mirrors artifacts/api-server/src/lib/tokenEconomy.ts (server is
// authoritative; these only size copy and eligibility checks client-side).
const STATION_PAUSE_COST = 5;
const EXPRESS_MULTIPLIER_COST = 10;
const STATION_PAUSE_MAX_EQUIPPED = 2;

const VIGNETTE_SRC = `${import.meta.env.BASE_URL}mascot/chachaji-wallet-vignette.png`;

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
  const [now, setNow] = useState(() => Date.now());
  const active = target !== null && Number.isFinite(target) && target > now;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active || target === null) return null;
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
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
  }
  return "That spend did not go through. Try again in a moment.";
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
 * Small Chai balance chip for the stats banner. Loading renders a dash,
 * never a spinner. Tapping opens the wallet sheet.
 */
export function ChaiBalanceChip({ className }: { className?: string }) {
  const tokensQuery = useGetTokens();
  const [open, setOpen] = useState(false);
  const balance = tokensQuery.data?.balance;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chai balance"
        data-testid="chai-balance-chip"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-black transition-colors",
          className,
        )}
      >
        <Coffee className="h-4 w-4" aria-hidden="true" />
        <span>{balance ?? "-"}</span>
      </button>
      <ChaiWalletSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Bottom sheet: balance, Station Pause row, Express Multiplier row. */
export function ChaiWalletSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tokensQuery = useGetTokens();
  const spend = useSpendWithRefresh();
  const tokens = tokensQuery.data;
  const countdown = useExpressCountdown(tokens?.expressMultiplierActiveUntil);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-3xl"
        data-testid="chai-wallet-sheet"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Chai Wallet</SheetTitle>
        </SheetHeader>
        <div className="mt-2 flex items-center gap-3">
          <img
            src={VIGNETTE_SRC}
            alt="Chacha-ji offering a cup of chai"
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black leading-none text-foreground">
              {tokens?.balance ?? "-"}
            </span>
            <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Chai
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-black text-foreground">Station Pause</p>
              <p className="text-xs leading-snug text-muted-foreground">
                Covers a missed day so your streak rides on. 5 Chai.
              </p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">
                {tokens?.stationPausesEquipped ?? 0} of{" "}
                {STATION_PAUSE_MAX_EQUIPPED} equipped
              </p>
            </div>
            <button
              type="button"
              disabled={spend.isPending}
              onClick={() => spend.mutate({ data: { item: "station_pause" } })}
              data-testid="wallet-equip-pause"
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              Equip
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-black text-foreground">Express Multiplier</p>
              <p className="text-xs leading-snug text-muted-foreground">
                Double XP for 20 minutes. 10 Chai.
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
                onClick={() =>
                  spend.mutate({ data: { item: "express_multiplier" } })
                }
                data-testid="wallet-start-express"
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
              >
                Start
              </button>
            )}
          </div>
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
