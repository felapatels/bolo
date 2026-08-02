import { pgTable, text, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
// Chunk 5: append-only Chai ledger, one row per earn, spend, or pause
// consumption. balance_after is denormalized for audit readability; the
// authoritative balance lives on user_token_state and both change in the
// same transaction. Idempotency is the unique (user, reason, ref) index:
// duplicate grants and duplicate spend submissions are silent no-ops.
export const tokenLedgerTable = pgTable(
  "token_ledger",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("token_ledger_user_reason_ref_idx").on(
      t.userId,
      t.reason,
      t.refId,
    ),
    index("token_ledger_user_created_idx").on(t.userId, t.createdAt),
  ],
);
export const insertTokenLedgerSchema = createInsertSchema(
  tokenLedgerTable,
).omit({ id: true, createdAt: true });
export type InsertTokenLedger = z.infer<typeof insertTokenLedgerSchema>;
export type TokenLedger = typeof tokenLedgerTable.$inferSelect;
