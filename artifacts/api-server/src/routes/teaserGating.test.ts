import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  badgesTable,
  lessonGroupProgressTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  lessonGroupsTable,
  phrasesTable,
  userAbilityTable,
  userItemMemoryTable,
  xpLedgerTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { signEvaluation } from "../lib/evaluationToken";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { __resetTeaserCacheForTests, TEASER_LIMIT } from "../lib/teaser";
import { FREE_LANGUAGE } from "../lib/entitlements";

// M1 language teaser: drives the three-state access model (allowed / teaser /
// exhausted) end to end through the real Express routers. A Free user in a
// locked language may reach exactly the first TEASER_LIMIT phrase-stage
// phrases of the first Greetings lesson group; attempting all of them flips
// every locked-language surface to the distinguishable teaser_exhausted 402.
// Consumption is DERIVED from the attempts table, so "lifetime persistence"
// is proven by the state surviving with no session/server-side cache at all.
//
// Rows are scoped to a throwaway user + a test-only language. The real seeded
// "greetings" category row is reused (created if absent) since the teaser set
// is keyed off its slug; only this test's language rows hang off it.
const TEST_USER_ID = "test_teaser_gating";
const LANG = "__test_lang_teaser";

let app: Express;
let server: Server;
let baseUrl: string;
let greetingsId: number;
let otherCategoryId: number;
const OTHER_CATEGORY_SLUG = "__test_cat_teaser_other";

// Fixture group ids (group 1 hosts the teaser set = the "taste station").
let group1Id: number;
let group2Id: number;

// Fixture phrase ids.
let teaserIds: number[]; // the 3 canonical teaser phrases, in position order
let fourthPhraseId: number; // group 1, position 4 — never teaser-accessible
let sentencePhraseId: number; // sentence-stage row in group 1 — excluded
let group2PhraseId: number; // first phrase of group 2 — never teaser-accessible
let otherCategoryPhraseId: number; // phrase in a non-Greetings category

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function tokenFor(phraseId: number | null, score: number) {
  return signEvaluation({
    userId: TEST_USER_ID,
    phraseId,
    // Non-zero XP so the ledger write runs — proves the full pipeline (the
    // route only writes xp_ledger when the signed claims award XP).
    xpAwarded: 5,
    languageCode: LANG,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score,
    passed: score >= 80,
    feedback: "x",
  });
}

async function postAttempt(
  phraseId: number | null,
  score: number,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ evaluationToken: tokenFor(phraseId, score) }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function clearUserRows(): Promise<void> {
  await db
    .delete(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, TEST_USER_ID));
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  await db.delete(userAbilityTable).where(eq(userAbilityTable.userId, TEST_USER_ID));
  await db.delete(userItemMemoryTable).where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
}

