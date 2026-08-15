import { Check } from "lucide-react";
import { ChaiGlyph } from "@/components/chai-stall";
import { mascotAssetSrc } from "@/lib/mascot-outfits";
import { INDIA } from "@/lib/india-palette";
import { cn } from "@/lib/utils";

// One bolt of cloth on the bazaar's rack.
//
// The rack is built to GROW. Everything a card needs — its price, whether it
// is a garment or an accessory, and how to frame its picture — rides on the
// catalog row from the server, so stocking a new item is a server entry plus
// five pose files. No client learns its name.
//
// The thumbnail is deliberately NOT a separate piece of art. It is the item
// on Bolo, drawn from the same pose files the shop already ships, so an item
// can never have a preview that disagrees with what the learner gets. That
// also means a new item costs zero extra assets.

export type RackOutfit = {
  id: string;
  name: string;
  tagline: string;
  cost: number;
  owned: boolean;
  /** "garment" | "accessory" — older payloads may omit it. */
  kind?: string | null;
  /** "full" | "head" — how to crop the thumbnail. */
  preview?: string | null;
};

/** Rack sections, in the order the shop shows them. */
export const RACK_SECTIONS: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: "garment", label: "Outfits" },
  { kind: "accessory", label: "Accessories" },
];

/**
 * Group the catalog into the sections above. An item whose kind the client
 * does not recognise (a newer server, an older app) is not dropped on the
 * floor — it falls into the first section, so unknown stock is still
 * shoppable.
 */
export function groupOutfits<T extends RackOutfit>(
  outfits: readonly T[],
): Array<{ kind: string; label: string; items: T[] }> {
  const known = new Set(RACK_SECTIONS.map((s) => s.kind));
  return RACK_SECTIONS.map((section, index) => ({
    ...section,
    items: outfits.filter((o) => {
      const kind = o.kind ?? "";
      return known.has(kind) ? kind === section.kind : index === 0;
    }),
  })).filter((section) => section.items.length > 0);
}

/**
 * The item, worn, cropped to where it actually is. A pagdi in a full-body
 * crop is a few unreadable pixels, so accessories zoom to the head — the
 * catalog says which, because only the catalog knows what the item is.
 */
export function OutfitThumb({
  outfitId,
  preview,
  className,
}: {
  outfitId: string;
  preview?: string | null;
  className?: string;
}) {
  const head = preview === "head";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-xl",
        className,
      )}
      style={{ background: INDIA.cloth }}
    >
      <img
        src={mascotAssetSrc("wave", outfitId)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
        // The wave master frames the bird identically for every item, so one
        // origin works for all of them: zoom about her head for accessories,
        // and show the whole bird for a garment.
        style={
          head
            ? { transform: "scale(2.3)", transformOrigin: "53% 26%" }
            : { transform: "scale(1.04)" }
        }
      />
    </div>
  );
}

export function OutfitCard({
  outfit,
  isShown,
  isWorn,
  busy,
  onTryOn,
  onBuy,
  onEquip,
}: {
  outfit: RackOutfit;
  isShown: boolean;
  isWorn: boolean;
  busy: boolean;
  onTryOn: (id: string) => void;
  onBuy: (id: string) => void;
  /**
   * Taking something off has to say WHICH slot: with a hat and an outfit worn
   * together, a bare "equip null" would undress the bird completely.
   */
  onEquip: (id: string | null, slot: string) => void;
}) {
  return (
    // A row, not a tile. The bazaar is a street of stalls whose goods are
    // listed underneath them, and the tailor's stock reads the same way as
    // the ticket counter's and the signal box's: picture, name, one button.
    // The row itself is the try-on, so the separate Try On button is gone.
    <div
      data-testid={`outfit-card-${outfit.id}`}
      onClick={() => onTryOn(outfit.id)}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-4 transition-colors",
        isShown
          ? "border-primary"
          : "border-card-border hover:border-primary/40",
      )}
    >
      <div className="h-14 w-14 shrink-0">
        <OutfitThumb outfitId={outfit.id} preview={outfit.preview} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black text-foreground">{outfit.name}</p>
        <p className="text-xs leading-snug text-muted-foreground">
          {outfit.tagline}
        </p>
        {outfit.owned ? (
          <p
            className="mt-1 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider"
            style={{ color: INDIA.board }}
          >
            <Check className="h-3 w-3" />
            {isWorn ? "Wearing" : "Owned"}
          </p>
        ) : null}
      </div>
      {outfit.owned ? (
        <button
          type="button"
          disabled={busy}
          data-testid={
            isWorn ? `outfit-takeoff-${outfit.id}` : `outfit-wear-${outfit.id}`
          }
          onClick={(e) => {
            e.stopPropagation();
            onEquip(isWorn ? null : outfit.id, outfit.kind ?? "garment");
          }}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-[0_4px_0_hsl(var(--primary-shadow))] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          {isWorn ? "Take it off" : "Dress Bolo"}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          data-testid={`outfit-buynow-${outfit.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onBuy(outfit.id);
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition-all active:translate-y-1 active:shadow-none disabled:opacity-50"
          style={{
            backgroundImage: `linear-gradient(180deg, #1E7357 0%, ${INDIA.board} 58%, #103F31 100%)`,
            color: INDIA.cream,
            boxShadow: `0 4px 0 ${INDIA.boardDeep}, inset 0 1px 0 rgba(255,247,234,0.35)`,
          }}
        >
          <span>Buy · {outfit.cost}</span>
          <ChaiGlyph className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
