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

// Chai stop unlocks (owner ruling, Aug 6 2026). A Free learner may buy ONE
// stop at a time in a language their plan does not include, capped to the
// first zone, the zone that already hosts the free-taste stop. This suite
// pins the money and the cap:
//   - happy path charges exactly once and opens the stop,
//   - a replayed purchase grants nothing and charges nothing,
//   - an empty tin is refused in the 409 Chai copy register,
//   - a stop OUTSIDE the first zone is refused server-side (not just hidden),
//   - a fresh client with zero local state still sees the stop open, because
//     ownership is a ledger row and nothing else.
// Live shared Postgres: test-only ids, self-provisioned tables, full cleanup.
// See .agents/memory/api-server-tests.md and docs/CODEBASE-FACTS.md section 4.
const TEST_USER_ID = "test_stop_unlock";
const POOR_USER_ID = "test_stop_unlock_poor";
const LANG = "__test_lang_stopunlock";
const OTHER_CATEGORY_SLUG = "__test_cat_stopunlock";

let app: Express;
let server: Server;
let baseUrl: string;

let greetingsId: number;
let createdGreetings = false;
let otherCategoryId: number;
let freeStopId: number; // Greetings position 1, free for everyone
let paidStopId: number; // Greetings position 2, the purchasable stop
let premiumOnlyStopId: number; // Greetings position 3, all-premium, unsellable
let secondPaidStopId: number; // Greetings position 4, a second purchasable stop
let outsideZoneStopId: number; // another zone entirely, All-Access territory

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
    .set({ tier: "free", subscriptionStatus: null })
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

  const [otherCategory] = await db
    .insert(categoriesTable)
    .values({
      slug: OTHER_CATEGORY_SLUG,
      title: "Stop Unlock Other Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#444444",
      sortOrder: 9401,
    })
    .returning();
  otherCategoryId = otherCategory!.id;

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
      { languageCode: LANG, categoryId: greetingsId, position: 2 },
      { languageCode: LANG, categoryId: greetingsId, position: 3 },
      { languageCode: LANG, categoryId: greetingsId, position: 4 },
      { languageCode: LANG, categoryId: otherCategoryId, position: 1 },
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
    mkPhrase("p1", greetingsLesson!.id, greetingsId, paidStopId, 1),
    mkPhrase("p2", greetingsLesson!.id, greetingsId, paidStopId, 2),
    // Every member is Plus-library, so there is nothing a Free learner could
    // practise here, the offer must never appear and a purchase must fail.
    mkPhrase("x1", greetingsLesson!.id, greetingsId, premiumOnlyStopId, 1, true),
    mkPhrase("q1", greetingsLesson!.id, greetingsId, secondPaidStopId, 1),
    mkPhrase("o1", otherLesson!.id, otherCategoryId, outsideZoneStopId, 1),
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
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, OTHER_CATEGORY_SLUG));
  if (createdGreetings) {
    await db.delete(categoriesTable).where(eq(categoriesTable.id, greetingsId));
  }
  await db.delete(usersTable).where(inArray(usersTable.id, users));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await pool.end();
});

// ── The offer, before any money moves ───────────────────────────────────────

test("the journey map offers the first zone's stops for Chai and prices them from the server", async () => {
  const { status, json } = await get(
    `/categories/${greetingsId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.equal(json.access, "teaser");
  assert.deepEqual(json.stopUnlock, { cost: STOP_UNLOCK_COST });

  const byId = new Map<number, any>(json.lessonGroups.map((g: any) => [g.id, g]));
  // The free stop is already open, so it is never for sale.
  assert.equal(byId.get(freeStopId)!.status, "unlocked");
  assert.ok(!("chaiUnlockable" in byId.get(freeStopId)!));
  // The next stop in the same zone is the offer.
  assert.equal(byId.get(paidStopId)!.status, "locked");
  assert.equal(byId.get(paidStopId)!.chaiUnlockable, true);
  // An all-premium stop is never offered: buying it would open an empty stop.
  assert.ok(!("chaiUnlockable" in byId.get(premiumOnlyStopId)!));
});

test("a zone beyond the first carries no offer and no price", async () => {
  const { status, json } = await get(
    `/categories/${otherCategoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.equal(json.stopUnlock, undefined);
  assert.equal(json.lessonGroups[0].status, "locked");
  assert.ok(!("chaiUnlockable" in json.lessonGroups[0]));
});

// ── Happy path ──────────────────────────────────────────────────────────────

test("happy path: 50 Chai opens the stop, exactly once, and the stop starts serving", async () => {
  const before = await balanceOf(TEST_USER_ID);
  // Locked before the purchase.
  const denied = await get(`/lesson-groups/${paidStopId}/phrases`);
  assert.equal(denied.status, 402);

  const { status, json } = await post("/tokens/unlock-stop", {
    lessonGroupId: paidStopId,
  });
  assert.equal(status, 200);
  assert.equal(json.unlocked, true);
  assert.equal(json.charged, true);
  assert.equal(json.cost, STOP_UNLOCK_COST);
  assert.equal(json.languageCode, LANG);
  assert.equal(json.lessonGroupId, paidStopId);
  assert.equal(json.balance, before - STOP_UNLOCK_COST);
  assert.equal(await balanceOf(TEST_USER_ID), before - STOP_UNLOCK_COST);

  // The purchase IS the ledger row, and the refId names language + stop.
  const rows = await unlockRows(TEST_USER_ID);
  assert.deepEqual(rows, [
    { refId: `stop:${LANG}:${paidStopId}`, delta: -STOP_UNLOCK_COST },
  ]);

  // And the stop now serves, premium-filtered, like the free first stop.
  const served = await get(`/lesson-groups/${paidStopId}/phrases`);
  assert.equal(served.status, 200);
  assert.deepEqual(
    served.json.map((p: any) => p.english),
    ["p1", "p2"],
  );
});

// ── Replay ──────────────────────────────────────────────────────────────────

test("buying the same stop again grants nothing and charges nothing", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const { status, json } = await post("/tokens/unlock-stop", {
    lessonGroupId: paidStopId,
  });
  assert.equal(status, 200);
  assert.equal(json.unlocked, true);
  assert.equal(json.charged, false, "a replay must not re-charge");
  assert.equal(json.balance, before);
  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal(
    (await unlockRows(TEST_USER_ID)).length,
    1,
    "one purchase, one ledger row",
  );
});

// ── The cap, enforced server-side ───────────────────────────────────────────

test("a stop outside the first zone is refused by the server, not just hidden", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const { status, json } = await post("/tokens/unlock-stop", {
    lessonGroupId: outsideZoneStopId,
  });
  // Not a spend rejection: past the first zone this is All-Access territory,
  // so it answers with the same upgrade envelope as every other denial.
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.upgradeRequired, true);
  assert.equal(await balanceOf(TEST_USER_ID), before, "no Chai may move");
  assert.equal((await unlockRows(TEST_USER_ID)).length, 1);

  // ...and the stop is still locked afterwards.
  const stillLocked = await get(`/lesson-groups/${outsideZoneStopId}/phrases`);
  assert.equal(stillLocked.status, 402);
});

