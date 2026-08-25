import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// The reasons a learner may flag someone else's username. Text, not a pg enum,
// so adding a reason later is a code change rather than a migration. Same
// choice phrase_reports made and for the same reason.
export const USERNAME_REPORT_REASONS = [
  "offensive",
  "impersonation",
  "personal_information",
  "other",
] as const;
export type UsernameReportReason = (typeof USERNAME_REPORT_REASONS)[number];

/**
 * One row per learner report that a username is inappropriate.
 *
 * WHY THIS TABLE EXISTS BEFORE THE FEATURE DOES. Usernames become visible to
 * strangers on 2026-08-25, and Bolo teaches children. A profanity screen at
 * write time catches the obvious and nothing else: it cannot read intent, it
 * does not know local slang, and it will never catch a name that is only
 * offensive in context. A report path is the half that handles what a word
 * list cannot, and shipping the visible name without it would be shipping the
 * risk and deferring the mitigation.
 *
 * REPORTED_USERNAME IS COPIED, NOT JOINED. The whole point of a report is the
 * string that was on screen when it was made. Reading it back through the user
 * row would show whatever they have renamed themselves to since, which is
 * exactly the evidence a reviewer does not want.
 *
 * Append-only, and duplicates are allowed by design: several learners
 * reporting one name is signal, not noise, and deduplication is a review-time
 * concern. Nothing here auto-hides a name; a report is an inbox, not an
 * enforcement action. See docs and the queue owner before that changes.
 */
export const usernameReportsTable = pgTable(
  "username_reports",
  {
    id: serial("id").primaryKey(),
    // Who reported. Kept so a pattern of bad-faith reporting is visible.
    reporterId: text("reporter_id")
      .notNull()
      .references(() => usersTable.id),
    reportedUserId: text("reported_user_id")
      .notNull()
      .references(() => usersTable.id),
    /** The username AS IT STOOD when the report was made. Never re-derived. */
    reportedUsername: text("reported_username").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    /**
     * Review state: "open" until somebody looks. Nothing in the app writes
     * anything else yet; the column exists so the first reviewer does not need
     * a migration to record that they were here.
     */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The rolling-window report throttle reads this, same shape as
    // phrase_reports_user_created_idx.
    index("username_reports_reporter_created_idx").on(t.reporterId, t.createdAt),
    // "Show me everything filed against this account", which is the query a
    // reviewer actually runs.
    index("username_reports_reported_idx").on(t.reportedUserId),
    index("username_reports_status_idx").on(t.status),
  ],
);

export const insertUsernameReportSchema = createInsertSchema(
  usernameReportsTable,
).omit({ id: true, createdAt: true, status: true });
export type InsertUsernameReport = z.infer<typeof insertUsernameReportSchema>;
export type UsernameReport = typeof usernameReportsTable.$inferSelect;
