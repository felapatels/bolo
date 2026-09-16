// GET /games/story/book: the storybook's corpus lookup and its free taste.
//
// SEEDED AGAINST A SYNTHETIC LANGUAGE, not against the real corpus, and that is
// deliberate. Every number this feature was designed from was measured against
// PRODUCTION, and these tests run in the Repl Shell against DEVELOPMENT, which
// is a different and divergent database. A test asserting "Gujarati resolves
// eleven concepts" would be asserting something nobody here can see. So the
// language below carries exactly the rows each assertion needs, and the test
// says the same thing in either database.
//
// What is under test:
//   - a Free caller gets the whole Zone 1 book, without a taste limit;
//   - a Free caller gets a plain 402 on any other zone's book;
//   - a paying caller gets the whole book, premium rows included, because
//     counting free rows only NO language carries a whole book's concepts;
//   - a concept the language lacks is ABSENT, never blank, which is what feeds
//     the engine's null;
//   - "father" resolves a row that says "Dad", which is the one difference
//     between Gujarati and the other twenty-one languages;
//   - a storybook-only line fills a concept the database lacks, with a stable
//     NEGATIVE phraseId, and never displaces a real row (2026-09-16). Tested on
//     a second server built by createStoryRouter over a list for the synthetic
//     language, so the committed region list is never needed here.
//
// Rows use test-only ids and are cleaned up by them. See
// .agents/memory/api-server-tests.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  bookConcepts,
  storyBookFor,
  storyOnlyPhraseId,
  type StoryOnlyLines,
} from "@workspace/story";
import storyRouter, { createStoryRouter } from "./story";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const FREE_USER_ID = "test_story_free";
const PLUS_USER_ID = "test_story_plus";
const LANG = "__test_lang_story";
const CATEGORY_SLUG = "__test_cat_story";

let app: Express;
let server: Server;
let baseUrl: string;
let storyOnlyServer: Server;
let storyOnlyBaseUrl: string;
let categoryId: number;
let lessonId: number;
let currentUserId = FREE_USER_ID;

const tasteBook = () => storyBookFor(1, 1)!;
const paidBook = () => storyBookFor(1, 2)!;

/**
 * The one family concept deliberately left unseeded.
 *
 * WAS "spoon" UNTIL 2026-09-16, AND EVERY ASSERTION ON IT WAS VACUOUS. Spoon
 * left the family book when the books were rewritten (it is a thali concept
 * now), so the seeding filter removed nothing and "a concept the language
 * lacks is absent" passed without testing anything. Found when the story-only
 * test asked the family book for spoon and got nothing back. Grandson is in
 * the family book and not in the taste book, so the Zone 1 assertions still
 * see a complete book.
 */
const MISSING_CONCEPT = "grandson";
/** Seeded as "Dad", never as "father", which is the Gujarati case. */
const ALIASED_CONCEPT = "father";

/**
 * The storybook-only list the second server is built over. MISSING_CONCEPT is
 * the gap the database really has; `water` has real rows and a story-only line
 * both, which is the case where the database must win.
 */
const TEST_STORY_ONLY_LINES: StoryOnlyLines = {
  [LANG]: {
    [MISSING_CONCEPT]: {
      nativeScript: `story-only:${MISSING_CONCEPT}`,
      romanized: `story-only-roman:${MISSING_CONCEPT}`,
      english: MISSING_CONCEPT,
      confidence: "low",
      verified: false,
    },
    water: {
      nativeScript: "story-only:water",
      romanized: "story-only-roman:water",
      english: "water",
      confidence: "low",
      verified: false,
    },
  },
};

type BookResponse = {
  bookId: string;
  title: string;
  startId: string;
  phrases: Array<{
    concept: string;
    phraseId: number;
    nativeScript: string;
    romanized: string;
    english: string;
  }>;
  limited: boolean;
  teaserScenes: number | null;
};

async function getBook(
  journey: number,
  zone: number,
  lang: string = LANG,
  base: string = baseUrl,
): Promise<{ status: number; json: BookResponse & { error?: string } }> {
  const res = await fetch(
    `${base}/games/story/book?lang=${encodeURIComponent(lang)}&journey=${journey}&zone=${zone}`,
  );
  const json = (await res.json().catch(() => null)) as BookResponse & {
    error?: string;
  };
  return { status: res.status, json };
}

