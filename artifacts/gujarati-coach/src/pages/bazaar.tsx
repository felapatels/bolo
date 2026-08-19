import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
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
import { StallBand } from "@/components/stall-band";
import {
  ChaiWalletSheet,
  ExpressMultiplierRow,
  FirstClassWalletRow,
  LanguageSignpostRow,
  StationPauseRow,
  StreakRepairRow,
} from "@/components/chai-wallet";
import { BazaarWelcome } from "@/components/bazaar-welcome";
import { DressingRoom } from "@/components/dressing-room";
import { OutfitCard, groupOutfits } from "@/components/outfit-card";
import { mascotAssetSrc } from "@/lib/mascot-outfits";
import { INDIA } from "@/lib/india-palette";
import { cn } from "@/lib/utils";

// Bolo Bazaar - the market street. FOUR stalls stacked down one scroller, each
// a painted band with its own goods listed directly underneath it: the tailor
// (outfits), the ticket counter (First Class, and the signpost to unlocking a
// language), the signal box (mend, pause, express) and Chacha-ji's chai stall
// (the wallet). Never a hub of tiles, never a painted hotspot map: a learner
// scrolls the street and sees every price on the way past.
//
// The stall art and the character layer contract live in components/stall-band.tsx.
// The rows are the WALLET'S OWN rows, imported rather than re-typed, so a copy
// or price change lands on both surfaces at once.
//
// Outfits are a Chai sink: bought once, owned forever, worn everywhere the
// mascot appears.
//
// The shop previews an outfit ON THE LEARNER'S OWN BOLO rather than showing a
// grid of thumbnails (owner ruling), tap a costume, see the bird wearing it,
// then buy it or back out. Prices, ownership and the equipped choice all come
// from the server; nothing here hardcodes a number.
//
// THE THEME is a roadside cloth shop: a striped awning with a scalloped edge,
// a marigold toran strung under it, a hand-painted signboard, and a wooden
// counter the bird stands behind. The awning and toran are shared dressing
// (components/india-decor.tsx) and the colours come from the fixed INDIA
// palette (lib/india-palette.ts), a painted scene, not app chrome, so it
// reads the same in light and dark mode. Only the scene is fixed; every
// control below it stays on the design system.

