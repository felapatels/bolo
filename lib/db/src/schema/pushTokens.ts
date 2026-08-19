import {
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Devices the server may push to.
//
// Distinct from the LOCAL reminders in bolo-mobile/lib/reminders.ts, which the
// phone schedules for itself and which need no server at all. This table is for
// the messages only the server knows to send: a friend passing you on the
// leaderboard, a family invite accepted, a streak about to lapse.
//
// UNIQUE ON THE TOKEN, not on (user, token). A push token identifies a device
// installation, and a device can be handed to a different account: a shared
// family iPad, a phone signed out and back in as someone else. If the same
// token could sit under two users, both would receive the other's messages, so
// registering a token MOVES it rather than adding a row.
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // The Expo push token, "ExponentPushToken[xxxxxxxx]". Expo's service fans
    // out to APNs and FCM, so no APNs key lives in this codebase.
    token: text("token").notNull(),
    // "ios" or "android". Kept so a send can be scoped to one platform when a
    // message only makes sense on one.
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Refreshed every time the device re-registers, which the app does on each
    // cold start. A token nobody has refreshed in months is a dead install.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when Expo answers DeviceNotRegistered. The row is kept rather than
    // deleted so a later re-register can revive it and so the graveyard is
    // auditable: silently vanishing rows make a delivery problem unprovable.
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [
    unique("push_tokens_token_unique").on(t.token),
    // Every send starts "who do I push to", so the lookup is by user.
    index("push_tokens_user_idx").on(t.userId),
  ],
);

export type PushToken = typeof pushTokensTable.$inferSelect;
export type NewPushToken = typeof pushTokensTable.$inferInsert;