const conceptsIn = (json: BookResponse) =>
  json.phrases.map((p) => p.concept).sort();

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values([
      { id: FREE_USER_ID, email: null, displayName: "Story Free" },
      { id: PLUS_USER_ID, email: null, displayName: "Story Plus" },
    ])
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null })
    .where(eq(usersTable.id, FREE_USER_ID));
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, PLUS_USER_ID));

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Story Test Language",
      nativeName: "ST",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Story Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9403,
    })
    .returning();
  categoryId = category!.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Native ST" })
    .returning();
  lessonId = lesson!.id;

  // Every concept both books name, minus the one left out on purpose, with
  // "father" written the Gujarati way so the alias is exercised rather than
  // described.
  const wanted = [
    ...new Set([...bookConcepts(tasteBook()), ...bookConcepts(paidBook())]),
  ].filter((c) => c !== MISSING_CONCEPT);

  const rows = wanted.map((concept, i) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: `native:${concept}`,
    romanized: `roman:${concept}`,
    english: concept === ALIASED_CONCEPT ? "Dad" : concept,
    sortOrder: i + 1,
    stage: "phrase",
    premium: false,
  }));

  // One PREMIUM duplicate of a taste concept, seeded FIRST in sort order, so
  // "free row wins" is a real assertion rather than an accident of insertion.
  rows.push({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: "native:water:premium",
    romanized: "roman:water:premium",
    english: "water",
    sortOrder: 0,
    stage: "phrase",
    premium: true,
  });

  await db.insert(phrasesTable).values(rows);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(loadEntitlements);
  app.use(storyRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const storyOnlyApp = express();
  storyOnlyApp.use(express.json());
  storyOnlyApp.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  storyOnlyApp.use(loadEntitlements);
  storyOnlyApp.use(createStoryRouter(TEST_STORY_ONLY_LINES));
  storyOnlyServer = storyOnlyApp.listen(0);
  await new Promise((r) => storyOnlyServer.once("listening", r));
  storyOnlyBaseUrl = `http://127.0.0.1:${(storyOnlyServer.address() as AddressInfo).port}`;
});

after(async () => {
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, FREE_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, PLUS_USER_ID));
  server?.close();
  storyOnlyServer?.close();
  await pool.end();
});

test("a Free caller gets the complete Zone 1 book without a taste limit", async () => {
  currentUserId = FREE_USER_ID;
  const { status, json } = await getBook(1, 1);
  assert.equal(status, 200);
  assert.equal(json.limited, false);
  assert.equal(json.teaserScenes, null);
  assert.deepEqual(conceptsIn(json), bookConcepts(tasteBook()).sort());
});

test("a Free caller gets a plain 402 on any other zone", async () => {
  currentUserId = FREE_USER_ID;
  const { status, json } = await getBook(1, 2);
  assert.equal(status, 402);
  assert.equal((json as unknown as { feature: string }).feature, "storybook");
});

test("a paying caller gets the whole book, both zones", async () => {
  currentUserId = PLUS_USER_ID;
  const taste = await getBook(1, 1);
  assert.equal(taste.status, 200);
  assert.equal(taste.json.limited, false);
  assert.equal(taste.json.teaserScenes, null);
  assert.deepEqual(conceptsIn(taste.json), bookConcepts(tasteBook()).sort());

  const paid = await getBook(1, 2);
  assert.equal(paid.status, 200);
  assert.equal(paid.json.bookId, paidBook().id);
  assert.equal(paid.json.startId, paidBook().startId);
});

test("a concept the language lacks is absent, never blank", async () => {
  currentUserId = PLUS_USER_ID;
  const { json } = await getBook(1, 2);
  assert.ok(
    !json.phrases.some((p) => p.concept === MISSING_CONCEPT),
    "an unseeded concept must not come back at all",
  );
  for (const p of json.phrases) {
    assert.ok(p.nativeScript.length > 0, `${p.concept} came back blank`);
  }
});

test("father resolves a row that says Dad", async () => {
  // The one difference between Gujarati and the other twenty-one languages,
  // and without it the family book loses two of its five scenes in the language
  // the app is named after.
  currentUserId = PLUS_USER_ID;
  const { json } = await getBook(1, 2);
  const row = json.phrases.find((p) => p.concept === ALIASED_CONCEPT);
  assert.ok(row, "father must resolve through its alias");
  assert.equal(row.english, "Dad");
  assert.equal(row.nativeScript, `native:${ALIASED_CONCEPT}`);
});

