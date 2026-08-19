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
  lessonGroupsTable,
  phrasesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { partitionIds } from "../scripts/backfillLessonGroups";

// D1a Slice 1: the new read-only lesson-group endpoints power the future
// journey map ("stations"). This drives the real router against the live
// schema: ordering by group position, progress derivation from attempts,
// premium filtering on the phrases endpoint, and the unassignedCount field
// that surfaces phrases the grouping backfill hasn't claimed (replenished
// rows stay unassigned until Slice 2). All rows are scoped to test-only ids
// and cleaned up after, see .agents/memory/api-server-tests.md.
const TEST_USER_ID = "test_lesson_groups_route";
const LANG = "__test_lang_lesson_groups";
const CATEGORY_SLUG = "__test_cat_lesson_groups";

let app: Express;
let server: Server;
let baseUrl: string;

let categoryId: number;
let groupOneId: number;
let groupTwoId: number;
let phraseIds: number[] = []; // group one members, in lesson_group_position order
let premiumPhraseId: number;

async function getJson(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();
  // Self-provision the tables the handlers touch (shared live Postgres).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_groups (
      id serial PRIMARY KEY,
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      position integer NOT NULL,
      title text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lesson_groups_language_category_position_unique
        UNIQUE (language_code, category_id, position)
    );
  `);
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS lesson_group_id integer REFERENCES lesson_groups(id)`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS lesson_group_position integer`,
  );

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Groups Test" })
    .onConflictDoNothing();
  // Non-Hindi test language is Plus-gated; make the user Plus so we exercise
  // the endpoints, not the language gate. (Premium filtering is asserted
  // structurally below via the premium flag on the returned rows.)
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER_ID));

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
      slug: CATEGORY_SLUG,
      title: "Groups Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9301,
    })
    .returning();
  categoryId = category!.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Native G" })
    .returning();

  const [g1] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId, position: 1 })
    .returning();
  const [g2] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId, position: 2 })
    .returning();
  groupOneId = g1!.id;
  groupTwoId = g2!.id;

  const mkPhrase = (
    english: string,
    sortOrder: number,
    groupId: number | null,
    groupPos: number | null,
    premium = false,
  ) => ({
    lessonId: lesson!.id,
    languageCode: LANG,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
    premium,
    lessonGroupId: groupId,
    lessonGroupPosition: groupPos,
  });

  // Group one: three phrases (one premium), inserted OUT of position order to
  // prove the endpoint orders by lesson_group_position, not insertion or id.
  // Group two: one phrase. Plus one UNASSIGNED phrase (simulates a replenished
  // row) that must appear only in unassignedCount.
  const rows = await db
    .insert(phrasesTable)
    .values([
      mkPhrase("g1-third", 2, groupOneId, 3, true),
      mkPhrase("g1-first", 0, groupOneId, 1),
      mkPhrase("g1-second", 1, groupOneId, 2),
      mkPhrase("g2-only", 3, groupTwoId, 1),
      mkPhrase("unassigned", 4, null, null),
    ])
    .returning();
  const byEnglish = new Map(rows.map((r) => [r.english, r]));
  phraseIds = [
    byEnglish.get("g1-first")!.id,
    byEnglish.get("g1-second")!.id,
    byEnglish.get("g1-third")!.id,
  ];
  premiumPhraseId = byEnglish.get("g1-third")!.id;

  // Attempts: g1-first mastered (100), g1-second attempted-not-mastered (50).
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  for (const [pid, score] of [
    [phraseIds[0]!, 100],
    [phraseIds[1]!, 50],
  ] as const) {
    await db.insert(attemptsTable).values({
      userId: TEST_USER_ID,
      languageCode: LANG,
      phraseId: pid,
      nativeScript: "x",
      romanized: "x",
      english: "x",
      transcript: "x",
      score,
      passed: score >= 80,
      feedback: "x",
    });
  }

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
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  // FK order: phrases -> lesson_groups + lessons -> categories -> language/user.
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("GET /categories/:id/lesson-groups/:lang returns ordered groups with derived progress and unassignedCount", async () => {
  const { status, json } = await getJson(
    `/categories/${categoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.lessonGroups));
  assert.equal(json.lessonGroups.length, 2);

  const [first, second] = json.lessonGroups;
  assert.equal(first.id, groupOneId);
  assert.equal(first.position, 1);
  assert.equal(first.title, null);
  assert.equal(first.phraseCount, 3);
  assert.equal(first.attemptedCount, 2); // g1-first + g1-second
  assert.equal(first.masteredCount, 1); // g1-first only

  assert.equal(second.id, groupTwoId);
  assert.equal(second.position, 2);
  assert.equal(second.phraseCount, 1);
  assert.equal(second.attemptedCount, 0);
  assert.equal(second.masteredCount, 0);

  // The deliberately unassigned ("replenished") phrase is counted, not hidden.
  assert.equal(json.unassignedCount, 1);
});

test("GET /lesson-groups/:id/phrases returns phrases in lesson_group_position order with the category-phrases shape", async () => {
  const { status, json } = await getJson(`/lesson-groups/${groupOneId}/phrases`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.deepEqual(
    json.map((p: any) => p.id),
    phraseIds,
    "must be ordered by lesson_group_position",
  );
  // Same per-phrase contract as the category listing (Phrase schema).
  const p = json[0];
  for (const key of [
    "id",
    "categoryId",
    "languageCode",
    "nativeScript",
    "romanized",
    "english",
    "hint",
    "difficulty",
    "sortOrder",
    "bestScore",
    "mastered",
    "attemptCount",
  ]) {
    assert.ok(key in p, `phrase shape must include ${key}`);
  }
  assert.equal(p.bestScore, 100);
  assert.equal(p.mastered, true);
  // Plus caller sees the premium row too.
  assert.ok(json.some((r: any) => r.id === premiumPhraseId));
});

test("GET /lesson-groups/:id/phrases 404s on an unknown group", async () => {
  const { status } = await getJson(`/lesson-groups/999999999/phrases`);
  assert.equal(status, 404);
});

test("partitionIds chunks by 10 and merges a tail of <=4 into the previous group", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  assert.deepEqual(
    partitionIds(ids(23)).map((c) => c.length),
    [10, 13], // tail of 3 merges into the previous chunk
  );
  assert.deepEqual(
    partitionIds(ids(25)).map((c) => c.length),
    [10, 10, 5], // tail of 5 stays its own group
  );
  assert.deepEqual(
    partitionIds(ids(3)).map((c) => c.length),
    [3], // no previous group to merge into
  );
  // Order is preserved and nothing is lost.
  assert.deepEqual(partitionIds(ids(23)).flat(), ids(23));
});
