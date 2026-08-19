import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// GET /categories is the first screen learners see: each topic card shows a
// phraseCount and a masteredCount rolled up from the learner's attempts, plus
// the cached native title (titleNative) for the language. That roll-up walks
// attempts -> per-phrase stats (buildPhraseStats) -> per-category mastered
// totals and joins in the per-language lesson title. A regression there would
// quietly show learners the wrong "X of Y mastered" on every card with nothing
// to catch it. This drives the real Express router (behind the same stub-auth +
// loadEntitlements wiring as learning.progress.test.ts) against the live schema
// so a bad column, broken filter, or miswired join fails here.
//
// All rows are scoped to a throwaway user id + test-only language code and
// category slugs (kept distinct from the other route suites so they can share
// the live Postgres without colliding) and cleaned up after, see
// .agents/memory/api-server-tests.md.
const TEST_USER_ID = "test_categories_route";
const LANG = "__test_lang_categories";
// Distinct language with no attempts, used to prove masteredCount is scoped to
// the learner's attempts for the requested language, not global.
const OTHER_LANG = "__test_lang_categories_other";
const CATEGORY_A_SLUG = "__test_cat_categories_a";
const CATEGORY_B_SLUG = "__test_cat_categories_b";

let app: Express;
let server: Server;
let baseUrl: string;

let categoryAId: number;
let categoryBId: number;

async function seedAttempt(
  phraseId: number,
  languageCode: string,
  score: number,
): Promise<void> {
  await db.insert(attemptsTable).values({
    userId: TEST_USER_ID,
    languageCode,
    phraseId,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score,
    passed: score >= 80,
    feedback: "x",
  });
}

