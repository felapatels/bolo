import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Every message submitted via the "Contact Us" form.  The row is written
// before the notification email is sent; if the send fails the row stays with
// email_sent = false so nothing is silently lost.
export const contactSubmissionsTable = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  // Nullable: unauthenticated submissions are not currently possible via the
  // UI but the column stays nullable so future public forms can reuse the table.
  userId: text("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // "general" | "billing" | "technical" | "feedback" | "other"
  category: text("category").notNull(),
  message: text("message").notNull(),
  // Flipped to true after a successful Resend call; stays false if the send
  // fails or RESEND_API_KEY is absent.
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ContactSubmission =
  typeof contactSubmissionsTable.$inferSelect;
