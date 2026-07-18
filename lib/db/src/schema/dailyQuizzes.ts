import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  date,
  unique,
  integer,
} from "drizzle-orm/pg-core";
import { languagesTable } from "./languages";
import { usersTable } from "./users";

// --- Question types ---------------------------------------------------------

// MCQ: see native script, pick English gloss from 4 choices.
export type McqTranslationQuestion = {
  type: "mcq_translation";
  phraseId: number;
  nativeScript: string;
  romanized: string;
  correctEnglish: string;
  distractors: string[]; // 3 wrong English glosses
};

// Listen & identify: hear audio for a phrase, pick the correct native-script
// card from 4 choices.
export type ListenIdentifyQuestion = {
  type: "listen_identify";
  phraseId: number;
  correctNativeScript: string;
  romanized: string;
  english: string;
  distractors: string[]; // 3 wrong native-script strings
};

// Order the words: rearrange 3–5 word tiles into the correct phrase.
export type OrderWordsQuestion = {
  type: "order_words";
  phraseId: number;
  nativeScript: string; // the correct answer (space-separated words)
  romanized: string;
  english: string;
  tiles: string[]; // shuffled word/token array
};

export type QuizQuestion =
  | McqTranslationQuestion
  | ListenIdentifyQuestion
  | OrderWordsQuestion;

// ---------------------------------------------------------------------------

// One row per (language, UTC date). Generated once per calendar day and shared
// across every learner so the daily quiz is a shared experience. `questions` is
// a JSON array of QuizQuestion objects (5 questions per quiz).
export const dailyQuizzesTable = pgTable(
  "daily_quizzes",
  {
    id: serial("id").primaryKey(),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    // ISO date string, e.g. "2026-07-18" (UTC).
    quizDate: date("quiz_date").notNull(),
    questions: jsonb("questions").notNull().$type<QuizQuestion[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("daily_quizzes_language_date_unique").on(t.languageCode, t.quizDate),
  ],
);

export type DailyQuiz = typeof dailyQuizzesTable.$inferSelect;

// ---------------------------------------------------------------------------

// One row per (user, language, quizDate). The unique constraint enforces a
// single submission per user per day per language — retries are rejected.
// `answers` records which option the learner selected for each question (index
// into the presented choices), so we can display the result later without
// re-running scoring logic on the client.
export const dailyQuizCompletionsTable = pgTable(
  "daily_quiz_completions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    quizDate: date("quiz_date").notNull(),
    score: integer("score").notNull(), // 0–5
    xpAwarded: integer("xp_awarded").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("daily_quiz_completions_user_language_date_unique").on(
      t.userId,
      t.languageCode,
      t.quizDate,
    ),
  ],
);

export type DailyQuizCompletion =
  typeof dailyQuizCompletionsTable.$inferSelect;
