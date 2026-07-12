import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const phrasesTable = pgTable("phrases", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull(),
  gujaratiScript: text("gujarati_script").notNull(),
  romanized: text("romanized").notNull(),
  english: text("english").notNull(),
  hint: text("hint"),
  difficulty: integer("difficulty").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertPhraseSchema = createInsertSchema(phrasesTable).omit({
  id: true,
});
export type InsertPhrase = z.infer<typeof insertPhraseSchema>;
export type Phrase = typeof phrasesTable.$inferSelect;