test("a concept with a free row and a premium row serves the free one", async () => {
  currentUserId = PLUS_USER_ID;
  const { json } = await getBook(1, 1);
  const water = json.phrases.find((p) => p.concept === "water");
  assert.ok(water);
  // The premium duplicate sorts first by sortOrder and must still lose, or the
  // learner's own book would show a different line on a later visit.
  assert.equal(water.nativeScript, "native:water");
});

test("one row per concept, so a book reads the same way twice", async () => {
  currentUserId = PLUS_USER_ID;
  const { json } = await getBook(1, 2);
  const seen = json.phrases.map((p) => p.concept);
  assert.equal(new Set(seen).size, seen.length);
});

test("a zone with no book is a 404, and a bad lang is a 400", async () => {
  currentUserId = PLUS_USER_ID;
  // ZONE 6 WAS THE 404 CASE AND IS NOT ANY MORE. `j1z6-photograph` landed in
  // 90188187 and gave every fare zone a book, which made this assertion stale
  // the day it was written. Zone 6 is kept here as a 200 rather than dropped,
  // so a seventh book fails this loudly instead of leaving the case testing
  // nothing.
  assert.equal((await getBook(1, 6)).status, 200, "zone 6 has a book now");
  assert.equal((await getBook(1, 7)).status, 404, "zone 7 has none");
  assert.equal((await getBook(2, 1)).status, 404, "journey 2 has no books");
  assert.equal((await getBook(1, 1, "x")).status, 400);
});

test("an unknown language answers 200 with nothing in it", async () => {
  // Not an error: this is exactly the shape a language with no corpus produces,
  // and the client's job is to show no story stop rather than an error screen.
  currentUserId = PLUS_USER_ID;
  const { status, json } = await getBook(1, 1, "__test_lang_absent");
  assert.equal(status, 200);
  assert.deepEqual(json.phrases, []);
});

test("a storybook-only line fills a concept the database lacks, with a negative id", async () => {
  currentUserId = PLUS_USER_ID;
  const { status, json } = await getBook(1, 2, LANG, storyOnlyBaseUrl);
  assert.equal(status, 200);
  const filled = json.phrases.find((p) => p.concept === MISSING_CONCEPT);
  assert.ok(filled, "the story-only line must fill the gap");
  assert.equal(filled.nativeScript, `story-only:${MISSING_CONCEPT}`);
  assert.equal(filled.romanized, `story-only-roman:${MISSING_CONCEPT}`);
  assert.equal(filled.english, MISSING_CONCEPT);
  // Negative means story-only, and it is the SAME negative every time, so
  // the web audio cache keyed on it keeps working across visits.
  assert.ok(Number.isInteger(filled.phraseId) && filled.phraseId < 0);
  assert.equal(filled.phraseId, storyOnlyPhraseId(LANG, MISSING_CONCEPT));
  const again = await getBook(1, 2, LANG, storyOnlyBaseUrl);
  assert.equal(
    again.json.phrases.find((p) => p.concept === MISSING_CONCEPT)?.phraseId,
    filled.phraseId,
  );
  // Still one line per concept after the merge.
  const seen = json.phrases.map((p) => p.concept);
  assert.equal(new Set(seen).size, seen.length);
  // And the whole book now resolves, since that was the only gap.
  assert.deepEqual(conceptsIn(json), bookConcepts(paidBook()).sort());
});

test("a database row beats a storybook-only line for the same concept", async () => {
  currentUserId = PLUS_USER_ID;
  const { json } = await getBook(1, 1, LANG, storyOnlyBaseUrl);
  const water = json.phrases.find((p) => p.concept === "water");
  assert.ok(water);
  assert.equal(water.nativeScript, "native:water");
  assert.ok(water.phraseId > 0, "a real row keeps its real serial id");
  for (const p of json.phrases) {
    if (p.concept !== MISSING_CONCEPT) {
      assert.ok(p.phraseId > 0, `${p.concept} should have come from the database`);
    }
  }
});

test("the list is per language: another language gains nothing from it", async () => {
  currentUserId = PLUS_USER_ID;
  const { status, json } = await getBook(1, 1, "__test_lang_absent", storyOnlyBaseUrl);
  assert.equal(status, 200);
  assert.deepEqual(json.phrases, []);
});

test("the locked 402 is unchanged on a router with a story-only list", async () => {
  currentUserId = FREE_USER_ID;
  const { status } = await getBook(1, 2, LANG, storyOnlyBaseUrl);
  assert.equal(status, 402);
});
