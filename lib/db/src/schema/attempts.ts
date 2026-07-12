import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const attemptsTable = pgTable("attempts", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").references(() => profilesTable.id),
  phraseId: integer("phrase_id"),
  gujaratiScript: text("gujarati_script").notNull(),
  romanized: text("romanized").notNull(),
  english: text("english").notNull(),
  transcript: text("transcript").notNull(),
  score: integer("score").notNull(),
  passed: boolean("passed").notNull(),
  feedback: text("feedback").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAttemptSchema = createInsertSchema(attemptsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type Attempt = typeof attemptsTable.$inferSelect;
