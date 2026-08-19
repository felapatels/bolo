import { db, tokenLedgerTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  ACCESSORY_COST,
  OUTFIT_COST,
  PREMIUM_OUTFIT_COST,
  type TokenReason,
} from "./tokenEconomy";

// ---------------------------------------------------------------------------
// Bolo outfits (owner ruling, Aug 6 2026)
//
// An outfit is a Chai sink: bought once, owned forever, permanent rather than
// seasonal. Two pieces of state, deliberately stored differently:
//
//   OWNERSHIP is the ledger row. refId is `outfit:<id>`, so the ledger's
//   unique (user, reason, ref) index makes a purchase once-ever and a replay
//   free. Nothing device-side; a reinstall changes nothing.
//
//   WHAT IS WORN is user_token_state.equipped_outfit, a mutable choice, so it
//   cannot live in an append-only ledger. Equipping an owned outfit costs
//   nothing and unequipping is a write of NULL.
//
// The catalog lives here (server-authoritative) and is served to clients, so
// no client hardcodes a price or an outfit list. Clients hold only their own
// asset maps, because Metro needs literal require() paths.
// ---------------------------------------------------------------------------

export const OUTFIT_REASON: TokenReason = "spend_outfit";

export const OUTFIT_IDS = [
  "navratri",
  "kediyu",
  "anarkali",
  "kurta",
  "sherwani",
  "saree",
  "pagdi",
  "station-cap",
] as const;
export type OutfitId = (typeof OUTFIT_IDS)[number];

/**
 * A garment redresses the whole bird; an accessory adds one thing to her.
 * The distinction is not decoration, it sets the price band and tells the
 * shop how to frame the item's thumbnail (a hat is unreadable in a full-body
 * crop). Clients group the rack by this, so a new section costs nothing.
 */
export type OutfitKind = "garment" | "accessory";

/** How the shop should crop this item's preview: the whole bird, or her head. */
export type OutfitPreview = "full" | "head";

export type OutfitCatalogEntry = {
  id: OutfitId;
  name: string;
  tagline: string;
  cost: number;
  kind: OutfitKind;
  preview: OutfitPreview;
};

// Adding an item is a catalog entry here plus its five pose files on each
// client (web public/mascot/outfits/<id>/, mobile assets/images/mascot/
// outfits/<id>/). Nothing else: price, ownership, grouping and the shop's
// thumbnail all derive from this row, and a pose a client has not shipped
// falls back to canonical Bolo rather than blanking her.
//
// The pose files themselves are generated, never hand-drawn: one flat piece of
// cloth composited over Bolo's belly with her own wings and feet restacked in
// front, by scripts/gen-mascot-outfits.mjs, which records the source art and
// cut for every id here. The canonical mascot rule forbids redrawing her.
export const OUTFIT_CATALOG: readonly OutfitCatalogEntry[] = [
  {
    id: "navratri",
    name: "Navratri chaniya choli",
    tagline: "Nine nights of dancing, mirrors and all.",
    cost: OUTFIT_COST,
    kind: "garment",
    preview: "full",
  },
  {
    id: "kediyu",
    name: "Navratri kediyu",
    tagline: "Mirror-work cotton, cut for nine nights of garba.",
    cost: OUTFIT_COST,
    kind: "garment",
    preview: "full",
  },
  {
    id: "anarkali",
    name: "Diwali anarkali",
    tagline: "Magenta and gold, and it spins beautifully.",
    cost: OUTFIT_COST,
    kind: "garment",
    preview: "full",
  },
  {
    id: "kurta",
    name: "Diwali kurta",
    tagline: "Saffron cotton, a gold placket, churidar to match.",
    cost: OUTFIT_COST,
    kind: "garment",
    preview: "full",
  },
  {
    id: "sherwani",
    name: "Wedding sherwani",
    tagline: "Cream brocade and gold buttons. Baraat-ready.",
    cost: PREMIUM_OUTFIT_COST,
    kind: "garment",
    preview: "full",
  },
  {
    id: "saree",
    name: "Banarasi saree",
    tagline: "Crimson silk with a whole river of gold zari.",
    cost: PREMIUM_OUTFIT_COST,
    kind: "garment",
    preview: "full",
  },
  {
    id: "pagdi",
    name: "Marigold pagdi",
    tagline: "Marigold silk, gold zari and one peacock feather.",
    cost: ACCESSORY_COST,
    kind: "accessory",
    preview: "head",
  },
  {
    id: "station-cap",
    name: "Station master's cap",
    tagline: "Navy and red, with a little brass engine on the badge.",
    cost: ACCESSORY_COST,
    kind: "accessory",
    preview: "head",
  },
];

export function isOutfitId(value: string): value is OutfitId {
  return (OUTFIT_IDS as readonly string[]).includes(value);
}

export function getOutfit(id: string): OutfitCatalogEntry | null {
  return OUTFIT_CATALOG.find((o) => o.id === id) ?? null;
}

/** `outfit:<id>`, composed server-side; never accepted from a client. */
/**
 * The price of an item, from the catalog and nowhere else. There is exactly
 * one answer to "what does this cost", so no caller can pair an id with a
 * price that disagrees with it, the reason this exists rather than a cost
 * argument threaded through the money path.
 */
export function outfitCost(outfitId: OutfitId): number {
  const entry = OUTFIT_CATALOG.find((o) => o.id === outfitId);
  // Unreachable through the type, but this is money: refuse rather than
  // invent a price if the catalog and the id ever drift apart.
  if (!entry) throw new Error(`unknown outfit: ${outfitId}`);
  return entry.cost;
}

export function outfitRefId(outfitId: OutfitId): string {
  return `outfit:${outfitId}`;
}

export function parseOutfitRefId(refId: string): OutfitId | null {
  const rest = refId.startsWith("outfit:") ? refId.slice("outfit:".length) : null;
  return rest && isOutfitId(rest) ? rest : null;
}

/** Every outfit this learner has ever bought, read back off the ledger. */
export async function listOwnedOutfits(userId: string): Promise<OutfitId[]> {
  const rows = await db
    .select({ refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, OUTFIT_REASON),
      ),
    );
  const owned: OutfitId[] = [];
  for (const row of rows) {
    const id = parseOutfitRefId(row.refId);
    if (id && !owned.includes(id)) owned.push(id);
  }
  return owned;
}

export async function isOutfitOwned(
  userId: string,
  outfitId: OutfitId,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tokenLedgerTable.id })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, OUTFIT_REASON),
        eq(tokenLedgerTable.refId, outfitRefId(outfitId)),
      ),
    )
    .limit(1);
  return row != null;
}