test("the free first stop and an all-premium stop are refused as unsellable", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const free = await post("/tokens/unlock-stop", { lessonGroupId: freeStopId });
  assert.equal(free.status, 409);
  assert.equal(free.json.error, "stop_already_free");

  const empty = await post("/tokens/unlock-stop", {
    lessonGroupId: premiumOnlyStopId,
  });
  assert.equal(empty.status, 409);
  assert.equal(empty.json.error, "stop_not_unlockable");

  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal((await unlockRows(TEST_USER_ID)).length, 1);
});

// ── Empty tin ───────────────────────────────────────────────────────────────

test("an empty tin is refused in the Chai copy register (409, never 402)", async () => {
  const { status, json } = await post(
    "/tokens/unlock-stop",
    { lessonGroupId: paidStopId },
    POOR_USER_ID,
  );
  assert.equal(status, 409, "money refusals stay 409");
  assert.equal(json.error, "insufficient_tokens");
  assert.equal(json.balance, 0);
  assert.equal(json.cost, STOP_UNLOCK_COST);
  assert.equal(
    (await unlockRows(POOR_USER_ID)).length,
    0,
    "a refused purchase writes nothing",
  );
  // The refusal did not open anything either.
  const denied = await get(`/lesson-groups/${paidStopId}/phrases`, POOR_USER_ID);
  assert.equal(denied.status, 402);
});

// ── Two tins' worth of stops, one tin's worth of Chai ───────────────────────

test("concurrent purchases of two DIFFERENT stops can never overdraw the tin", async () => {
  // The ledger's unique index deduplicates a replay of the SAME stop, but two
  // different stops are two different rows: only the row lock in unlockStop
  // stops both from spending the same 50 Chai.
  await grantTokens(
    POOR_USER_ID,
    "earn_streak_day",
    "__test_stop_unlock_exact_change",
    STOP_UNLOCK_COST,
  );
  assert.equal(await balanceOf(POOR_USER_ID), STOP_UNLOCK_COST);

  const [a, b] = await Promise.all([
    post("/tokens/unlock-stop", { lessonGroupId: paidStopId }, POOR_USER_ID),
    post(
      "/tokens/unlock-stop",
      { lessonGroupId: secondPaidStopId },
      POOR_USER_ID,
    ),
  ]);

  const statuses = [a!.status, b!.status].sort();
  assert.deepEqual(statuses, [200, 409], "exactly one purchase may go through");
  const refused = [a!, b!].find((r) => r.status === 409)!;
  assert.equal(refused.json.error, "insufficient_tokens");

  const balance = await balanceOf(POOR_USER_ID);
  assert.equal(balance, 0, "the tin must land empty, never negative");
  assert.equal(
    (await unlockRows(POOR_USER_ID)).length,
    1,
    "one charge, one stop",
  );
});

// ── Reinstall survival ──────────────────────────────────────────────────────

test("the unlock survives a fresh client: ownership is read from the ledger alone", async () => {
  // A reinstalled app carries no local state whatsoever, it just asks the
  // server again. Same user, brand-new connections, nothing cached client
  // side: the stop must still be open and marked as bought.
  const map = await get(
    `/categories/${greetingsId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(map.status, 200);
  const bought = map.json.lessonGroups.find((g: any) => g.id === paidStopId);
  assert.equal(bought.status, "unlocked");
  assert.equal(bought.chaiUnlocked, true);
  assert.ok(
    !("chaiUnlockable" in bought),
    "an owned stop is not offered for sale again",
  );

  const served = await get(`/lesson-groups/${paidStopId}/phrases`);
  assert.equal(served.status, 200);
  assert.equal(served.json.length, 2);

  // Individual phrase reads (the practice screen's own fetches) pass the gate
  // too, so the purchased stop is playable and not a read-only preview.
  const phraseId = served.json[0].id as number;
  const one = await get(`/phrases/${phraseId}`);
  assert.equal(one.status, 200);
  assert.equal(one.json.english, "p1");
});
