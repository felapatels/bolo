import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
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
import { SceneBand } from "@/components/scene-band";
import { BazaarHeader } from "@/components/bazaar-header";
import { ChaiWalletSheet } from "@/components/chai-wallet";
import { DressingRoom } from "@/components/dressing-room";
import { OutfitCard, groupOutfits } from "@/components/outfit-card";
import { ChaiPackShop } from "@/components/chai-packs";
import { shortfallFromSpendError } from "@/lib/chai-errors";
import { mascotAssetSrc } from "@/lib/mascot-outfits";
import { INDIA } from "@/lib/india-palette";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
// grid of thumbnails (owner ruling) — tap a costume, see the bird wearing it,
// then buy it or back out. Prices, ownership and the equipped choice all come
// from the server; nothing here hardcodes a number.
//
// THE THEME is a roadside cloth shop: a striped awning with a scalloped edge,
// a marigold toran strung under it, a hand-painted signboard, and a wooden
// counter the bird stands behind. The awning and toran are shared dressing
// (components/india-decor.tsx) and the colours come from the fixed INDIA
// palette (lib/india-palette.ts) — a painted scene, not app chrome, so it
// reads the same in light and dark mode. Only the scene is fixed; every
// control below it stays on the design system.

export type ShopDoor = "tailor" | "station";

/** The station-themed pieces of the catalogue, by id. Grows with the art.
 *  Mobile twin: STATION_IDS in components/bazaar/OutfitShop.tsx. */
const STATION_IDS: ReadonlySet<string> = new Set(["station-cap"]);

const DOORS: Record<ShopDoor, { title: string; subtitle: string; stall: "tailor" | "ticket" }> = {
  tailor: { title: "The Tailor", subtitle: "Dress Bolo for the journey.", stall: "tailor" },
  station: { title: "Station Master", subtitle: "Hats, uniforms and more.", stall: "ticket" },
};

/**
 * ONE SHOP BEHIND TWO DOORS (mobile build 22, here build 23): the Tailor
 * sells everything, the Station Master the station pieces. The street's
 * other stalls (the ticket counter, the signal box, the chai stall) left
 * this page for doors of their own off the hub (pages/bazaar-hub.tsx); what
 * stays is the rack and the buying.
 */
