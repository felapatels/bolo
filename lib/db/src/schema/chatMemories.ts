import {
  pgTable,
  text,
  serial,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * WHAT BOLO REMEMBERS ABOUT A LEARNER BETWEEN CONVERSATIONS.
 *
 * Asked for 2026-08-27: "does bolo remember what you said the last time to it?
 * Does it store memories and recall?" He did not. The client sent a rolling
 * three-turn window and `parrotChat` said so in a comment: no server-side chat
 * history is persisted. Close the app and Bolo had never met you.
 *
 * THIS IS NOT A TRANSCRIPT, AND THAT IS THE WHOLE DESIGN. Storing every chat
 * turn would be the obvious move and it is the wrong one on three counts:
 *  - the production database has a hard 10 GiB ceiling with tts_cache already
 *    at 98% of it, so an unbounded per-turn log is the last thing it needs;
 *  - a transcript has to be re-read and re-summarised on every turn to be
 *    useful, which is a cost per turn forever;
 *  - and the useful part of a conversation is almost never the words. It is
 *    "has a younger sister", "is learning for a trip to Ahmedabad in March",
 *    "keeps mixing up the retroflex d".
 * So this stores DISTILLED FACTS, one short sentence each, capped per learner.
 * See CHAT_MEMORY_CAP in the api-server's chatMemory lib for the ceiling and
 * why the pruning is oldest-first.
 *
 * GLOBAL PER LEARNER, NOT PER LANGUAGE. Bolo is one character, and "has a dog
 * called Rocky" is true whichever language the lesson is in. `sourceLanguage`
 * is provenance only, never a filter, so a learner who switches languages
 * keeps the bird who knows them.
 *
 * MANY OF THESE LEARNERS ARE CHILDREN, so two rules are structural rather
 * than left to a caller's good manners: the row cascades on user delete (the
 * account-deletion path must never leave orphaned notes about a child), and
 * the extraction prompt is told to record learning-relevant facts only. There
 * is no free-text memory API exposed to clients; the only writer is the
 * server's own extraction step.
 */
export const chatMemoriesTable = pgTable(
  "chat_memories",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /**
     * One short sentence in English, written in the second person ("You are
     * learning Gujarati for a family wedding"). English regardless of the
     * language being learned, because it is read by the model rather than by
     * the learner, and the persona prompt is English.
     */
    memory: text("memory").notNull(),
    /** Which language's conversation produced it. Provenance, not a filter. */
    sourceLanguage: text("source_language"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Bumped whenever this memory is loaded into a prompt, so pruning can fall
     * on what is genuinely stale rather than merely old. A fact from the first
     * week that still comes up every session should outlive last Tuesday's.
     */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_memories_user_idx").on(t.userId),
    // The extractor is told to return only NEW facts, but a model asked the
    // same question twice will eventually answer the same way, and a duplicate
    // is worse than a miss: it spends the cap and it makes Bolo repeat itself.
    // The constraint means dedup cannot depend on the prompt behaving.
    unique("chat_memories_user_memory_unique").on(t.userId, t.memory),
  ],
);

export type ChatMemory = typeof chatMemoriesTable.$inferSelect;
