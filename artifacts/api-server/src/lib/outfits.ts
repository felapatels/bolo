import { db, tokenLedgerTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
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
//   WHAT IS WORN is user_token_state.equipped_outfit — a mutable choice, so it
//   cannot live in an append-only ledger. Equipping an owned outfit costs
//   nothing and unequipping is a write of NULL.
//
// The catalog lives here (server-authoritative) and is served to clients, so
// no client hardcodes a price or an outfit list. Clients hold only their own
// asset maps, because Metro needs literal require() paths.
// ---------------------------------------------------------------------------

export const OUTFIT_REASON: TokenReason = "spend_outfit";

// THE CATALOGUE IS GENERATED (build 25): scripts/wardrobe/manifest.json is
// the single source, and `node scripts/wardrobe.mjs codegen` writes
// outfits.catalog.gen.ts from it. This file keeps the money and ownership
// logic; the table, the ids and their types are re-exported so every
// existing import keeps working.
export {
  OUTFIT_CATALOG,
  OUTFIT_IDS,
  type OutfitCatalogEntry,
  type OutfitId,
  type OutfitKind,
  type OutfitPreview,
  type OutfitShopDoor,
} from "./outfits.catalog.gen";
import { OUTFIT_CATALOG, OUTFIT_IDS, type OutfitId, type OutfitCatalogEntry } from "./outfits.catalog.gen";

export function isOutfitId(value: string): value is OutfitId {
  return (OUTFIT_IDS as readonly string[]).includes(value);
}

export function getOutfit(id: string): OutfitCatalogEntry | null {
  return OUTFIT_CATALOG.find((o) => o.id === id) ?? null;
}

/** `outfit:<id>` — composed server-side; never accepted from a client. */
/**
 * The price of an item, from the catalog and nowhere else. There is exactly
 * one answer to "what does this cost", so no caller can pair an id with a
 * price that disagrees with it — the reason this exists rather than a cost
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