before(async () => {
  await ensureUsersColumns();
  assert.ok(
    process.env.SESSION_SECRET,
    "SESSION_SECRET must be set to sign/verify evaluation tokens",
  );

  // lesson_groups may not exist in a lagging dev DB; provision it (mirrors the
  // drizzle schema, see .agents/memory/api-server-tests.md).
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
  // The entitled-path tests run the sequential-unlock guard, which reads (and
  // may latch into) lesson_group_progress; provision it like the showroom
  // suite does (shared live Postgres may lag committed migrations).
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

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: "teaser@test.local" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values([
      { code: LANG, name: "Teaserish", nativeName: "T", script: "Latin", fontFamily: "x" },
      { code: FREE_LANGUAGE, name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", fontFamily: "x" },
    ])
    .onConflictDoNothing();

  // The teaser set is keyed off the real "greetings" slug.
  const existingGreetings = await db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.slug, "greetings"),
  });
  if (existingGreetings) {
    greetingsId = existingGreetings.id;
  } else {
    const [row] = await db
      .insert(categoriesTable)
      .values({ slug: "greetings", title: "Greetings & Manners", description: "x", iconName: "HandHeart", accent: "#fff" })
      .returning();
    greetingsId = row.id;
  }
  const [otherCat] = await db
    .insert(categoriesTable)
    .values({ slug: OTHER_CATEGORY_SLUG, title: "Other", description: "x", iconName: "Hash", accent: "#fff" })
    .onConflictDoUpdate({ target: categoriesTable.slug, set: { title: "Other" } })
    .returning();
  otherCategoryId = otherCat.id;

  // Lessons (phrases.lesson_id is NOT NULL in the provisioned schema).
  const [greetLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, titleNative: "x" })
    .returning();
  const [otherLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: otherCategoryId, titleNative: "x" })
    .returning();

  // Two Greetings groups; the teaser must come only from the FIRST by position.
  const [group1] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, position: 1 })
    .returning();
  const [group2] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, position: 2 })
    .returning();
  group1Id = group1.id;
  group2Id = group2.id;

  const phrase = (over: Partial<typeof phrasesTable.$inferInsert>) => ({
    lessonId: greetLesson.id,
    languageCode: LANG,
    categoryId: greetingsId,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    hint: null,
    difficulty: 1,
    sortOrder: 0,
    ...over,
  });

  // Group 1: a sentence-stage row FIRST by position (must be excluded), then
  // four phrase-stage rows — the teaser is exactly the first three.
  const rows = await db
    .insert(phrasesTable)
    .values([
      phrase({ lessonGroupId: group1.id, lessonGroupPosition: 0, stage: "sentence", sortOrder: 0, english: "sentence" }),
      phrase({ lessonGroupId: group1.id, lessonGroupPosition: 1, sortOrder: 1, english: "t1" }),
      phrase({ lessonGroupId: group1.id, lessonGroupPosition: 2, sortOrder: 2, english: "t2" }),
      phrase({ lessonGroupId: group1.id, lessonGroupPosition: 3, sortOrder: 3, english: "t3" }),
      phrase({ lessonGroupId: group1.id, lessonGroupPosition: 4, sortOrder: 4, english: "t4" }),
      phrase({ lessonGroupId: group2.id, lessonGroupPosition: 1, sortOrder: 5, english: "g2" }),
      phrase({ lessonId: otherLesson.id, categoryId: otherCategoryId, sortOrder: 0, english: "other" }),
    ])
    .returning();
  sentencePhraseId = rows[0].id;
  teaserIds = [rows[1].id, rows[2].id, rows[3].id];
  fourthPhraseId = rows[4].id;
  group2PhraseId = rows[5].id;
  otherCategoryPhraseId = rows[6].id;

  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(learningRouter);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await clearUserRows();
  // Free plan: LANG is locked, Hindi is covered.
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null, trialEndsAt: null, currentPeriodEnd: null, chosenLanguage: null })
    .where(eq(usersTable.id, TEST_USER_ID));
  __resetTeaserCacheForTests();
});

after(async () => {
  await clearUserRows();
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonGroupsTable).where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, OTHER_CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
  server?.close();
});

test("teaser state serves exactly the 3 canonical phrases, in order, with progress", async () => {
  const { status, json } = await get(`/categories/${greetingsId}/phrases/${LANG}`);
  assert.equal(status, 200);
  assert.deepEqual(json.map((p: any) => p.id), teaserIds);
  // Sentence-stage and 4th/other-group phrases never leak.
  const ids = json.map((p: any) => p.id);
  for (const excluded of [sentencePhraseId, fourthPhraseId, group2PhraseId]) {
    assert.ok(!ids.includes(excluded));
  }
  for (const p of json) {
    assert.deepEqual(p.teaser, { consumed: 0, limit: TEASER_LIMIT });
  }
});

test("teaser state: non-teaser content in the locked language stays denied with teaser progress", async () => {
  // Another category's phrases.
  const other = await get(`/categories/${otherCategoryId}/phrases/${LANG}`);
  assert.equal(other.status, 402);
  assert.equal(other.json.reason, "language_locked");
  assert.deepEqual(other.json.teaser, { consumed: 0, limit: TEASER_LIMIT });

  // Direct phrase read is id-aware: teaser phrase allowed, 4th denied.
  const allowed = await get(`/phrases/${teaserIds[0]}`);
  assert.equal(allowed.status, 200);
  const denied = await get(`/phrases/${fourthPhraseId}`);
  assert.equal(denied.status, 402);
  assert.equal(denied.json.reason, "language_locked");

  // D1b decision 3: the lesson-groups listing is the ONE deliberate exception
  // to 402-on-all-locked for teaser/exhausted callers — it returns the
  // structural "showroom" (statuses only, zero phrase content) so the journey
  // map can render. The detailed contract is pinned in
  // learning.lesson-groups-showroom.test.ts; here we just assert the boundary:
  // this route opens up, every other locked surface (progress) still 402s.
  const groups = await get(`/categories/${greetingsId}/lesson-groups/${LANG}`);
  assert.equal(groups.status, 200);
  assert.equal(groups.json.access, "teaser");
  assert.deepEqual(groups.json.teaser, { consumed: 0, limit: TEASER_LIMIT });
  const progress = await get(`/progress/summary?lang=${LANG}`);
  assert.equal(progress.status, 402);

  // Topic browsing IS open in teaser state (it's the path to Greetings).
  const listing = await get(`/categories?lang=${LANG}`);
  assert.equal(listing.status, 200);
});

