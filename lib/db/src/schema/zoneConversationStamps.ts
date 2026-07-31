import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Idempotent record of a learner completing a zone capstone conversation with
// Bolo. One row per (user, language, zone_index). The unique constraint makes
// ON CONFLICT DO NOTHING the correct write strategy — replaying the capstone
// never double-awards XP.
export const zoneConversationStampsTable = pgTable(
  "zone_conversation_stamps",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    languageCode: text("language_code").notNull(),
    zoneIndex: integer("zone_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("zone_conversation_stamps_user_language_zone_unique").on(
      t.userId,
      t.languageCode,
      t.zoneIndex,
    ),
  ],
);

export type ZoneConversationStamp =
  typeof zoneConversationStampsTable.$inferSelect;
