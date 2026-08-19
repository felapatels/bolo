import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  pool,
  lessonsTable,
  phrasesTable,
  categoriesTable,
  languagesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateLessonPhrases } from "./learning";
import type { GeneratedLesson, LessonRequest } from "../lib/lessonGenerator";

// Exercises the lesson-generation resilience contract directly against the live
// schema, with the AI generator injected so the behavior is deterministic and no
// OpenAI call happens:
//   - a successful generation caches phrases and is reused (no re-generation),
//   - a FAILED generation caches nothing, so a later open can still succeed,
//   - a poisoned lesson row (exists but has zero phrases) is not served empty,     it triggers regeneration so the learner recovers instead of seeing a
//     permanently broken screen.
//
// Rows are scoped to a test-only language code + category and cleaned up after.
const LANG = "__test_lang_resilience";
let categoryId: number;

// A working fake generator that records how many times it was invoked, so we can
// prove caching (no second call) and recovery (a call after a failure).
function makeGenerator(): {
  generate: (req: LessonRequest) => Promise<GeneratedLesson>;
  calls: () => number;
} {
  let count = 0;
  return {
    generate: async (): Promise<GeneratedLesson> => {
      count += 1;
      return {
        titleNative: "Test Topic",
        phrases: [
          { nativeScript: "aaa", romanized: "aaa", english: "one", difficulty: 1 },
          { nativeScript: "bbb", romanized: "bbb", english: "two", difficulty: 2 },
        ],
      };
    },
    calls: () => count,
  };
}

async function clearLessonRows(): Promise<void> {
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
}

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS languages (
      code text PRIMARY KEY,
      name text NOT NULL,
      native_name text NOT NULL,
      script text NOT NULL,
      font_family text NOT NULL,
      rtl boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text NOT NULL,
      icon_name text NOT NULL,
      accent text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id serial PRIMARY KEY,
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      title_native text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lessons_language_category_unique UNIQUE (language_code, category_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phrases (
      id serial PRIMARY KEY,
      lesson_id integer NOT NULL REFERENCES lessons(id),
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      hint text,
      difficulty integer NOT NULL DEFAULT 1,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Test Language",
      nativeName: "T",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: "__test_slug_resilience",
      title: "Greetings",
      description: "Say hello",
      iconName: "hand",
      accent: "#000000",
    })
    .returning();
  categoryId = category.id;
});

beforeEach(clearLessonRows);

after(async () => {
  await clearLessonRows();
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await pool.end();
});

test("generates and caches phrases on first open, reuses them on the next", async () => {
  const gen = makeGenerator();

  const first = await getOrCreateLessonPhrases(LANG, categoryId, gen.generate);
  assert.equal(first.length, 2);
  assert.equal(gen.calls(), 1);
  assert.deepEqual(
    first.map((p) => p.english),
    ["one", "two"],
  );

  // Second open is served from the cache, the generator is NOT called again.
  const second = await getOrCreateLessonPhrases(LANG, categoryId, gen.generate);
  assert.equal(second.length, 2);
  assert.equal(gen.calls(), 1, "cached lesson must not re-generate");
});

test("a failed generation caches nothing, so a later open can succeed", async () => {
  const failing = async (): Promise<GeneratedLesson> => {
    throw new Error("AI unavailable");
  };

  await assert.rejects(
    getOrCreateLessonPhrases(LANG, categoryId, failing),
    /AI unavailable/,
  );

  // The failure must not have poisoned the cache with an empty/invalid lesson.
  const lessons = await db
    .select()
    .from(lessonsTable)
    .where(eq(lessonsTable.languageCode, LANG));
  assert.equal(lessons.length, 0, "no lesson row should be cached on failure");

  // A later open, once generation works again, succeeds and caches normally.
  const gen = makeGenerator();
  const recovered = await getOrCreateLessonPhrases(LANG, categoryId, gen.generate);
  assert.equal(recovered.length, 2);
  assert.equal(gen.calls(), 1);
});

test("a cached lesson with zero phrases is not served empty, it regenerates", async () => {
  // Simulate a poisoned entry: a lesson row exists but has no phrases (e.g. from
  // an old partial write). Opening it must recover, not return an empty lesson.
  await db.insert(lessonsTable).values({
    languageCode: LANG,
    categoryId,
    titleNative: "Poisoned",
  });

  const gen = makeGenerator();
  const phrases = await getOrCreateLessonPhrases(LANG, categoryId, gen.generate);

  assert.ok(phrases.length > 0, "empty cached lesson must not be served as-is");
  assert.equal(gen.calls(), 1, "an empty cached lesson must trigger regeneration");

  const stored = await db
    .select()
    .from(phrasesTable)
    .where(eq(phrasesTable.languageCode, LANG));
  assert.equal(stored.length, phrases.length);
});
