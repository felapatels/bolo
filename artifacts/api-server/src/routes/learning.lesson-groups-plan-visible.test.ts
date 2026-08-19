// S2 map honesty: the lesson-group LISTING reports plan-visible phrase counts
// for the caller. A group whose plan-visible count is zero (every member is
// premium and the caller lacks extended-library access) is reported locked
// with planLocked: true, so the journey map renders the Plus upsell instead
// of an unlocked station whose phrases endpoint would return 200 [].
//
// Seeded on the REAL free language (Hindi) under a test-only category so a
// Free caller exercises the allowed path, not the language-gate showroom.
// All rows are scoped to test-only ids and cleaned up by category id, never
// by languageCode, which would delete real Hindi content in the shared dev
// Postgres. See .agents/memory/api-server-tests.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  categoriesTable,
  lessonsTable,
  lessonGroupsTable,
  phrasesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const FREE_USER_ID = "test_plan_visible_free";
const PLUS_USER_ID = "test_plan_visible_plus";
const LANG = "hi"; // the free-allowed language; rows are scoped by category
const CATEGORY_SLUG = "__test_cat_plan_visible";

let app: Express;
let server: Server;
let baseUrl: string;
let currentUserId = FREE_USER_ID;

let categoryId: number;
let lessonId: number;
let groupFreeId: number; // position 1: all-free members
let groupPremiumId: number; // position 2: ALL members premium (the D1 shape)
let groupMixedId: number; // position 3: one free + one premium

async function getJson(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();
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
    .values([
      { id: FREE_USER_ID, email: null, displayName: "Plan Visible Free" },
      { id: PLUS_USER_ID, email: null, displayName: "Plan Visible Plus" },
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

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Plan Visible Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9351,
    })
    .returning();
  categoryId = category!.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Native PV" })
    .returning();
  lessonId = lesson!.id;

  const [g1] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId, position: 1 })
    .returning();
  const [g2] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId, position: 2 })
    .returning();
  const [g3] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId, position: 3 })
    .returning();
  groupFreeId = g1!.id;
  groupPremiumId = g2!.id;
  groupMixedId = g3!.id;

  const mkPhrase = (
    english: string,
    sortOrder: number,
    groupId: number,
    groupPos: number,
    premium: boolean,
  ) => ({
    lessonId,
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

  await db.insert(phrasesTable).values([
    mkPhrase("pv-g1-a", 0, groupFreeId, 1, false),
    mkPhrase("pv-g1-b", 1, groupFreeId, 2, false),
    mkPhrase("pv-g2-a", 2, groupPremiumId, 1, true),
    mkPhrase("pv-g2-b", 3, groupPremiumId, 2, true),
    mkPhrase("pv-g3-a", 4, groupMixedId, 1, false),
    mkPhrase("pv-g3-b", 5, groupMixedId, 2, true),
  ]);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
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
  // FK order: phrases -> lesson_groups + lessons -> categories -> users.
  // Scoped by categoryId, LANG is the real Hindi row and must survive.
  await db.delete(phrasesTable).where(eq(phrasesTable.categoryId, categoryId));
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.categoryId, categoryId));
  await db.delete(lessonsTable).where(eq(lessonsTable.id, lessonId));
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(usersTable).where(eq(usersTable.id, FREE_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, PLUS_USER_ID));
  await pool.end();
});

test("Free caller: an all-premium group reports planLocked with zero plan-visible phrases", async () => {
  currentUserId = FREE_USER_ID;
  const { status, json } = await getJson(
    `/categories/${categoryId}/lesson-groups/${LANG}`,
  );
  assert.equal(status, 200);
  const byId = new Map(json.lessonGroups.map((g: any) => [g.id, g]));

  const g1: any = byId.get(groupFreeId);
  assert.equal(g1.phraseCount, 2, "all-free group keeps its full count");
  assert.equal(g1.planLocked, undefined, "planLocked must be absent on a visible group");
  assert.equal(g1.status, "unlocked", "first group is boardable");

  const g2: any = byId.get(groupPremiumId);
  assert.equal(g2.phraseCount, 0, "no plan-visible phrases for a Free caller");
  assert.equal(g2.planLocked, true, "all-premium group must be planLocked");
  assert.equal(g2.status, "locked", "planLocked group must be reported locked");

  const g3: any = byId.get(groupMixedId);
  assert.equal(g3.phraseCount, 1, "mixed group counts only plan-visible phrases");
  assert.equal(g3.planLocked, undefined, "a group with visible phrases is never planLocked");
});

test("Free caller: the listing agrees with what the phrases endpoint serves", async () => {
  currentUserId = FREE_USER_ID;
  // The planLocked group's phrases endpoint returns no rows for this caller
  // (premium filter). The listing must never render such a stop boardable, that is the exact D1 defect this pins.
  const { status, json } = await getJson(`/lesson-groups/${groupFreeId}/phrases`);
  assert.equal(status, 200);
  assert.equal(json.length, 2, "the boardable group serves exactly its plan-visible phrases");
});

test("Plus caller: full counts, no planLocked anywhere (All-Access regression pin)", async () => {
  currentUserId = PLUS_USER_ID;
  const { status, json } = await getJson(
    `/categories/${categoryId}/lesson-groups/${LANG}`,
  );
  assert.equal(status, 200);
  const byId = new Map(json.lessonGroups.map((g: any) => [g.id, g]));

  for (const [gid, expectCount] of [
    [groupFreeId, 2],
    [groupPremiumId, 2],
    [groupMixedId, 2],
  ] as const) {
    const g: any = byId.get(gid);
    assert.equal(g.phraseCount, expectCount, "Plus caller sees full counts");
    assert.equal(g.planLocked, undefined, "planLocked never appears for extended-library callers");
  }
  // Progression semantics untouched for Plus: first unlocked, rest locked by
  // sequential progression (not by plan).
  assert.equal((byId.get(groupFreeId) as any).status, "unlocked");
  assert.equal((byId.get(groupPremiumId) as any).status, "locked");
});