test("attempts consume the teaser regardless of score, distinct phrases only, full pipeline", async () => {
  // Low score still consumes.
  const first = await postAttempt(teaserIds[0], 30);
  assert.equal(first.status, 201);
  assert.deepEqual(first.json.teaser, { consumed: 1, limit: TEASER_LIMIT });
  // XP ledger row proves the full pipeline ran (not a degraded mode).
  const xp = await db.select().from(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  assert.ok(xp.length >= 1);

  // Re-attempting the same phrase does not consume a second slot.
  const again = await postAttempt(teaserIds[0], 95);
  assert.equal(again.status, 201);
  assert.deepEqual(again.json.teaser, { consumed: 1, limit: TEASER_LIMIT });

  // A non-teaser phrase id is denied even in teaser state (id-aware).
  const outside = await postAttempt(fourthPhraseId, 90);
  assert.equal(outside.status, 402);
  assert.equal(outside.json.reason, "language_locked");
  // A tokenless-phrase (null id) locked-language attempt is denied too.
  const nullId = await postAttempt(null, 90);
  assert.equal(nullId.status, 402);
});

test("third distinct attempt exhausts the teaser everywhere, lifetime, derived from attempts", async () => {
  await postAttempt(teaserIds[0], 30);
  await postAttempt(teaserIds[1], 90);
  const third = await postAttempt(teaserIds[2], 10);
  assert.equal(third.status, 201);
  assert.deepEqual(third.json.teaser, { consumed: 3, limit: TEASER_LIMIT });

  // Every locked-language surface now returns the distinguishable reason.
  const phrasesFetch = await get(`/categories/${greetingsId}/phrases/${LANG}`);
  assert.equal(phrasesFetch.status, 402);
  assert.equal(phrasesFetch.json.reason, "teaser_exhausted");
  assert.deepEqual(phrasesFetch.json.teaser, { consumed: 3, limit: TEASER_LIMIT });

  const phraseRead = await get(`/phrases/${teaserIds[0]}`);
  assert.equal(phraseRead.status, 402);
  assert.equal(phraseRead.json.reason, "teaser_exhausted");

  const attempt = await postAttempt(teaserIds[0], 90);
  assert.equal(attempt.status, 402);
  assert.equal(attempt.json.reason, "teaser_exhausted");

  const listing = await get(`/categories?lang=${LANG}`);
  assert.equal(listing.status, 402);
  assert.equal(listing.json.reason, "teaser_exhausted");

  // Lifetime persistence: consumption is derived from the attempts table, so
  // a "new session" (fresh request, caches reset) still sees exhausted.
  __resetTeaserCacheForTests();
  const stillExhausted = await get(`/categories/${greetingsId}/phrases/${LANG}`);
  assert.equal(stillExhausted.status, 402);
  assert.equal(stillExhausted.json.reason, "teaser_exhausted");

  // Attempts on teaser phrases persisted normally (count toward later upgrade).
  const rows = await db
    .select()
    .from(attemptsTable)
    .where(inArray(attemptsTable.phraseId, teaserIds));
  // Exactly the 3 consuming attempts persisted (the post-exhaustion attempt
  // was 402'd before any insert).
  assert.equal(rows.filter((r) => r.userId === TEST_USER_ID).length, 3);
});

test("concurrent teaser attempts cannot overshoot the limit (advisory-lock boundary)", async () => {
  // Seed 2 consumed slots, then fire simultaneous signed submissions for the
  // last remaining teaser phrase AND repeats of a consumed one. The recount +
  // insert run under a per-(user,language) advisory lock, so the persisted
  // distinct set can never exceed TEASER_LIMIT and no request 500s.
  await postAttempt(teaserIds[0], 90);
  await postAttempt(teaserIds[1], 90);

  const results = await Promise.all([
    postAttempt(teaserIds[2], 50),
    postAttempt(teaserIds[2], 60),
    postAttempt(teaserIds[0], 70),
    postAttempt(teaserIds[1], 80),
  ]);
  for (const r of results) {
    assert.ok([201, 402].includes(r.status), `unexpected status ${r.status}`);
  }
  // The last distinct phrase must have landed at least once.
  assert.ok(results.slice(0, 2).some((r) => r.status === 201));

  const rows = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, TEST_USER_ID));
  const distinct = new Set(rows.map((r) => r.phraseId));
  assert.ok(distinct.size <= TEASER_LIMIT);

  // Fully exhausted now: even a repeat of a consumed phrase is denied.
  const after = await postAttempt(teaserIds[0], 90);
  assert.equal(after.status, 402);
  assert.equal(after.json.reason, "teaser_exhausted");
});