export default function OutfitsPage({ door = "tailor" }: { door?: ShopDoor } = {}) {
  const queryClient = useQueryClient();
  const outfitsQuery = useGetOutfits();
  const data = outfitsQuery.data;
  const equipped = data?.equipped ?? null;
  const equippedAccessory = data?.equippedAccessory ?? null;
  const balance = data?.balance ?? 0;

  // Which item the learner is trying on. Null means "nothing being tried" —
  // the bird stands in exactly what she is wearing.
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
  // The door's own stock: the Tailor sells everything, the Station Master
  // the station pieces.
  const stock = door === "station" ? (data?.outfits ?? []).filter((o) => STATION_IDS.has(o.id)) : (data?.outfits ?? []);
  const previewedItem = data?.outfits.find((o) => o.id === previewed) ?? null;
  const previewedKind = previewedItem?.kind ?? "garment";
  const shownGarment =
    previewedItem && previewedKind === "garment" ? previewedItem.id : equipped;
  const shownAccessory =
    previewedItem && previewedKind === "accessory"
      ? previewedItem.id
      : equippedAccessory;
  const [error, setError] = useState<string | null>(null);
  /**
   * THE OUTFIT AWAITING CONFIRMATION. Chai is earned slowly and an outfit is
   * bought once, so a single mistaken tap used to spend it with no way back:
   * there is no refund and no undo. Asked for 2026-08-26, "when you purchase an
   * item in bazaar, add a confirmation popup to make sure".
   *
   * Holds the id rather than a boolean because the grid can start a purchase
   * for an outfit that is not the previewed one.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  /**
   * How many Chai short this purchase was, or null when the refusal was
   * something else. Drives the shortfall panel below.
   */
  const [shortfall, setShortfall] = useState<number | null>(null);

  const refresh = async () => {
    // The equipped outfit rides GET /tokens, so refreshing both keys is what
    // redresses every other mascot in the app.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetOutfitsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() }),
    ]);
  };

  const onError = (err: unknown) => {
    // NOT ENOUGH CHAI IS THE ONE REFUSAL WITH AN OBVIOUS NEXT STEP, so it gets
    // the packs rather than a sentence. Asked for 2026-08-25: "if they click on
    // a bazaar item they don't have enough money for, just check that it pulls
    // up the chai packages to purchase instead of just a text error." The
    // bazaar is the surface most likely to run a learner out of Chai and it was
    // still answering "that didn't go through. Give it another try", which is
    // both untrue and unhelpful: trying again cannot work.
    const short = shortfallFromSpendError(err);
    if (short !== null) {
      setError(null);
      setShortfall(short);
      return;
    }
    setError("That didn't go through. Give it another try.");
  };

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

  const allItems = stock;
  const ownedCount = allItems.filter((o) => o.owned).length;
  const rackItems = ownedOnly ? allItems.filter((o) => o.owned) : allItems;

  // The changing room. Every costume change draws the curtain, swaps the art
  // behind it and opens again once the dressed bird has actually decoded —
  // the wait is real (a first-time outfit is a fresh PNG), which is exactly
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
    // The base is the slow one — a first-time garment is a fresh PNG — and
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
    <div className="mx-auto w-full max-w-2xl px-4 pb-nav pt-4 lg:pb-12" data-testid="outfit-shop">
      {/* The door's header: back to the hub, the door's name, the Chai pill
          that opens the wallet. The balance is handed in off the catalogue
          payload so the pill and the rack cannot disagree. */}
      <BazaarHeader
        title={DOORS[door].title}
        subtitle={DOORS[door].subtitle}
        centred
        balance={balance}
        onWallet={() => setWalletOpen(true)}
      />

      {/* The shopfront; the dressing room, the filters and the rack below it
          are the door's stock. */}
      <SceneBand stall={DOORS[door].stall} />

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

      {shortfall !== null && (
        <div
          data-testid="outfit-shortfall"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Not enough Chai"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5">
            {/* LEADS WITH THE NUMBER, not with the packs: a learner four Chai
                short should see "4 more" and probably go and earn them; one
                who is sixty short is being told something useful by the size
                of the gap. Same ruling the mobile sheet carries. */}
            <p className="text-xl font-black text-foreground">
              You need {shortfall} more Chai
            </p>
            {shownOutfit && (
              <p className="mt-1 text-sm text-muted-foreground">
                for {shownOutfit.name}.
              </p>
            )}
            <div className="mt-4">
              <ChaiPackShop />
            </div>
            <button
              type="button"
              data-testid="outfit-shortfall-close"
              onClick={() => setShortfall(null)}
              className="mt-4 w-full rounded-2xl border border-border py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
            >
              Not now
            </button>
          </div>
        </div>
      )}

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
            onClick={() => setConfirming(shownOutfit.id)}
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
          doors — Try On is a free preview, Buy is the till — and the card
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
                    setConfirming(id);
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
            Back out — show my Bolo as she is
          </button>
        ) : null}
      </div>

      <ChaiWalletSheet open={walletOpen} onOpenChange={setWalletOpen} />

    {/* CONFIRM BEFORE SPENDING. Chai is earned slowly, an outfit is bought
        once and there is no refund and no undo, so a single mistaken tap
        used to be final. */}
    <AlertDialog
      open={confirming !== null}
      onOpenChange={(open) => { if (!open) setConfirming(null); }}
    >
      <AlertDialogContent data-testid="outfit-buy-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Buy {data?.outfits.find((o) => o.id === confirming)?.name ?? "this outfit"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {data?.outfits.find((o) => o.id === confirming)?.cost ?? 0} Chai, and it
            is yours for good. Chai is not refundable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            data-testid="outfit-buy-confirm-yes"
            onClick={() => {
              const id = confirming;
              setConfirming(null);
              if (id !== null) buy.mutate({ data: { outfitId: id } });
            }}
          >
            Buy it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    </div>
  );
}
