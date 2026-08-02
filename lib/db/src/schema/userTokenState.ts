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
  lastAllowanceMonth: text("last_allowance_month"),
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
