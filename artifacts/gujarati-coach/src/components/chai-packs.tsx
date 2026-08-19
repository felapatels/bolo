// Chai packs — buying Chai with money, on WEB ONLY.
//
// Everything visible here is DARK until the flag below is flipped. The plumbing
// underneath it is not: the checkout route, the Stripe session, and the
// webhook credit are live and tested, so switching packs on is a display
// change rather than the first run of untried code.
//
// iOS sells the SAME packs as StoreKit consumables (see
// artifacts/bolo-mobile/components/ChaiPackShop.tsx), also dark, reading the
// same server catalog. Nothing on THIS surface — the Stripe checkout, its
// prices, this component — may be mentioned or linked in the mobile app.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTokensQueryKey } from "@workspace/api-client-react";
import { ChaiGlyph } from "@/components/chai-stall";
import { INDIA } from "@/lib/india-palette";
import { usePricing, type PackOffer } from "@/lib/pricing";
import { beginChaiPackCheckout } from "@/lib/billing";

/**
 * THE FLAG. Same shape as APP_STORE_LIVE in components/app-store-badge.tsx: a
 * plain exported constant, overridable per-render by the `live` prop so tests
 * can exercise both states.
 *
 * What it gates: the pack shop SURFACE only — the section inside the Chai
 * wallet and nothing else. It does not gate `POST /api/stripe/chai-checkout`,
 * the Stripe session, the webhook credit, the ledger write, or the pack
 * catalog; all of those stay live and exercised while this is false.
 */
// LIT on 2026-08-18, at the owner's word. It was held dark while the packs
// went through review; the surface, the Stripe path, the webhook credit and
// the ledger write have all been exercised behind it since.
export const CHAI_PACKS_LIVE = true;

// Warm register, and each line is honest about what happened.
export const PACK_COPY = {
  title: "Out of Chai?",
  // Deliberately not a hard sell: earning is still the main road, and a
  // learner who reads this and goes back to practising has done the right
  // thing.
  blurb: "Top up the wallet, or keep practising. Both fill the cup.",
  failed: "That purchase did not go through. Nothing has been charged.",
  canceled: "Purchase canceled. Nothing has been charged.",
  // Shown when we land back from Stripe. The webhook does the crediting, so
  // there is a beat where the money is taken and the Chai has not landed yet.
  success: "Chai on the way. Your balance updates in a moment.",
  pending: "Taking you to checkout…",
} as const;

// Stripe hands the learner back BEFORE the webhook has necessarily landed, so
// one refetch on arrival can easily read the old balance. These are the extra
// looks, in ms after the return.
const RETURN_REFETCH_MS = [0, 2000, 5000];

/**
 * Handles the `?chai=success|cancel` return from Stripe on the home screen.
 *
 * Renders nothing unless the param is present, and is deliberately NOT flag
 * gated: a purchase that was in flight when the flag flipped off must still be
 * acknowledged, and the param cannot appear otherwise.
 *
 * It never asserts the Chai has arrived — the webhook is the only thing that
 * credits, so the copy promises "in a moment" and the refetches go looking.
 */
export function ChaiPurchaseReturn() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("chai");
    if (!outcome) return;

    setNotice(
      outcome === "success" ? PACK_COPY.success : PACK_COPY.canceled,
    );

    const timers: number[] = [];
    if (outcome === "success") {
      for (const delay of RETURN_REFETCH_MS) {
        timers.push(
          window.setTimeout(() => {
            void queryClient.invalidateQueries({
              queryKey: getGetTokensQueryKey(),
            });
          }, delay),
        );
      }
    }

    // Drop the param so a refresh (or a shared URL) does not replay the
    // banner, exactly as the upgrade page does with ?checkout.
    params.delete("chai");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [queryClient]);

  if (!notice) return null;

  return (
    <div
      data-testid="chai-purchase-return"
      className="mx-auto mt-4 w-full max-w-6xl px-6 lg:px-10"
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        {notice}
      </div>
    </div>
  );
}

function PackCard({
  pack,
  disabled,
  onBuy,
}: {
  pack: PackOffer;
  disabled: boolean;
  onBuy: (id: PackOffer["id"]) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onBuy(pack.id)}
      data-testid={`chai-pack-${pack.id}`}
      className="flex flex-1 flex-col items-center gap-1 rounded-2xl border border-card-border bg-card p-3 transition-all active:translate-y-0.5 disabled:opacity-50"
    >
      <ChaiGlyph className="h-7 w-7" />
      <span className="text-lg font-black leading-none text-foreground">
        {pack.chai}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Chai
      </span>
      <span
        className="mt-1 rounded-lg px-2 py-0.5 text-xs font-black"
        style={{ backgroundColor: `${INDIA.gold}2E`, color: INDIA.boardDeep }}
      >
        {pack.price}
      </span>
    </button>
  );
}

/**
 * The pack shop, as a section inside the wallet sheet.
 *
 * Renders NOTHING when the flag is off, and nothing when the server could not
 * price a single pack — a shop with no prices is worse than no shop, and the
 * house rule is that no money string is ever invented client-side.
 */
export function ChaiPackShop({
  live = CHAI_PACKS_LIVE,
}: {
  live?: boolean;
}) {
  const { packs, isLoading } = usePricing();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!live) return null;
  if (isLoading || packs.length === 0) return null;

  const handleBuy = async (packId: PackOffer["id"]) => {
    setBusy(true);
    setError(null);
    try {
      // Redirects to Stripe; on success this never resolves.
      await beginChaiPackCheckout(packId);
    } catch {
      setError(PACK_COPY.failed);
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="chai-pack-shop"
      className="rounded-2xl border border-card-border bg-card p-4"
      style={{
        backgroundImage: `linear-gradient(90deg, ${INDIA.gold}1F 0%, transparent 55%)`,
      }}
    >
      <p className="font-black text-foreground">{PACK_COPY.title}</p>
      <p className="text-xs leading-snug text-muted-foreground">
        {PACK_COPY.blurb}
      </p>
      <div className="mt-3 flex items-stretch gap-2">
        {packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            disabled={busy}
            onBuy={handleBuy}
          />
        ))}
      </div>
      {busy && (
        <p
          className="mt-2 text-xs font-bold text-muted-foreground"
          data-testid="chai-pack-pending"
        >
          {PACK_COPY.pending}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs font-bold text-destructive" data-testid="chai-pack-error">
          {error}
        </p>
      )}
    </div>
  );
}
