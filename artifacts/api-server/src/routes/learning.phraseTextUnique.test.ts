import { test, before, after, beforeEach, mock } from "node:test";
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
  lessonGenerationsTable,
  lessonGroupsTable,
  userItemMemoryTable,
  phraseReportsTable,
  isDuplicatePhraseTextError,
  PHRASE_TEXT_UNIQUE_INDEX,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// One topic never holds the same phrase twice, enforced by the database, not
// only by the application guard. This suite covers three things:
//
//   1. the index itself: a normalized-text duplicate is rejected even when the
//      raw text differs by case or spacing, while the same text in another
//      topic or another stage is still allowed (legitimate content),
//   2. the manual "Add more phrases" path answers "nothing new to add" (an
//      empty list, HTTP 200) instead of a 502 when it fires,
//   3. the background replenisher reports zero added rather than throwing.
//
// (2) and (3) are provoked the way production would: a RACING WRITER inserts
// the phrase after the caller took its de-duplication snapshot, so the
// application guard legitimately passes and the database is the only thing
// left to catch it.

const TEST_USER_ID = "test_phrase_text_unique";
const LANG = "__test_lang_text_unique";
const LANG_OTHER = "__test_lang_text_unique_b";
const CATEGORY_SLUG = "__test_cat_text_unique";
const CATEGORY_SLUG_OTHER = "__test_cat_text_unique_b";

// What the racing writer inserts, and what the mocked model then returns.
const RACED_TEXT = "racefirst";

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;
let otherCategoryId: number;
let lessonId: number;
let otherLessonId: number;

// The mocked generator returns one phrase; individual tests swap in the racing
// implementation. Registered before the dynamic imports below so learning.ts
// and phraseReplenisher see the mock.
const mockGenerateAdditional = mock.fn(async () => [
  {
    nativeScript: "freshword",
    romanized: "freshword",
    english: "fresh",
    difficulty: 1,
  },
]);

await mock.module("../lib/lessonGenerator", {
  namedExports: {
    generateAdditionalPhrases: mockGenerateAdditional,
    generateLesson: mock.fn(async () => ({
      titleNative: "Test",
      phrases: [
        { nativeScript: "t", romanized: "t", english: "t", difficulty: 1 },
      ],
    })),
    generateSentences: mock.fn(async () => []),
  },
});

const { default: learningRouter } = await import("./learning");
const { replenishPhrases } = await import("../lib/phraseReplenisher");

// ── Helpers ─────────────────────────────────────────────────────────────────

async function tableExists(name: string): Promise<boolean> {
  const r = await pool.query("SELECT to_regclass($1) AS reg", [
    `public.${name}`,
  ]);
  return r.rows[0]?.reg !== null;
}

async function deletePhraseDependents(): Promise<void> {
  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(inArray(phrasesTable.languageCode, [LANG, LANG_OTHER]));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  if (await tableExists("user_item_memory")) {
    await db
      .delete(userItemMemoryTable)
      .where(inArray(userItemMemoryTable.phraseId, ids));
  }
  if (await tableExists("phrase_reports")) {
    await db
      .delete(phraseReportsTable)
      .where(inArray(phraseReportsTable.phraseId, ids));
  }
}

async function resetPhrases(): Promise<void> {
  await deletePhraseDependents();
  await db
    .delete(phrasesTable)
    .where(inArray(phrasesTable.languageCode, [LANG, LANG_OTHER]));
  await db.insert(phrasesTable).values(
    ["alpha", "beta", "gamma"].map((word, i) => ({
      lessonId,
      languageCode: LANG,
      categoryId,
      nativeScript: word,
      romanized: word,
      english: word,
      difficulty: 1,
      sortOrder: i,
      stage: "phrase" as const,
    })),
  );
}

