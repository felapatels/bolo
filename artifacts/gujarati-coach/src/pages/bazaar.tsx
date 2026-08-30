import { useEffect, useRef, useState } from "react";
import type React from "react";
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
import { OutfitCard, groupOutfits } from "@/components/outfit-card";
import { ChaiPackShop } from "@/components/chai-packs";
import { shortfallFromSpendError } from "@/lib/chai-errors";
import { INDIA } from "@/lib/india-palette";
import { CheckCircle2, Crown, Share2, Shirt } from "lucide-react";
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
  // The two round buttons on the scene narrow the rack to one slot; a second
  // tap on the same one lets everything back in (mobile twin: kindFilter).
  const [kindFilter, setKindFilter] = useState<"all" | "garment" | "accessory">("all");
  // The chai stall at the bottom of the street opens the wallet a learner
  // already knows, rather than a second balance surface built here.
  const [walletOpen, setWalletOpen] = useState(false);
  // The door's own stock: the Tailor sells everything, the Station Master
  // the station pieces.
  // DISJOINT RACKS (owner, build 25, with mobile): each piece has ONE home,
  // station gear with the Station Master, everything else with the Tailor.
  const stock =
    door === "station"
      ? (data?.outfits ?? []).filter((o) => STATION_IDS.has(o.id))
      : (data?.outfits ?? []).filter((o) => !STATION_IDS.has(o.id));
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
  const rackItems = (ownedOnly ? allItems.filter((o) => o.owned) : allItems).filter((o) =>
    kindFilter === "all" ? true : (o.kind ?? "garment") === kindFilter,
  );
  // What she has on right now, as catalogue rows, for the two chips and the
  // share line. Off the whole catalogue, not the door's stock: a hat bought
  // at the Station Master is still on her head at the Tailor.
  const wornGarment = data?.outfits.find((o) => o.id === equipped) ?? null;
  const wornAccessory = data?.outfits.find((o) => o.id === equippedAccessory) ?? null;

  // SHARE FLEX. The phone hands the line to the OS share sheet; a browser
  // has that only where navigator.share exists (mobile Safari, Chrome on
  // Android, some desktops), so the fallback is the clipboard and a beat of
  // "Copied" on the button. The line is the phone's, word for word.
  const [shared, setShared] = useState<"copied" | null>(null);
  const shareLook = async () => {
    const pieces = [wornGarment?.name, wornAccessory?.name].filter(Boolean);
    const line =
      pieces.length > 0 ? `My Bolo is wearing ${pieces.join(" and ")} on Bolo!` : "Come dress your Bolo on Bolo!";
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text: line });
        return;
      }
      await navigator.clipboard?.writeText(line);
      setShared("copied");
      window.setTimeout(() => setShared(null), 1800);
    } catch {
      // The learner closed the sheet; nothing to say.
    }
  };

  // The bird is sized off the painted scene she stands in, as on the phone
  // (0.58 of the scene's height), so she fills a phone's squarer band and a
  // desktop's wide one alike. Measured, because the band's height is pure
  // aspect off a width this page does not know.
  const bandRef = useRef<HTMLDivElement | null>(null);
  const [bandH, setBandH] = useState(300);
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setBandH(Math.round(h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const birdSize = Math.round(bandH * 0.58);

  // "View all" under the collected count: every filter off, and the rack
  // brought into view, which on a phone is a screen below.
  const rackRef = useRef<HTMLDivElement | null>(null);
  const viewAll = () => {
    setOwnedOnly(false);
    setKindFilter("all");
    rackRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  // NO CHANGING ROOM ANY MORE (build 24, the phone's ruling since build 22,
  // owner: "get rid of the dressing room thing"): the bird stands in the
  // tailor's own scene and a change of clothes is instant. The curtain, its
  // 1100ms beat and the PNG preload that timed it went with it.

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

      {/* YOUR FLEX (build 24; the owner's bazaar mockup of 2026-08-29, memory
          bolo-feed-and-bazaar-mockups-2026-08-29). The card the shop opens on:
          the learner's own dressed Bolo on the tailor's scene, the two slot
          buttons, what she has on as two chips, and how much of the rack is
          hers. The phone built its scene in build 22; this is that scene
          brought to web plus the card around it. NO RARITY AND NO UNLOCK
          RULES: the catalogue has neither (nothing in openapi.yaml or
          lib/outfits.ts carries them), so the honest count is owned against
          not owned and the rack below is the collection; a second grid here
          would be the duplicate CLAUDE.md warns of. Ivory card colours are
          the hub's Door, verbatim. */}
      <section
        data-testid="outfit-storefront"
        className="mt-3 overflow-hidden rounded-[18px] border-[1.5px] shadow-[0_4px_8px_rgba(43,26,18,0.12)]"
        style={{ background: "#FBF4E8", borderColor: "#E8D9BE" }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: INDIA.timber }}>
              Your flex
            </p>
            <h2 className="mt-0.5 text-lg font-black leading-tight" style={{ color: "#2B1A0E" }}>
              Looking sharp!
            </h2>
            <p className="mt-0.5 text-xs font-bold" style={{ color: "#6B5B4E" }}>
              Show off your style on the leaderboard.
            </p>
          </div>
          <button
            type="button"
            data-testid="outfit-share-look"
            aria-label="Share Bolo's look"
            onClick={shareLook}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-1.5 text-xs font-black text-foreground transition-colors hover:bg-muted"
          >
            <Share2 className="h-3.5 w-3.5" />
            {shared === "copied" ? "Copied" : "Share Flex"}
          </button>
        </div>

        {/* THE SCENE: the keeper's shop with the bird dressed, large, and the
            two slot buttons standing on it. Squarer on a phone (the phone's
            own 0.86), the band's 16:9 from sm up; the important flag beats
            SceneBand's inline aspect. */}
        <div className="px-3 pt-3">
          <div ref={bandRef}>
            <SceneBand stall={DOORS[door].stall} className="!aspect-[1/0.86] sm:!aspect-[16/9]" testId="outfit-scene">
              <div className="absolute inset-0" style={{ background: "rgba(43,26,18,0.08)" }} aria-hidden />
              <div className="absolute left-3 top-3 flex flex-col gap-2">
                <CategoryButton
                  label="Outfits"
                  active={kindFilter === "garment"}
                  onClick={() => setKindFilter((k) => (k === "garment" ? "all" : "garment"))}
                  testId="outfit-kind-garment"
                >
                  <Shirt className="h-5 w-5 text-primary" />
                </CategoryButton>
                <CategoryButton
                  label="Headwear"
                  active={kindFilter === "accessory"}
                  onClick={() => setKindFilter((k) => (k === "accessory" ? "all" : "accessory"))}
                  testId="outfit-kind-accessory"
                >
                  <Crown className="h-5 w-5 text-primary" />
                </CategoryButton>
              </div>
              {/* Preview: the learner's own Bolo, in whatever is selected.
                  Left of centre so the keeper at the scene's right shows
                  beside her. The caption names what she is trying on, under
                  her feet, so the picture says it before the rack does. */}
              <div
                data-testid="outfit-preview"
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-1.5 pl-[42px] pr-[44px]"
              >
                <Mascot pose="cheer" size={birdSize} outfit={shownGarment} accessory={shownAccessory} />
                {shownOutfit ? (
                  <span
                    className="mt-1 max-w-[200px] truncate rounded-full px-2.5 py-1 text-xs font-bold text-foreground"
                    style={{ background: "rgba(255,253,249,0.92)" }}
                  >
                    {shownOutfit.name}
                  </span>
                ) : null}
              </div>
            </SceneBand>
          </div>
        </div>

        {/* WHAT SHE HAS ON: one chip per slot. */}
        <div className="mt-3 flex gap-2.5 px-3">
          <WearingChip
            label={wornGarment?.name ?? "Nothing on"}
            worn={wornGarment !== null}
            glyph={<Shirt className="h-[15px] w-[15px]" />}
          />
          <WearingChip
            label={wornAccessory?.name ?? "Bare head"}
            worn={wornAccessory !== null}
            glyph={<Crown className="h-[15px] w-[15px]" />}
          />
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p data-testid="outfit-collected" className="text-xs font-bold" style={{ color: "#6B5B4E" }}>
            {ownedCount} of {allItems.length} items collected
          </p>
          <button
            type="button"
            data-testid="outfit-view-all"
            onClick={viewAll}
            className="text-xs font-black text-primary hover:underline"
          >
            View all
          </button>
        </div>
      </section>

      {/* THE TRY-ON, when something is picked off the rack: its name, its
          line, and the one action that fits. The bird herself is on the
          scene above, already wearing it. */}
      {previewed ? (
      <div
        data-testid="outfit-dressing-room"
        className="mt-3 rounded-2xl border border-card-border bg-card p-3"
      >
        {shownOutfit ? (
          <>
            <p className="text-base font-black text-foreground">{shownOutfit.name}</p>
            <p className="mt-0.5 text-xs font-bold text-muted-foreground">{shownOutfit.tagline}</p>
          </>
        ) : null}

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
      <div className="mt-3 flex justify-center">
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
      <div ref={rackRef} data-testid="outfit-rack" className="mt-4 space-y-5">
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

/** One of the two round slot buttons on the scene (mobile twin: CategoryButton). */
function CategoryButton({
  label,
  active,
  onClick,
  testId,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[68px] w-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] text-[11px] font-semibold text-foreground transition-colors",
        active ? "border-primary" : "border-[rgba(207,200,240,0.9)]",
      )}
      style={{ background: "rgba(255,253,249,0.94)" }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/** What one slot holds (mobile twin: WearingChip). State is a word and a
 *  tick, not a colour alone. */
function WearingChip({ label, worn, glyph }: { label: string; worn: boolean; glyph: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[14px] border border-card-border bg-card px-2 py-2">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
        style={{ backgroundColor: `${INDIA.gold}22`, color: INDIA.gold }}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-foreground">{label}</span>
        <span
          className={cn("block text-[11px] font-semibold", worn ? "" : "text-muted-foreground")}
          style={worn ? { color: "#16a34a" } : undefined}
        >
          {worn ? "Wearing" : "Empty"}
        </span>
      </span>
      {worn ? <CheckCircle2 className="h-[18px] w-[18px] shrink-0" style={{ color: "#16a34a" }} /> : null}
    </div>
  );
}
