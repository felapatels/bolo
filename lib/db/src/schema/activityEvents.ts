import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Append-only log of social-worthy moments. Nothing reads this table yet: it
// exists first so the events are RECORDED from now on, because the moment it
// was built for cannot be reconstructed after the fact.
//
// Equipping is that moment. Ownership of an outfit is a token_ledger row and
// is recoverable forever, but what a learner is WEARING lives in two mutable
// columns on user_token_state with no timestamp and no history, so an equip
// that happened before this table existed left nothing behind at all. Train
// class, streak milestones and zone close-outs are all reconstructible later
// from token_ledger and badges, so they are deliberately not written here.
//
// Append-only: rows are never updated or deleted. Writes are best-effort and
// must never fail the action they describe.
//
// type values:
//   'equip_outfit'    — a garment was put on;   ref_id = the outfit id
//   'equip_accessory' — an accessory was put on; ref_id = the accessory id
export const activityEventsTable = pgTable(
  "activity_events",
  {
    id: serial("id").primaryKey(),
    // CASCADE, like every user-keyed table added since: the delete
    // handler carries no line for these. Shipping this as `no action`
    // in 0050 broke DELETE /account for any learner with a badge,
    // an equip or a zone closeout, and it broke 2 api suites with
    // 42 more exposed.
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Event type (see above).
    type: text("type").notNull(),
    // The subject of the event: the item id for an equip.
    refId: text("ref_id").notNull(),
    // Everything a renderer would need beyond the type and the ref. Nullable
    // because an event type may carry nothing extra.
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // The only read shape a feed has: one learner's events, newest first.
  (t) => [
    index("activity_events_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export type ActivityEvent = typeof activityEventsTable.$inferSelect;
export type InsertActivityEvent = typeof activityEventsTable.$inferInsert;