export default function OutfitsPage() {
  const queryClient = useQueryClient();
  const outfitsQuery = useGetOutfits();
  const data = outfitsQuery.data;
  const equipped = data?.equipped ?? null;
  const equippedAccessory = data?.equippedAccessory ?? null;
  const balance = data?.balance ?? 0;

  // Which item the learner is trying on. Null means "nothing being tried", // the bird stands in exactly what she is wearing.
  //
  // TWO SLOTS: trying a hat on must not take her outfit off, so the item under
  // consideration only replaces ITS OWN slot and the other slot keeps showing
  // what is equipped. That is the whole feature, seen from the shop floor.
  const [previewed, setPreviewed] = useState<string | null>(null);
  // The rack grows; what a learner already paid for should not need hunting
  // for. One chip narrows it to their own wardrobe.
  const [ownedOnly, setOwnedOnly] = useState(false);
  // The chai stall at the bottom of the street opens the wallet a learner
  // already knows, rather than a second balance surface built here.
  const [walletOpen, setWalletOpen] = useState(false);
  const previewedItem = data?.outfits.find((o) => o.id === previewed) ?? null;
  const previewedKind = previewedItem?.kind ?? "garment";
  const shownGarment =
    previewedItem && previewedKind === "garment" ? previewedItem.id : equipped;
  const shownAccessory =
    previewedItem && previewedKind === "accessory"
      ? previewedItem.id
      : equippedAccessory;
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
        setPreviewed(null);
        await refresh();
      },
      onError,
    },
  });
  const equip = useEquipOutfit({
    mutation: {
      onSuccess: async () => {
        setError(null);
        setPreviewed(null);
        await refresh();
      },
      onError,
    },
  });

  const busy = buy.isPending || equip.isPending;
  // The item the buttons under the bird act on: whatever is being tried on,
  // and otherwise nothing (she is already wearing her own things).
  const shownOutfit = previewedItem;
  const isWorn = (id: string, kind?: string | null) =>
    kind === "accessory" ? id === equippedAccessory : id === equipped;

  const allItems = data?.outfits ?? [];
  const ownedCount = allItems.filter((o) => o.owned).length;
  const rackItems = ownedOnly ? allItems.filter((o) => o.owned) : allItems;

  // The changing room. Every costume change draws the curtain, swaps the art
  // behind it and opens again once the dressed bird has actually decoded, // the wait is real (a first-time outfit is a fresh PNG), which is exactly
  // why an in-place swap looked like a glitch. The failsafe matters more than
  // the beat: a curtain that never reopens hides the product, so it opens on
  // load, on error, and on a timer regardless.
  const [changing, setChanging] = useState(false);
  const dressedAs = useRef<string | undefined>(undefined);
  // Both slots decide what is behind the curtain, so the key is the pair.
  const shown = `${shownGarment ?? ""}|${shownAccessory ?? ""}`;

  useEffect(() => {
    if (dressedAs.current === shown) return;
    const first = dressedAs.current === undefined;
    dressedAs.current = shown;
    if (first) return; // the shop opens with the curtain already up

    setChanging(true);
    const shutAt = Date.now();
    let settled = false;
    const timers: number[] = [];
    // A cached image resolves instantly, and a curtain that opens the frame
    // after it shut just flashes. Whatever happens, it stays closed for the
    // whole beat and only then reveals.
    const MIN_CLOSED_MS = 1100;
    const openWhenDressed = () => {
      if (settled) return;
      settled = true;
      timers.push(
        window.setTimeout(
          () => setChanging(false),
          Math.max(0, MIN_CLOSED_MS - (Date.now() - shutAt)),
        ),
      );
    };
    // The base is the slow one, a first-time garment is a fresh PNG, and
    // the hat overlay is small and usually already cached, so the curtain
    // waits on the garment and lets the overlay ride along.
    const img = new Image();
    img.onload = openWhenDressed;
    img.onerror = openWhenDressed;
    img.src = mascotAssetSrc("wave", shownGarment);
    // Failsafe: the art may never resolve, and the booth must still open.
    timers.push(window.setTimeout(openWhenDressed, 2400));
    return () => {
      settled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [shown]);

  const tryOn = (outfitId: string) => {
    setError(null);
    setPreviewed(outfitId);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-nav pt-6 lg:pb-12" data-testid="outfit-shop">
      <BazaarWelcome />
      {/* Back and the tin, pinned to the top of the scroller. The balance used
          to sit on the painted signboard, which is gone; a learner scrolling
          four stalls has to be able to see what they can afford at every one
          of them, so the pill rides along instead of scrolling away with the
          tailor. Its own markup is unchanged. */}
      <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-4 bg-background px-4 pb-2 pt-1">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <span
          data-testid="outfit-balance"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-black"
          style={{
            borderColor: INDIA.gold,
            background: INDIA.cloth,
            color: INDIA.board,
          }}
        >
          {balance}
          <ChaiGlyph className="h-4 w-4" />
        </span>
      </div>

      {/* STALL 1 - THE TAILOR. The band is the shopfront; the dressing room,
          the filters and the rack below it are his stock. */}
      <StallBand stall="tailor" className="mt-4" />

      {/* The dressing room. It no longer sticks to the top of the scroller:
          on a street of four stalls a pinned bird would hang over the ticket
          counter and the signal box, which read as different places. Its own
          markup is untouched. */}
      {previewed ? (
      <div
        data-testid="outfit-dressing-room"
        className="pb-3 pt-1"
      >
      {/* The tailor's own floor. The awning, the toran and the painted
          "Bolo Bazaar" board used to stand here, announcing a shop the stall
          band above now announces by name; two signboards on one screen read
          as two different shops. What is left is the wall the bird stands
          against and the counter she stands behind, so she has a floor
          instead of floating in the page. */}
      <div
        data-testid="outfit-storefront"
        className="mt-3 overflow-hidden rounded-2xl border border-card-border bg-card"
      >
        {/* Preview: the learner's own Bolo, standing at the counter in
            whatever is selected. */}
        <div
          data-testid="outfit-preview"
          className="flex flex-col items-center px-5 pb-0 pt-5"
        >
          <DressingRoom closed={changing} className="w-full rounded-t-xl">
            <div className="flex justify-center pt-3">
              <Mascot
                pose="wave"
                size={180}
                outfit={shownGarment}
                accessory={shownAccessory}
              />
            </div>
          </DressingRoom>
          {shownOutfit ? (
            <p
              className="mt-2 text-center text-sm font-black"
              style={{ color: INDIA.board }}
            >
              {shownOutfit.name}
            </p>
          ) : null}
          {shownOutfit ? (
            <p
              className="mt-0.5 text-center text-xs font-bold"
              style={{ color: INDIA.ink }}
            >
              {shownOutfit.tagline}
            </p>
          ) : null}
          {/* The counter: a timber lip the bird stands behind. */}
          <div
            aria-hidden="true"
            className="mt-3 h-3 w-[calc(100%+2.5rem)] rounded-t-sm"
            style={{
              background: `linear-gradient(180deg, ${INDIA.timber} 0 55%, ${INDIA.timberShade} 55% 100%)`,
            }}
          />
        </div>
      </div>

      {error ? (
        <p
          data-testid="outfit-error"
          className="mt-3 text-center text-sm font-bold text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* Action for whatever is on the bird right now. Taking something off
          always names its slot, so removing a hat leaves the outfit on. */}
      <div className="mt-4 flex justify-center">
        {shownOutfit == null ? (
          equipped == null && equippedAccessory == null ? null : (
            <button
              type="button"
              disabled={busy}
              data-testid="outfit-unequip"
              onClick={() => equip.mutate({ data: { outfitId: null } })}
              className="rounded-xl border border-card-border bg-card px-5 py-2.5 text-sm font-black text-foreground transition-all active:translate-y-0.5 disabled:opacity-50"
            >
              Take it all off
            </button>
          )
        ) : shownOutfit.owned ? (
          isWorn(shownOutfit.id, shownOutfit.kind) ? (
            <button
              type="button"
              disabled={busy}
              data-testid="outfit-unequip"
              onClick={() =>
                equip.mutate({
                  data: { outfitId: null, slot: previewedKind as "garment" | "accessory" },
                })
              }
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
            {shownOutfit.cost - balance} more Chai and she can wear it.
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
      </div>
      ) : null}

      {/* The two facts the UI cannot show on its own: the pick is worn
          app-wide, and the slots combine. */}
      <p className="mt-4 text-sm font-bold leading-snug text-muted-foreground">
        Buy once, keep forever. Bolo wears your pick everywhere in the app, and
        a hat and an outfit go on at the same time.
      </p>

      {/* Quick filter. Owned stock is what a learner comes back for, and it
          is scattered through a rack sorted by kind. */}
      <div className="mt-4 flex items-center gap-2" data-testid="outfit-filters">
        <button
          type="button"
          data-testid="outfit-filter-all"
          aria-pressed={!ownedOnly}
          onClick={() => setOwnedOnly(false)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-black transition-colors",
            ownedOnly
              ? "border-card-border bg-card text-muted-foreground hover:text-foreground"
              : "border-primary bg-primary text-primary-foreground",
          )}
        >
          Everything
        </button>
        <button
          type="button"
          data-testid="outfit-filter-owned"
          aria-pressed={ownedOnly}
          onClick={() => setOwnedOnly(true)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-black transition-colors",
            ownedOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "border-card-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          My wardrobe · {ownedCount}
        </button>
      </div>

      {/* The rack. Stock is grouped by what it is and laid out as a grid of
          pictures rather than a list of names: with one bolt of cloth a list
          read fine, but the catalog is growing and a name alone does not tell
          a learner what she is buying. Every card still carries its own two
          doors, Try On is a free preview, Buy is the till, and the card
          body previews on click as a convenience. */}
      <div className="mt-4 space-y-5">
        {rackItems.length === 0 ? (
          <p
            data-testid="outfit-filter-empty"
            className="rounded-2xl border border-dashed border-card-border p-6 text-center text-sm font-bold text-muted-foreground"
          >
            Nothing bought yet. Everything on the rack is one tap away.
          </p>
        ) : null}
        {groupOutfits(rackItems).map((section) => (
          <section
            key={section.kind}
            data-testid={`outfit-section-${section.kind}`}
          >
            <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              {section.label}
            </h2>
            <div className="space-y-3">
              {section.items.map((outfit) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  isShown={previewed === outfit.id}
                  isWorn={isWorn(outfit.id, outfit.kind)}
                  busy={busy}
                  onTryOn={tryOn}
                  onBuy={(id) => {
                    setError(null);
                    setPreviewed(id);
                    buy.mutate({ data: { outfitId: id } });
                  }}
                  onEquip={(id, slot) => {
                    setError(null);
                    equip.mutate({
                      data: {
                        outfitId: id,
                        slot: slot as "garment" | "accessory",
                      },
                    });
                  }}
                />
              ))}
            </div>
          </section>
        ))}

        {previewedItem && !isWorn(previewedItem.id, previewedItem.kind) ? (
          <button
            type="button"
            data-testid="outfit-cancel-preview"
            onClick={() => setPreviewed(null)}
            className="w-full rounded-2xl border border-dashed border-card-border p-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Back out, show my Bolo as she is
          </button>
        ) : null}
      </div>

      {/* STALL 2 - THE TICKET COUNTER. First Class is the only paid-status
          thing on the street, and the language signpost sits with it because
          both are bought at a counter rather than off a rack. */}
      <div className="mt-8 space-y-3" data-testid="bazaar-ticket-counter">
        <StallBand stall="ticket" />
        <FirstClassWalletRow />
        <LanguageSignpostRow />
      </div>

      {/* STALL 3 - THE SIGNAL BOX. Everything that keeps the line running:
          mending a break, holding a pause in reserve, running an express. The
          mend row is silent unless the server is offering a real repair. */}
      <div className="mt-8 space-y-3" data-testid="bazaar-signal-box">
        <StallBand stall="signal" />
        <StreakRepairRow />
        <StationPauseRow />
        <ExpressMultiplierRow />
      </div>

      {/* STALL 4 - THE CHAI STALL. One door, into the wallet the rest of the
          app already opens; the balance and the packs live there. */}
      <div className="mt-8" data-testid="bazaar-chai-stall">
        <StallBand
          stall="chai"
          onClick={() => setWalletOpen(true)}
          label="Open your Chai wallet"
        />
      </div>
      <ChaiWalletSheet open={walletOpen} onOpenChange={setWalletOpen} />
    </div>
  );
}
