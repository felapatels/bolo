import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Local mirror of the authenticated user, keyed by the Clerk user id.
// Rows are provisioned just-in-time on the first authenticated request.
// `tier` lays the groundwork for future monetization (free vs paid).
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id (e.g. "user_...")
  email: text("email"),
  displayName: text("display_name"),
  tier: text("tier").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
