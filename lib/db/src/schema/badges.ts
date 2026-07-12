import {
  pgTable,
  text,
  serial,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { languagesTable } from "./languages";

// Durable achievements a learner unlocks as they practice a given language.
// Badges are strictly per (user, language): earning a streak/mastery badge for
// Hindi does not unlock it for Tamil. The unique (user_id, language_code,
// badge_key) constraint enforces that each badge is awarded at most once per
// language, so re-meeting the criteria can never duplicate a badge or reset its
// earned date. `badgeKey` references a code-defined catalog entry (see the
// api-server badge catalog); the catalog is intentionally not stored in the DB.
export const badgesTable = pgTable(
  "badges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    badgeKey: text("badge_key").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("badges_user_language_key_unique").on(
      t.userId,
      t.languageCode,
      t.badgeKey,
    ),
  ],
);

export type Badge = typeof badgesTable.$inferSelect;