test("covered languages are never teaser-limited; payload absent when allowed", async () => {
  // Hindi for Free: allowed, no teaser field anywhere.
  const listing = await get(`/categories?lang=${FREE_LANGUAGE}`);
  assert.equal(listing.status, 200);

  // Plus: the previously locked language is fully allowed, no teaser field.
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER_ID));
  const phrasesFetch = await get(`/categories/${greetingsId}/phrases/${LANG}`);
  assert.equal(phrasesFetch.status, 200);
  // Full group content, not the teaser slice.
  assert.ok(phrasesFetch.json.length > TEASER_LIMIT);
  for (const p of phrasesFetch.json) assert.equal(p.teaser, undefined);

  const attempt = await postAttempt(fourthPhraseId, 90);
  assert.equal(attempt.status, 201);
  assert.equal(attempt.json.teaser, undefined);
});

// ── Free-taste phrases on the journey taste station ─────────────────────────
// GET /lesson-groups/:id/phrases mirrors the category-phrases teaser branch:
// the designated taste group (the one the journey listing marks
// teaserStation) serves exactly the teaser rows; every other group on the
// locked language keeps today's 402; the teaser branch returns BEFORE the
// sequential-unlock guard so no lesson_group_progress latch rows are ever
// written for an unowned language.

test("teaser state: the taste group's phrases route serves exactly the teaser rows, and attempts on them work", async () => {
  const { status, json } = await get(`/lesson-groups/${group1Id}/phrases`);
  assert.equal(status, 200);
  assert.deepEqual(json.map((p: any) => p.id), teaserIds);
  const ids = json.map((p: any) => p.id);
  for (const excluded of [sentencePhraseId, fourthPhraseId, group2PhraseId]) {
    assert.ok(!ids.includes(excluded));
  }
  for (const p of json) {
    assert.deepEqual(p.teaser, { consumed: 0, limit: TEASER_LIMIT });
  }

  // Byte-for-byte the same phrase set the category-phrases teaser branch
  // serves — one teaser contract, two scopes.
  const category = await get(`/categories/${greetingsId}/phrases/${LANG}`);
  assert.equal(category.status, 200);
  assert.deepEqual(
    json.map((p: any) => p.id),
    category.json.map((p: any) => p.id),
  );

  // POST /attempts accepts a phrase reached via this flow (the id-aware
  // teaser exception) — verified, not assumed.
  const attempt = await postAttempt(json[0].id, 90);
  assert.equal(attempt.status, 201);
  assert.deepEqual(attempt.json.teaser, { consumed: 1, limit: TEASER_LIMIT });

  // The teaser branch returned before the unlock latch: zero progress rows.
  const latched = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, TEST_USER_ID));
  assert.equal(latched.length, 0, "teaser call must never write latch rows");
});

test("teaser state: a non-taste group on the locked language still 402s with teaser progress", async () => {
  const denied = await get(`/lesson-groups/${group2Id}/phrases`);
  assert.equal(denied.status, 402);
  assert.equal(denied.json.reason, "language_locked");
  assert.deepEqual(denied.json.teaser, { consumed: 0, limit: TEASER_LIMIT });
});

test("exhausted state: the taste group 402s teaser_exhausted and never latches, even at completion ratio", async () => {
  // Master the 3 teaser phrases plus the 4th group-1 phrase directly in the
  // attempts table: exhausts the teaser AND puts group 1 at 4/5 mastered,
  // exactly the COMPLETION_RATIO (0.8) threshold — so if this 402 path ever
  // reached the unlock derivation, it WOULD latch a completion row. It must
  // not, for a language the caller's plan doesn't own.
  for (const pid of [...teaserIds, fourthPhraseId]) {
    await db.insert(attemptsTable).values({
      userId: TEST_USER_ID,
      languageCode: LANG,
      phraseId: pid,
      nativeScript: "x",
      romanized: "x",
      english: "x",
      transcript: "x",
      score: 100,
      passed: true,
      feedback: "x",
    });
  }
  const denied = await get(`/lesson-groups/${group1Id}/phrases`);
  assert.equal(denied.status, 402);
  assert.equal(denied.json.reason, "teaser_exhausted");
  assert.deepEqual(denied.json.teaser, {
    consumed: TEASER_LIMIT,
    limit: TEASER_LIMIT,
  });

  const latched = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, TEST_USER_ID));
  assert.equal(latched.length, 0, "402 path must never write latch rows");
});

test("entitled caller behavior on the group-phrases route is unchanged", async () => {
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER_ID));
  const { status, json } = await get(`/lesson-groups/${group1Id}/phrases`);
  assert.equal(status, 200);
  // Full group content in position order (sentence row first), no teaser
  // field anywhere — the pre-existing contract, byte-identical.
  assert.deepEqual(
    json.map((p: any) => p.id),
    [sentencePhraseId, ...teaserIds, fourthPhraseId],
  );
  for (const p of json) assert.equal(p.teaser, undefined);
});
