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
  lessonGroupProgressTable,
  phrasesTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import tokensRouter from "./tokens";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { __resetTeaserCacheForTests } from "../lib/teaser";
import { grantTokens } from "../lib/tokenService";
import { STOP_UNLOCK_COST } from "../lib/tokenEconomy";

// Zone 1 is free; Chai buys full individual stops from Zone 2 onward.
// These integration cases pin server offers, permanent content access,
// insufficient funds, replay safety, and both legacy/new purchase endpoints.
const TEST_USER_ID = "test_stop_unlock";
const POOR_USER_ID = "test_stop_unlock_poor";
const LANG = "__test_lang_stopunlock";
const OTHER_CATEGORY_SLUG = "family";

let app: Express;
let server: Server;
let baseUrl: string;

let greetingsId: number;
let createdGreetings = false;
let createdPaidCategory = false;
let otherCategoryId: number;
let freeStopId: number; // Greetings position 1 — free for everyone
let paidStopId: number; // paid category position 1 — purchasable
let premiumOnlyStopId: number; // Zone 1 cannot be sold, even if fixture phrases are premium
let secondPaidStopId: number; // paid category position 2 — purchasable
let outsideZoneStopId: number; // another paid stop

async function post(
  path: string,
  body: unknown,
  userId = TEST_USER_ID,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body; callers assert on status.
  }
  return { status: res.status, json };
}

async function get(
  path: string,
  userId = TEST_USER_ID,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": userId },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body; callers assert on status.
  }
  return { status: res.status, json };
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: userTokenStateTable.balance })
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId));
  return row?.balance ?? 0;
}

