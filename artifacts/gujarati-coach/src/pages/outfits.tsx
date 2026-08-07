import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOutfitsQueryKey,
  getGetTokensQueryKey,
  useBuyOutfit,
  useEquipOutfit,
  useGetOutfits,
} from "@workspace/api-client-react";
import { Mascot } from "@/components/mascot";
import { ChaiGlyph } from "@/components/chai-stall";
import { cn } from "@/lib/utils";

// Bolo's wardrobe. Outfits are a Chai sink: bought once, owned forever, worn
// everywhere the mascot appears.
//
// The shop previews an outfit ON THE LEARNER'S OWN BOLO rather than showing a
// grid of thumbnails (owner ruling) — tap a costume, see the bird wearing it,
// then buy it or back out. Prices, ownership and the equipped choice all come
// from the server; nothing here hardcodes a number.
export default function OutfitsPage() {
  const queryClient = useQueryClient();
  const outfitsQuery = useGetOutfits();
  const data = outfitsQuery.data;
  const equipped = data?.equipped ?? null;
  const balance = data?.balance ?? 0;

  // Which costume the bird is showing. `undefined` means "whatever is
  // equipped" — the moment the learner taps a card we hold their choice, and
  // backing out returns to their real Bolo.
  const [previewed, setPreviewed] = useState<string | null | undefined>(
    undefined,
  );
  const shown = previewed === undefined ? equipped : previewed;
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    // The equipped outfit rides GET /tokens, so refreshing both keys is what
    // redresses every other mascot in the app.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetOutfitsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() }),
    ]);
  };

  const onError = () =>
    setError("That didn't go through. Give it another try.");

  const buy = useBuyOutfit({
    mutation: {
      onSuccess: async () => {
        setError(null);
        setPreviewed(undefined);
        await refresh();
      },
      onError,
    },
  });
  const equip = useEquipOutfit({
    mutation: {
      onSuccess: async () => {
        setError(null);
        setPreviewed(undefined);
        await refresh();
      },
      onError,
    },
  });

  const busy = buy.isPending || equip.isPending;
  const shownOutfit = data?.outfits.find((o) => o.id === shown) ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6" data-testid="outfit-shop">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Bolo's wardrobe</h1>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            Dress him up with Chai. Once he owns it, it's his for good.
          </p>
        </div>
        <span
          data-testid="outfit-balance"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-1.5 text-sm font-black text-foreground"
        >
          {balance}
          <ChaiGlyph className="h-4 w-4" />
        </span>
      </div>

      {/* Preview: the learner's own Bolo, wearing whatever is selected. */}
      <div
        data-testid="outfit-preview"
        className="mt-5 flex flex-col items-center rounded-3xl border border-card-border bg-card p-6"
      >
        <Mascot pose="wave" size={180} outfit={shown} />
        <p className="mt-3 text-center text-sm font-bold text-foreground">
          {shownOutfit ? shownOutfit.name : "Bolo, as he comes"}
        </p>
        {shownOutfit ? (
          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            {shownOutfit.tagline}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          data-testid="outfit-error"
          className="mt-3 text-center text-sm font-bold text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* Action for whatever is on the bird right now. */}
      <div className="mt-4 flex justify-center">
        {shownOutfit == null ? (
          equipped == null ? null : (
            <button
              type="button"
              disabled={busy}
              data-testid="outfit-unequip"
              onClick={() => equip.mutate({ data: { outfitId: null } })}
              className="rounded-xl border border-card-border bg-card px-5 py-2.5 text-sm font-black text-foreground transition-all active:translate-y-0.5 disabled:opacity-50"
            >
              Take it off
            </button>
          )
        ) : shownOutfit.owned ? (
          shownOutfit.id === equipped ? (
            <button
              type="button"
              disabled={busy}
              data-testid="outfit-unequip"
              onClick={() => equip.mutate({ data: { outfitId: null } })}
              className="rounded-xl border border-card-border bg-card px-5 py-2.5 text-sm font-black text-foreground transition-all active:translate-y-0.5 disabled:opacity-50"
            >
              Take it off
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              data-testid="outfit-wear"
              onClick={() =>
                equip.mutate({ data: { outfitId: shownOutfit.id } })
              }
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              Wear this
            </button>
          )
        ) : balance < shownOutfit.cost ? (
          <p
            data-testid="outfit-short"
            className="text-sm font-bold text-muted-foreground"
          >
            {shownOutfit.cost - balance} more Chai and he can wear it.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            data-testid="outfit-buy"
            onClick={() => buy.mutate({ data: { outfitId: shownOutfit.id } })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
          >
            <span>Buy · {shownOutfit.cost}</span>
            <ChaiGlyph className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* The rack. Tapping a costume only previews it — nothing is spent and
          nothing is worn until the learner says so above. */}
      <div className="mt-6 space-y-3">
        {(data?.outfits ?? []).map((outfit) => (
          <button
            key={outfit.id}
            type="button"
            data-testid={`outfit-card-${outfit.id}`}
            onClick={() => {
              setError(null);
              setPreviewed(outfit.id);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors",
              shown === outfit.id
                ? "border-primary"
                : "border-card-border hover:border-primary/40",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="font-black text-foreground">{outfit.name}</p>
              <p className="text-xs leading-snug text-muted-foreground">
                {outfit.tagline}
              </p>
            </div>
            {outfit.owned ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-black uppercase tracking-wider text-primary">
                <Check className="h-4 w-4" />
                {outfit.id === equipped ? "Wearing" : "Owned"}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-black text-foreground">
                {outfit.cost}
                <ChaiGlyph className="h-4 w-4" />
              </span>
            )}
          </button>
        ))}
        {shown !== equipped ? (
          <button
            type="button"
            data-testid="outfit-cancel-preview"
            onClick={() => setPreviewed(undefined)}
            className="w-full rounded-2xl border border-dashed border-card-border p-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Back out — show my Bolo as he is
          </button>
        ) : null}
      </div>
    </div>
  );
}