async function insertPhrase(row: {
  lessonId: number;
  languageCode: string;
  categoryId: number;
  nativeScript: string;
  stage?: "phrase" | "sentence";
}): Promise<void> {
  await db.insert(phrasesTable).values({
    lessonId: row.lessonId,
    languageCode: row.languageCode,
    categoryId: row.categoryId,
    nativeScript: row.nativeScript,
    romanized: "x",
    english: "x",
    difficulty: 1,
    sortOrder: 99,
    stage: row.stage ?? "phrase",
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

before(async () => {
  await ensureUsersColumns();

  // Plus: the manual append path is a paid feature, and on a test-only
  // language a Free account is answered with an upgrade prompt long before it
  // reaches the insert this suite is about.
  await db
    .insert(usersTable)
    .values({
      id: TEST_USER_ID,
      displayName: "Phrase Text Unique",
      tier: "plus",
      subscriptionStatus: "active",
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { tier: "plus", subscriptionStatus: "active" },
    });

  for (const code of [LANG, LANG_OTHER]) {
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

  const ids: number[] = [];
  for (const slug of [CATEGORY_SLUG, CATEGORY_SLUG_OTHER]) {
    const [cat] = await db
      .insert(categoriesTable)
      .values({
        slug,
        title: "Test Topic",
        description: "Testing",
        iconName: "hash",
        accent: "#abcdef",
        sortOrder: 9997,
      })
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: { title: "Test Topic" },
      })
      .returning();
    ids.push(cat.id);
  }
  [categoryId, otherCategoryId] = ids as [number, number];

  const lessons: number[] = [];
  for (const [code, cat] of [
    [LANG, categoryId],
    [LANG, otherCategoryId],
  ] as const) {
    const [lesson] = await db
      .insert(lessonsTable)
      .values({ languageCode: code, categoryId: cat, titleNative: "Test" })
      .onConflictDoNothing()
      .returning();
    if (lesson) {
      lessons.push(lesson.id);
    } else {
      const existing = await db.query.lessonsTable.findFirst({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.languageCode, code), eqFn(t.categoryId, cat)),
      });
      lessons.push(existing!.id);
    }
  }
  [lessonId, otherLessonId] = lessons as [number, number];

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    // The real app mounts pino-http, so routes may log on their error paths, and this suite deliberately drives one of those paths.
    (req as unknown as { log: unknown }).log = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
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

beforeEach(async () => {
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  mockGenerateAdditional.mock.resetCalls();
  await resetPhrases();
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  await deletePhraseDependents();
  await db
    .delete(phrasesTable)
    .where(inArray(phrasesTable.languageCode, [LANG, LANG_OTHER]));
  await db
    .delete(lessonGroupsTable)
    .where(inArray(lessonGroupsTable.languageCode, [LANG, LANG_OTHER]));
  await db
    .delete(lessonsTable)
    .where(inArray(lessonsTable.languageCode, [LANG, LANG_OTHER]));
  await db
    .delete(categoriesTable)
    .where(inArray(categoriesTable.id, [categoryId, otherCategoryId]));
  await db
    .delete(languagesTable)
    .where(inArray(languagesTable.code, [LANG, LANG_OTHER]));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// ── The constraint itself ───────────────────────────────────────────────────

test("the database rejects a second copy of the same phrase text in one topic", async () => {
  await insertPhrase({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: "duplicand",
  });

  await assert.rejects(
    () =>
      insertPhrase({
        lessonId,
        languageCode: LANG,
        categoryId,
        nativeScript: "duplicand",
      }),
    (err: unknown) => {
      assert.ok(
        isDuplicatePhraseTextError(err),
        `expected a ${PHRASE_TEXT_UNIQUE_INDEX} violation, got: ${String(err)}`,
      );
      return true;
    },
  );
});

// The application compares normalized text (trim, lower-case, collapse
// whitespace). A constraint on the raw column would let all three of these
// through, which is exactly what a writer skipping the guard would produce.
test("case and whitespace variants count as the same phrase", async () => {
  await insertPhrase({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: "morning star",
  });

  for (const variant of ["  morning star  ", "Morning Star", "morning\tstar"]) {
    await assert.rejects(
      () =>
        insertPhrase({
          lessonId,
          languageCode: LANG,
          categoryId,
          nativeScript: variant,
        }),
      (err: unknown) => isDuplicatePhraseTextError(err),
      `variant ${JSON.stringify(variant)} must be rejected as a duplicate`,
    );
  }
});

// Same text in a different topic is legitimate content ("thank you" belongs in
// several lessons), and a sentence may reuse a word the phrase list teaches.
test("the same text is still allowed in another topic and in the other stage", async () => {
  await insertPhrase({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: "shared",
  });

  await insertPhrase({
    lessonId: otherLessonId,
    languageCode: LANG,
    categoryId: otherCategoryId,
    nativeScript: "shared",
  });
  await insertPhrase({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: "shared",
    stage: "sentence",
  });

  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.nativeScript, "shared"));
  assert.equal(rows.length, 3, "all three placements must be accepted");
});

// ── The append paths against it ─────────────────────────────────────────────

// A racing writer inserts the phrase while the model is generating, after the
// route took its de-duplication snapshot, so only the database can catch it.
// The learner tapped "Add more phrases" deliberately: they get an honest empty
// list, not an error.
test("the manual append path answers with an empty list when the constraint fires", async () => {
  mockGenerateAdditional.mock.mockImplementationOnce(async () => {
    await insertPhrase({
      lessonId,
      languageCode: LANG,
      categoryId,
      nativeScript: RACED_TEXT,
    });
    return [
      {
        nativeScript: RACED_TEXT,
        romanized: RACED_TEXT,
        english: "raced",
        difficulty: 1,
      },
    ];
  });

  const res = await fetch(
    `${baseUrl}/categories/${categoryId}/phrases/${LANG}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    },
  );

  assert.equal(res.status, 200, "a known duplicate is not a server error");
  assert.deepEqual(await res.json(), [], "nothing new was added");

  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.nativeScript, RACED_TEXT));
  assert.equal(rows.length, 1, "the topic still holds exactly one copy");
});

// Same race on the background path: it reports zero added and does not throw
// (an unhandled rejection there would take down a fire-and-forget job).
test("background replenishment reports zero added when the constraint fires", async () => {
  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: TEST_USER_ID,
    generate: async () => {
      await insertPhrase({
        lessonId,
        languageCode: LANG,
        categoryId,
        nativeScript: RACED_TEXT,
      });
      return [
        {
          nativeScript: RACED_TEXT,
          romanized: RACED_TEXT,
          english: "raced",
          difficulty: 1,
        },
      ];
    },
  });

  assert.equal(added, 0, "nothing new was added");
  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.nativeScript, RACED_TEXT));
  assert.equal(rows.length, 1, "the topic still holds exactly one copy");
});
