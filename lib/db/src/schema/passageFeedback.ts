import {
  pgTable,
  serial,
  text,
  boolean,
  index,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";

// What a native speaker said about the reading passage we put in front of them.
//
// WHY THIS TABLE IS THE MOST VALUABLE ONE HERE. The twelve passages were drafted
// without a speaker of each language to check them, and for Santali and Meetei
// that is a first draft rather than content. Every one of them is marked
// unverified in lib/script-trace/src/passages.ts and the build warns about it on
// every run. This table is how that gets fixed: the person reading the paragraph
// IS the expert, and they are looking right at it.
//
// BOTH VERDICTS ARE STORED, not just the complaints. A plain "yes, that reads
// fine" from someone who speaks the language is exactly the evidence that lets a
// passage be marked verified, and throwing it away would mean the passages stay
// unverified forever while the corrections pile up.
export const passageFeedbackTable = pgTable(
  "passage_feedback",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    script: text("script").notNull(),
    contributor: text("contributor").notNull(),
    passageId: text("passage_id").notNull(),
    // The exact text they were shown. Passages will be edited as feedback comes
    // in, so a verdict is meaningless without the wording it was a verdict on.
    passageText: text("passage_text").notNull(),
    // true = reads fine, false = not quite right.
    readsWell: boolean("reads_well").notNull(),
    // Why, in their words. Empty when they simply said yes.
    comment: text("comment").notNull().default(""),
    isPractice: boolean("is_practice").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // One verdict per passage per sitting; changing their mind replaces it.
    sessionPassageUnq: uniqueIndex("pf_session_passage_unq").on(
      table.sessionId,
      table.passageId,
    ),
    // The question actually asked of this table: what did people say about this
    // language's paragraph.
    passageIdx: index("pf_passage_idx").on(table.passageId),
  }),
);

export type PassageFeedback = typeof passageFeedbackTable.$inferSelect;
