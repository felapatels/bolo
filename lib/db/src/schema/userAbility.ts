import {
  pgTable,
  text,
  real,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { languagesTable } from "./languages";

// Elo-style ability estimate per (learner, language). `theta` is the learner's
// current pronunciation ability on a logit scale (0 = average, positive =
// more able); it rises on passing attempts and falls on failed ones, scaled
// by the phrase's known difficulty offset `beta` on the phrases table.
// One row per (user, language), upserted after every scored attempt.
export const userAbilityTable = pgTable(
  "user_ability",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    // Learner ability on a logit scale.
    theta: real("theta").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.languageCode] })],
);

export type UserAbility = typeof userAbilityTable.$inferSelect;
