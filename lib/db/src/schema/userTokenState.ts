import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
// Chunk 5: one row per user, the authoritative Chai balance plus equipped
// state. Every mutation happens in the same transaction as its ledger row.
// last_allowance_month (UTC YYYY-MM) is a fast-path check only; the ledger's
// unique index is the idempotency authority for the monthly grant.
export const userTokenStateTable = pgTable("user_token_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  stationPausesEquipped: integer("station_pauses_equipped")
    .notNull()
    .default(0),
  expressMultiplierExpiresAt: timestamp("express_multiplier_expires_at", {
    withTimezone: true,
  }),
  // First Class (Chai sink, Aug 13 2026): an absolute deadline, exactly like
  // express_multiplier_expires_at above and for the same reasons — the status
  // is a wall-clock window written at spend time, so nothing has to expire it
  // and a stale client cannot extend it. Deliberately a second column rather
  // than a generic status table: the express precedent is the shape this
  // service is being built against, and one more nullable timestamp is
  // cheaper than a join every token read would have to pay.
  firstClassExpiresAt: timestamp("first_class_expires_at", {
    withTimezone: true,
  }),
  lastAllowanceMonth: text("last_allowance_month"),
  // Outfits (Chai sink, Aug 6 2026): the outfit this learner's Bolo is
  // wearing, or NULL for canonical undressed Bolo. Ownership is NOT here —
  // that is the ledger row (see api-server/src/lib/outfits.ts). This column
  // is only the choice, so equipping is free and instant and unequipping is
  // a write of NULL that loses nothing.
  equippedOutfit: text("equipped_outfit"),
  // Two slots, not one (owner ruling, Aug 8 2026): she wears a hat AND an
  // outfit at the same time. A garment covers her belly and an accessory sits
  // on her head, so they never contend for the same pixels — but they do need
  // separate columns, because a single "equipped" value can only ever hold one
  // of them and equipping either would silently take the other off.
  equippedAccessory: text("equipped_accessory"),
  // TWO-PART CLOTHING (owner ruling, Aug 31 2026): a top and a bottom worn
  // together, alongside the hat. `equipped_outfit` above stays the WHOLE-BODY
  // slot — a saree is neither a top nor a bottom — and the six garments that
  // predate this ruling keep using it untouched.
  //
  // The three body columns are mutually exclusive by rule, not by constraint:
  // wearing a whole-body piece clears these two, and wearing either of these
  // clears the whole-body one. Enforced in slotChange() in tokenService.ts,
  // which is the only writer.
  //
  // A BOTTOM WITHOUT A TOP IS NOT ALLOWED, and a top without a bottom is
  // (owner ruling, same day: "top with no bottom is fine, vice versa is not
  // fine"). She is feathered, so bare legs read as a bird; a bare chest above
  // trousers reads as a mistake. That asymmetry is a product rule, so it lives
  // in the writer rather than in a CHECK constraint no client could explain.
  equippedTop: text("equipped_top"),
  equippedBottom: text("equipped_bottom"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertUserTokenStateSchema = createInsertSchema(
  userTokenStateTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertUserTokenState = z.infer<typeof insertUserTokenStateSchema>;
export type UserTokenState = typeof userTokenStateTable.$inferSelect;