async function unlockRows(userId: string): Promise<{ refId: string; delta: number }[]> {
  return db
    .select({ refId: tokenLedgerTable.refId, delta: tokenLedgerTable.delta })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, "spend_stop_unlock"),
      ),
    );
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
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS lesson_group_id integer REFERENCES lesson_groups(id)`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS lesson_group_position integer`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'phrase'`,
  );
  await pool.query(
    `ALTER TABLE phrases ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_group_progress (
      user_id text NOT NULL REFERENCES users(id),
      lesson_group_id integer NOT NULL REFERENCES lesson_groups(id),
      status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lesson_group_progress_user_id_lesson_group_id_pk
        PRIMARY KEY (user_id, lesson_group_id)
    );
  `);

  // Both callers are Free: the whole point is a plan-locked language.
  await db
    .insert(usersTable)
    .values([
      { id: TEST_USER_ID, email: null, displayName: "Stop Unlock Test" },
      { id: POOR_USER_ID, email: null, displayName: "Empty Tin Test" },
    ])
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({
      tier: "free",
      subscriptionStatus: "active",
      chosenLanguage: null,
    })
    .where(inArray(usersTable.id, [TEST_USER_ID, POOR_USER_ID]));

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Unlockish",
      nativeName: "U",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  // The free-taste anchor is keyed off the REAL "greetings" slug
  // (lib/teaser.ts), and the unlock cap reuses that same anchor.
  const existingGreetings = await db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.slug, "greetings"),
  });
  if (existingGreetings) {
    greetingsId = existingGreetings.id;
  } else {
    const [created] = await db
      .insert(categoriesTable)
      .values({
        slug: "greetings",
        title: "Greetings & Manners",
        description: "Test-provisioned greetings",
        iconName: "Hand",
        accent: "#333333",
        sortOrder: 0,
      })
      .returning();
    greetingsId = created!.id;
    createdGreetings = true;
  }

  const existingPaidCategory = await db.query.categoriesTable.findFirst({ where: eq(categoriesTable.slug, OTHER_CATEGORY_SLUG) });
  if (existingPaidCategory) otherCategoryId = existingPaidCategory.id;
  else {
    const [created] = await db.insert(categoriesTable).values({ slug: OTHER_CATEGORY_SLUG, title: 'Family', description: 'Test-provisioned family', iconName: 'BookOpen', accent: '#444444', sortOrder: 1 }).returning();
    otherCategoryId = created!.id;
    createdPaidCategory = true;
  }

  const [greetingsLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, titleNative: "G" })
    .returning();
  const [otherLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: otherCategoryId, titleNative: "O" })
    .returning();

  const groups = await db
    .insert(lessonGroupsTable)
    .values([
      { languageCode: LANG, categoryId: greetingsId, position: 1 },
      { languageCode: LANG, categoryId: otherCategoryId, position: 1 },
      { languageCode: LANG, categoryId: greetingsId, position: 2 },
      { languageCode: LANG, categoryId: otherCategoryId, position: 2 },
      { languageCode: LANG, categoryId: otherCategoryId, position: 3 },
    ])
    .returning();
  freeStopId = groups[0]!.id;
  paidStopId = groups[1]!.id;
  premiumOnlyStopId = groups[2]!.id;
  secondPaidStopId = groups[3]!.id;
  outsideZoneStopId = groups[4]!.id;

  const mkPhrase = (
    english: string,
    lessonId: number,
    categoryId: number,
    groupId: number,
    groupPos: number,
    premium = false,
  ) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder: groupPos,
    stage: "phrase" as const,
    premium,
    lessonGroupId: groupId,
    lessonGroupPosition: groupPos,
  });

  await db.insert(phrasesTable).values([
    mkPhrase("f1", greetingsLesson!.id, greetingsId, freeStopId, 1),
    mkPhrase("f2", greetingsLesson!.id, greetingsId, freeStopId, 2),
    mkPhrase("f3", greetingsLesson!.id, greetingsId, freeStopId, 3),
    mkPhrase("p1", otherLesson!.id, otherCategoryId, paidStopId, 1, true),
    mkPhrase("p2", otherLesson!.id, otherCategoryId, paidStopId, 2, true),
    // Every member is Plus-library, so there is nothing a Free learner could
    // practise here — the offer must never appear and a purchase must fail.
    mkPhrase("x1", greetingsLesson!.id, greetingsId, premiumOnlyStopId, 1),
    mkPhrase("q1", otherLesson!.id, otherCategoryId, secondPaidStopId, 1, true),
    mkPhrase("o1", otherLesson!.id, otherCategoryId, outsideZoneStopId, 1, true),
  ]);

  // The per-language teaser cache must resolve AFTER the fixtures exist.
  __resetTeaserCacheForTests();

  await db
    .delete(tokenLedgerTable)
    .where(inArray(tokenLedgerTable.userId, [TEST_USER_ID, POOR_USER_ID]));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, [TEST_USER_ID, POOR_USER_ID]));
  // A tin with room for exactly one unlock plus change.
  await grantTokens(
    TEST_USER_ID,
    "earn_streak_day",
    "__test_stop_unlock_seed",
    STOP_UNLOCK_COST + 20,
  );

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(tokensRouter);
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
  const users = [TEST_USER_ID, POOR_USER_ID];
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, users));
  await db
    .delete(lessonGroupProgressTable)
    .where(inArray(lessonGroupProgressTable.userId, users));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, users));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, users));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  if (createdPaidCategory) await db.delete(categoriesTable).where(eq(categoriesTable.id, otherCategoryId));
  if (createdGreetings) {
    await db.delete(categoriesTable).where(eq(categoriesTable.id, greetingsId));
  }
  await db.delete(usersTable).where(inArray(usersTable.id, users));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await pool.end();
});

test("Free learners see paid-zone Chai offers but Zone 1 is never for sale", async () => {
  const first = await get(`/categories/${greetingsId}/lesson-groups/${LANG}`);
  assert.equal(first.status, 200);
  assert.equal(first.json.stopUnlock, undefined);
  assert.ok(first.json.lessonGroups.every((g: any) => !g.chaiUnlockable));
  const paid = await get(`/categories/${otherCategoryId}/lesson-groups/${LANG}`);
  assert.equal(paid.status, 200);
  assert.equal(paid.json.stopUnlock.cost, STOP_UNLOCK_COST);
  assert.ok(paid.json.lessonGroups.every((g: any) => g.chaiUnlockable && g.planLocked));
});

test("neither purchase endpoint can skip an earlier unowned stop", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const legacy = await post('/tokens/unlock-stop', { lessonGroupId: secondPaidStopId });
  const story = await post('/tokens/journey-stops/unlock', { kind: 'story', languageCode: LANG, journey: 1, zone: 2 });
  for (const result of [legacy, story]) {
    assert.equal(result.status, 409);
    assert.equal(result.json.error, 'previous_stop_required');
  }
  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal((await unlockRows(TEST_USER_ID)).length, 0);
});

test("a purchased premium lesson serves its full content and individual phrase reads", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const result = await post("/tokens/journey-stops/unlock", { kind: "lesson", languageCode: LANG, journey: 1, zone: 2, lessonGroupId: paidStopId });
  assert.equal(result.status, 200);
  assert.equal(result.json.charged, true);
  assert.equal(result.json.balance, before - STOP_UNLOCK_COST);
  const served = await get(`/lesson-groups/${paidStopId}/phrases`);
  assert.equal(served.status, 200);
  assert.deepEqual(served.json.map((p: any) => p.english), ["p1", "p2"]);
  assert.equal((await get(`/phrases/${served.json[0].id}`)).status, 200);
  const map = await get(`/categories/${otherCategoryId}/lesson-groups/${LANG}`);
  const stop = map.json.lessonGroups.find((g: any) => g.id === paidStopId);
  assert.equal(stop.chaiUnlocked, true);
  assert.equal(stop.status, "unlocked");
  assert.equal(stop.phraseCount, 2);
  assert.ok(!stop.planLocked && !stop.chaiUnlockable);
});

test("replay remains free with less than the purchase price remaining", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const result = await post("/tokens/unlock-stop", { lessonGroupId: paidStopId });
  assert.equal(result.status, 200);
  assert.equal(result.json.charged, false);
  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal((await unlockRows(TEST_USER_ID)).length, 1);
});

test("every Zone 1 stop is refused as already free", async () => {
  for (const lessonGroupId of [freeStopId, premiumOnlyStopId]) {
    const result = await post("/tokens/unlock-stop", { lessonGroupId });
    assert.equal(result.status, 409);
    assert.equal(result.json.error, "stop_already_free");
  }
});

test("insufficient funds do not grant ownership", async () => {
  const result = await post("/tokens/unlock-stop", { lessonGroupId: paidStopId }, POOR_USER_ID);
  assert.equal(result.status, 409);
  assert.equal(result.json.error, "insufficient_tokens");
  assert.equal((await unlockRows(POOR_USER_ID)).length, 0);
});

test("simultaneous different purchases cannot overdraw the wallet", async () => {
  await grantTokens(POOR_USER_ID, "earn_streak_day", "race-funds", STOP_UNLOCK_COST);
  const results = await Promise.all([paidStopId, secondPaidStopId].map(lessonGroupId => post("/tokens/unlock-stop", { lessonGroupId }, POOR_USER_ID)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(await balanceOf(POOR_USER_ID), 0);
  assert.equal((await unlockRows(POOR_USER_ID)).length, 1);
});

test("storybook purchases persist by target and concurrent replay only charges once", async () => {
  await grantTokens(TEST_USER_ID, "earn_streak_day", "story-funds", STOP_UNLOCK_COST);
  const stop = { kind: "story", languageCode: LANG, journey: 1, zone: 2 };
  const before = await balanceOf(TEST_USER_ID);
  const results = await Promise.all([post("/tokens/journey-stops/unlock", stop), post("/tokens/journey-stops/unlock", stop)]);
  assert.ok(results.every(r => r.status === 200));
  assert.equal(results.filter(r => r.json.charged).length, 1);
  assert.equal(await balanceOf(TEST_USER_ID), before - STOP_UNLOCK_COST);
  const snapshot = await get(`/tokens/journey-stops?languageCode=${LANG}`);
  assert.ok(snapshot.json.unlockedStops.some((s: any) => s.kind === "story" && s.zone === 2 && s.languageCode === LANG));
  const invalid = await post("/tokens/journey-stops/unlock", { ...stop, kind: "trace" });
  assert.equal(invalid.status, 400, "a language with no authored tracing stop cannot be charged");
});
