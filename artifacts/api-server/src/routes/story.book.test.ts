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
//   - a Free caller gets the FIRST SCENE of the zone 1 book and no more,
//     flagged `limited`, rather than a 402 on a stop the map never locks;
//   - a Free caller gets a plain 402 on any other zone's book;
//   - a paying caller gets the whole book, premium rows included, because
//     counting free rows only NO language carries a whole book's concepts;
//   - a concept the language lacks is ABSENT, never blank, which is what feeds
//     the engine's null;
//   - "father" resolves a row that says "Dad", which is the one difference
//     between Gujarati and the other twenty-one languages.
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
  storyTeaserConcepts,
  STORY_TEASER_SCENES,
} from "@workspace/story";
import storyRouter from "./story";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const FREE_USER_ID = "test_story_free";
const PLUS_USER_ID = "test_story_plus";
const LANG = "__test_lang_story";
const CATEGORY_SLUG = "__test_cat_story";

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;
let lessonId: number;
let currentUserId = FREE_USER_ID;

const tasteBook = () => storyBookFor(1, 1)!;
const paidBook = () => storyBookFor(1, 2)!;

/** The one family concept deliberately left unseeded. */
const MISSING_CONCEPT = "spoon";
/** Seeded as "Dad", never as "father", which is the Gujarati case. */
const ALIASED_CONCEPT = "father";

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
): Promise<{ status: number; json: BookResponse & { error?: string } }> {
  const res = await fetch(
    `${baseUrl}/games/story/book?lang=${encodeURIComponent(lang)}&journey=${journey}&zone=${zone}`,
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
});

after(async () => {
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, FREE_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, PLUS_USER_ID));
  server?.close();
  await pool.end();
});

test("a Free caller gets the whole zone 1 book, and is told it is a taste", async () => {
  // Widened from one scene on 2026-08-24. Asserted against the CONSTANT rather
  // than a literal, because the number is a product decision that will move
  // again and this test should follow it rather than veto it. What must not
  // move quietly is `limited`: it stays true even though every scene resolves,
  // and it is the only thing telling the client to put an ask on the finished
  // book. Hardcode this to the book length and a future sixth scene silently
  // becomes free.
  currentUserId = FREE_USER_ID;
  const { status, json } = await getBook(1, 1);
  assert.equal(status, 200, "the taste must never answer 402");
  assert.equal(json.limited, true);
  assert.equal(json.teaserScenes, STORY_TEASER_SCENES);
  assert.deepEqual(conceptsIn(json), storyTeaserConcepts(tasteBook()).sort());
});

test("the taste stops at scene 1, so it cannot quietly widen", async () => {
  currentUserId = FREE_USER_ID;
  const { json } = await getBook(1, 1);
  const whole = bookConcepts(tasteBook());
  assert.ok(
    json.phrases.length < whole.length,
    "a Free caller must not receive the whole book's vocabulary",
  );
  // Named explicitly: the last scene's fitting line is the one thing the taste
  // must never hand over, because it is the end of the story.
  const ending = tasteBook().scenes.at(-1)!.choices.find((c) => c.fits)!;
  assert.ok(
    !json.phrases.some((p) => p.concept === ending.concept),
    "the ending must be behind the paywall",
  );
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
  assert.equal((await getBook(1, 6)).status, 404, "feelings has no book");
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
