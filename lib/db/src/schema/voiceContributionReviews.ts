import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";
import { voiceContributionsTable } from "./voiceContributions";

// A SECOND SPEAKER'S VERDICT ON ONE LESSON PHRASE CLIP (2026-09-15).
//
// Owner-approved proposal: a native speaker records each lesson phrase on the
// contribution page, and "a second speaker approves each clip, because a wrong
// reference would mark learners wrong for saying it right". This is where that
// approval is stored, from the page's review mode.
//
// WHY A TABLE OF ITS OWN rather than verdict columns on voice_contributions,
// which was the first choice and was tried on paper. A column holds ONE
// verdict, so the next one overwrites it: a second reviewer's approval would
// erase a first reviewer's "not right", and a walkthrough of the page under a
// test name would erase a real reviewer's answer outright. Rows keep every
// verdict, so a disagreement is visible and a test verdict can be filtered
// without destroying the real one. Same reasoning as passage_feedback, which
// stores both answers rather than the latest.
//
// A VERDICT BELONGS TO THE BYTES IT WAS GIVEN ON. When a speaker records a
// phrase again, the clip row is updated in place (it upserts on sitting and
// prompt), and the route deletes these rows in the same transaction: an
// approval of the old take says nothing about the new one.
//
// DELETION, as on every contribution table: the reviewer's first name as
// typed, so "take my answers out" is satisfiable, and the cascade means
// deleting a speaker's clips takes the verdicts on them too.
export const voiceContributionReviewsTable = pgTable(
  "voice_contribution_reviews",
  {
    id: serial("id").primaryKey(),
    contributionId: integer("contribution_id")
      .notNull()
      .references(() => voiceContributionsTable.id, { onDelete: "cascade" }),
    // The REVIEWER's sitting, from its own browser key, deliberately not the
    // recording sitting's: on a family's shared phone the two would otherwise
    // be one id, and a reviewer's answers would join to somebody else's clips.
    sessionId: text("session_id").notNull(),
    reviewer: text("reviewer").notNull(),
    // "approved" or "rejected". Text rather than a pg enum, like
    // phrase_reports.reason, so a third answer is a code change.
    verdict: text("verdict").notNull(),
    // What is wrong, in their words. Empty when they simply approved.
    note: text("note").notNull().default(""),
    isPractice: boolean("is_practice").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // A reviewer changing their mind replaces their verdict; this says when.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // One verdict per clip per reviewing sitting. Leading on contribution_id,
    // so it also serves "the verdicts on these clips".
    clipSessionUnq: uniqueIndex("vcr_clip_session_unq").on(
      table.contributionId,
      table.sessionId,
    ),
  }),
);

export type VoiceContributionReview =
  typeof voiceContributionReviewsTable.$inferSelect;
