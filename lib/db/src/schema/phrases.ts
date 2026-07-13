import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lessonsTable } from "./lessons";
import { languagesTable } from "./languages";
import { categoriesTable } from "./categories";

// A single phrase belonging to a lesson. `nativeScript` holds the phrase in the
// language's own script; `languageCode` and `categoryId` are denormalized from
// the parent lesson for simpler querying.
export const phrasesTable = pgTable("phrases", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessonsTable.id),
  languageCode: text("language_code")
    .notNull()
    .references(() => languagesTable.code),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  nativeScript: text("native_script").notNull(),
  romanized: text("romanized").notNull(),
  english: text("english").notNull(),
  hint: text("hint"),
  difficulty: integer("difficulty").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  // Marks a Plus-only ("premium") phrase: one beyond the free starter set that
  // only a Bolo! Plus subscriber may access. Starter phrases and phrases a
  // learner generated for themselves are false. Defaulting to false keeps the
  // Free tier's content and every pre-existing row unchanged across reseeds.
  premium: boolean("premium").notNull().default(false),
});

export const insertPhraseSchema = createInsertSchema(phrasesTable).omit({
  id: true,
});
export type InsertPhrase = z.infer<typeof insertPhraseSchema>;
export type Phrase = typeof phrasesTable.$inferSelect;
