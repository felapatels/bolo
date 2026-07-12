import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The 22 official (Eighth Schedule) Indian languages a learner can choose from.
// `code` is a short language id (ISO 639-1/3 where available). `fontFamily` is
// the CSS family the UI loads to render this language's native script, and
// `rtl` flags Perso-Arabic scripts (Urdu, Kashmiri, Sindhi) that read
// right-to-left.
export const languagesTable = pgTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(), // English name, e.g. "Hindi"
  nativeName: text("native_name").notNull(), // e.g. "हिन्दी"
  script: text("script").notNull(), // script name, e.g. "Devanagari"
  fontFamily: text("font_family").notNull(), // CSS family, e.g. "Noto Sans Devanagari"
  rtl: boolean("rtl").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertLanguageSchema = createInsertSchema(languagesTable);
export type InsertLanguage = z.infer<typeof insertLanguageSchema>;
export type Language = typeof languagesTable.$inferSelect;
