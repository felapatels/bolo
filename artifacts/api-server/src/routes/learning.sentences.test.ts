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
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// The Plus-only sentence stage is a topic's final step: full sentences stored
// in the phrases table with stage="sentence" and served only via
// GET /categories/:id/sentences/:lang behind the "sentences" plan feature.
// These tests pin the contract both ways:
//   - the gate: free callers get a 402 feature_locked payload, Plus callers
//     get the sentences (server-authoritative — no sentence text leaks pre-402)
//   - the split: sentence rows never bleed into the phrase endpoints or the
//     /categories phrase counts, while sentenceCount/sentencesLocked do show up
//     on the listing for both tiers.
//
// Rows are scoped to test-only ids and cleaned up after; the suite shares the
// live Postgres with the other route suites (see .agents/memory/api-server-tests.md).
const FREE_USER_ID = "test_sentences_free";
const PLUS_USER_ID = "test_sentences_plus";
const LANG = "hi"; // Hindi is the free language, so the language gate stays out of the way.
const CATEGORY_SLUG = "__test_cat_sentences";

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;

async function getJson(
  path: string,
  userId: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": userId },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();
  // Make sure the stage column exists even if this database lags migrations.
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'phrase'`,
  );

  for (const [id, name] of [
    [FREE_USER_ID, "Sentences Free"],
    [PLUS_USER_ID, "Sentences Plus"],
  ] as const) {
    await db
      .insert(usersTable)
      .values({ id, email: null, displayName: name })
      .onConflictDoNothing();
  }
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
      name: "Hindi",
      nativeName: "हिन्दी",
      script: "Devanagari",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Sentences Topic",
      description: "Test topic for the sentence stage",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9101,
    })
    .returning();
  categoryId = category.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({
      languageCode: LANG,
      categoryId,
      titleNative: "वाक्य",
    })
    .returning();

  // Two free phrases + two cached sentences under the same lesson.
  await db.insert(phrasesTable).values([
    {
      lessonId: lesson.id,
      languageCode: LANG,
      categoryId,
      nativeScript: "फ़्रेज़ एक",
      romanized: "phrase ek",
      english: "phrase one",
      sortOrder: 0,
      premium: false,
      stage: "phrase",
    },
    {
      lessonId: lesson.id,
      languageCode: LANG,
      categoryId,
      nativeScript: "फ़्रेज़ दो",
      romanized: "phrase do",
      english: "phrase two",
      sortOrder: 1,
      premium: false,
      stage: "phrase",
    },
    {
      lessonId: lesson.id,
      languageCode: LANG,
      categoryId,
      nativeScript: "यह पहला पूरा वाक्य है।",
      romanized: "yah pahla poora vakya hai.",
      english: "This is the first full sentence.",
      sortOrder: 0,
      premium: true,
      stage: "sentence",
    },
    {
      lessonId: lesson.id,
      languageCode: LANG,
      categoryId,
      nativeScript: "यह दूसरा पूरा वाक्य है।",
      romanized: "yah doosra poora vakya hai.",
      english: "This is the second full sentence.",
      sortOrder: 1,
      premium: true,
      stage: "sentence",
    },
  ]);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = String(
      req.headers["x-test-user"] ?? FREE_USER_ID,
    );
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
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await db.delete(phrasesTable).where(eq(phrasesTable.categoryId, categoryId));
  await db.delete(lessonsTable).where(eq(lessonsTable.categoryId, categoryId));
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(usersTable).where(eq(usersTable.id, FREE_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, PLUS_USER_ID));
  await pool.end();
});

test("free caller gets 402 feature_locked when every cached sentence is premium", async () => {
  const { status, json } = await getJson(
    `/categories/${categoryId}/sentences/${LANG}`,
    FREE_USER_ID,
  );
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.reason, "feature_locked");
  assert.ok(!JSON.stringify(json).includes("पूरा वाक्य"));
});

test("free caller gets non-premium cached sentences; premium rows never ride along", async () => {
  // The two seeded sentence rows are premium — that is the byte-identical
  // 402 pinned above. Add a free sentence row (free-tier content policy:
  // Hindi Fare Zone 1 sentence stops are non-premium): the same caller now
  // gets exactly that row, with no premium text leaking.
  const lesson = await db.query.lessonsTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.categoryId, categoryId),
  });
  assert.ok(lesson);
  const [freeRow] = await db
    .insert(phrasesTable)
    .values({
      lessonId: lesson.id,
      languageCode: LANG,
      categoryId,
      nativeScript: "यह मुफ़्त वाक्य है।",
      romanized: "yah muft vakya hai.",
      english: "This is the free full sentence.",
      sortOrder: 2,
      premium: false,
      stage: "sentence",
    })
    .returning();
  try {
    const { status, json } = await getJson(
      `/categories/${categoryId}/sentences/${LANG}`,
      FREE_USER_ID,
    );
    assert.equal(status, 200);
    assert.deepEqual(
      json.map((r: any) => r.id),
      [freeRow.id],
    );
    assert.ok(!JSON.stringify(json).includes("पूरा वाक्य"));
  } finally {
    await db.delete(phrasesTable).where(eq(phrasesTable.id, freeRow.id));
  }
});

test("Plus caller gets the cached sentences in order", async () => {
  const { status, json } = await getJson(
    `/categories/${categoryId}/sentences/${LANG}`,
    PLUS_USER_ID,
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.equal(json.length, 2);
  assert.equal(json[0].english, "This is the first full sentence.");
  assert.equal(json[1].english, "This is the second full sentence.");
  // Same serialized shape as phrases (stats fields present).
  assert.ok("mastered" in json[0]);
  assert.ok("bestScore" in json[0]);
});

test("sentence rows never bleed into the phrase list", async () => {
  for (const userId of [FREE_USER_ID, PLUS_USER_ID]) {
    const { status, json } = await getJson(
      `/categories/${categoryId}/phrases/${LANG}`,
      userId,
    );
    assert.equal(status, 200);
    assert.equal(json.length, 2, `phrase list for ${userId}`);
    for (const p of json) {
      assert.ok(p.english.startsWith("phrase"), p.english);
    }
  }
});

test("/categories reports sentenceCount and a tier-dependent sentencesLocked", async () => {
  const free = await getJson(`/categories?lang=${LANG}`, FREE_USER_ID);
  assert.equal(free.status, 200);
  const freeCat = free.json.find((c: any) => c.id === categoryId);
  assert.ok(freeCat);
  assert.equal(freeCat.phraseCount, 2); // sentences excluded
  assert.equal(freeCat.sentenceCount, 2);
  assert.equal(freeCat.sentencesLocked, true);

  const plus = await getJson(`/categories?lang=${LANG}`, PLUS_USER_ID);
  assert.equal(plus.status, 200);
  const plusCat = plus.json.find((c: any) => c.id === categoryId);
  assert.ok(plusCat);
  assert.equal(plusCat.phraseCount, 2);
  assert.equal(plusCat.sentenceCount, 2);
  assert.equal(plusCat.sentencesLocked, false);
});

test("sentences endpoint 404s for unknown category or language", async () => {
  const badCat = await getJson(
    `/categories/999999/sentences/${LANG}`,
    PLUS_USER_ID,
  );
  assert.equal(badCat.status, 404);
  const badLang = await getJson(
    `/categories/${categoryId}/sentences/__nope`,
    PLUS_USER_ID,
  );
  assert.equal(badLang.status, 404);
});