async function getJson(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  // These tables may not have been migrated into this database yet. Provision
  // exactly what the handler touches, mirroring the drizzle schema, so the test
  // is self-contained (see .agents/memory/api-server-tests.md).
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
    CREATE TABLE IF NOT EXISTS attempts (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      phrase_id integer,
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      transcript text NOT NULL,
      score integer NOT NULL,
      passed boolean NOT NULL,
      feedback text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
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
      CONSTRAINT lessons_language_category_unique
        UNIQUE (language_code, category_id)
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
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Categories Test" })
    .onConflictDoNothing();
  // /categories gates non-Hindi languages behind Bolo! Plus, so make the test
  // user Plus to exercise the roll-up rather than the language gate.
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER_ID));

  for (const code of [LANG, OTHER_LANG]) {
    await db
      .insert(languagesTable)
      .values({
        code,
        name: "Test Language",
        nativeName: "T",
        script: "Latin",
        fontFamily: "sans-serif",
      })
      .onConflictDoNothing();
  }

  const [categoryA] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_A_SLUG,
      title: "Topic A",
      description: "Test topic A",
      iconName: "BookOpen",
      accent: "#111111",
      sortOrder: 9001,
    })
    .returning();
  const [categoryB] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_B_SLUG,
      title: "Topic B",
      description: "Test topic B",
      iconName: "BookOpen",
      accent: "#222222",
      sortOrder: 9002,
    })
    .returning();
  categoryAId = categoryA.id;
  categoryBId = categoryB.id;

  // Category A has a cached lesson (so its titleNative should come back);
  // category B deliberately has none for this language (so titleNative is null).
  const [lessonA] = await db
    .insert(lessonsTable)
    .values({
      languageCode: LANG,
      categoryId: categoryA.id,
      titleNative: "Native A",
    })
    .returning();

  const mkPhrase = (
    lessonId: number,
    categoryId: number,
    languageCode: string,
    english: string,
    sortOrder: number,
  ) => ({
    lessonId,
    languageCode,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
  });

  // Category A (our language): 3 phrases.
  //   a: best 100 -> mastered
  //   b: best 90  -> mastered
  //   c: best 50  -> practiced, not mastered
  // => phraseCount 3, masteredCount 2.
  const catAPhrases = await db
    .insert(phrasesTable)
    .values([
      mkPhrase(lessonA.id, categoryA.id, LANG, "a", 0),
      mkPhrase(lessonA.id, categoryA.id, LANG, "b", 1),
      mkPhrase(lessonA.id, categoryA.id, LANG, "c", 2),
    ])
    .returning();

  // Category B needs a lesson row too (phrases FK -> lessons), but we place it
  // under OTHER_LANG so category B has NO lesson for LANG (titleNative null),
  // while still owning language-scoped phrases for LANG via category_id.
  const [lessonBOther] = await db
    .insert(lessonsTable)
    .values({
      languageCode: OTHER_LANG,
      categoryId: categoryB.id,
      titleNative: "Native B (other lang)",
    })
    .returning();

  // Category B (our language): 2 phrases, neither mastered.
  //   d: best 70  -> practiced, not mastered
  //   unpracticed: no attempts
  // => phraseCount 2, masteredCount 0.
  const catBPhrases = await db
    .insert(phrasesTable)
    .values([
      mkPhrase(lessonBOther.id, categoryB.id, LANG, "d", 0),
      mkPhrase(lessonBOther.id, categoryB.id, LANG, "unpracticed", 1),
    ])
    .returning();

  // A phrase in ANOTHER language under category A. It must NOT inflate category
  // A's phraseCount/masteredCount when we query LANG, even if mastered.
  const [otherLangPhrase] = await db
    .insert(phrasesTable)
    .values([
      mkPhrase(lessonBOther.id, categoryA.id, OTHER_LANG, "other", 0),
    ])
    .returning();

  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  // Category A attempts (our language).
  await seedAttempt(catAPhrases[0].id, LANG, 100); // a -> mastered
  await seedAttempt(catAPhrases[1].id, LANG, 90); // b -> mastered
  await seedAttempt(catAPhrases[1].id, LANG, 40); // b: best still 90
  await seedAttempt(catAPhrases[2].id, LANG, 50); // c -> not mastered
  // Category B attempts (our language).
  await seedAttempt(catBPhrases[0].id, LANG, 70); // d -> not mastered
  // A mastered attempt in the OTHER language on category A, must be excluded
  // from LANG's roll-up.
  await seedAttempt(otherLangPhrase.id, OTHER_LANG, 100);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  // Guard against a failure in `before` (server never started) so teardown
  // cleans up the DB and surfaces the real setup error instead of a TypeError.
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  // FK order: phrases -> lessons -> categories, then the languages + user.
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, OTHER_LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, OTHER_LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_A_SLUG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_B_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(languagesTable).where(eq(languagesTable.code, OTHER_LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("GET /categories rolls up phraseCount, masteredCount, and titleNative per topic", async () => {
  const { status, json } = await getJson(
    `/categories?lang=${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));

  // Scope assertions to our two fixture categories, the endpoint returns every
  // category in the DB, so we look ours up by id rather than asserting length.
  const byId = new Map<number, any>(json.map((c: any) => [c.id, c]));

  const a = byId.get(categoryAId);
  assert.ok(a, "category A should be present");
  assert.equal(a.slug, CATEGORY_A_SLUG);
  assert.equal(a.title, "Topic A");
  assert.equal(a.phraseCount, 3); // a, b, c in LANG (other-lang phrase excluded)
  assert.equal(a.masteredCount, 2); // a (100) + b (best 90); c (50) not mastered
  assert.equal(a.titleNative, "Native A"); // cached lesson title for LANG

  const b = byId.get(categoryBId);
  assert.ok(b, "category B should be present");
  assert.equal(b.slug, CATEGORY_B_SLUG);
  assert.equal(b.title, "Topic B");
  assert.equal(b.phraseCount, 2); // d + unpracticed
  assert.equal(b.masteredCount, 0); // d (70) not mastered, unpracticed untouched
  assert.equal(b.titleNative, null); // no lesson cached for LANG
});

test("GET /categories requires a language", async () => {
  const { status } = await getJson("/categories");
  assert.equal(status, 400);
});
