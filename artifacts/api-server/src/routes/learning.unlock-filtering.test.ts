import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  attemptsTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  lessonGroupsTable,
  lessonGroupProgressTable,
  lessonGroupTestoutsTable,
  phrasesTable,
  userItemMemoryTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { __resetTeaserCacheForTests, TEASER_LIMIT } from "../lib/teaser";

// Server-side sequential-unlock filtering for phrase endpoints, driven against
// the real router and live schema. Decisions under test (Step 0 approved):
//   - category GET serves only unlocked-group phrases, plus NULL-group rows
//     and previously attempted phrases (the retake exemption);
//   - /lesson-groups/:id/phrases denies a locked group with
//     403 { error: "lesson_group_locked" } — never 402 (not a paywall);
//   - entitlement 402s always run BEFORE unlock state;
//   - review/SRS is untouched (attempted-only by construction);
//   - test-out stays EXEMPT — it exists to sample locked groups;
//   - the sentence route applies the same filter (sentence groups are groups);
//   - the completion latch fires from phrase routes too (shared guard).
// All rows use test-only ids and are cleaned up after — see
// .agents/memory/api-server-tests.md.
const U_PLUS = "test_unlockf_plus"; // progression: completes g1, then g2
const U_RETAKE = "test_unlockf_retake"; // attempted one locked phrase only
const U_REVIEW = "test_unlockf_review"; // review-queue user
const U_FREE = "test_unlockf_free"; // free tier: 402 precedence
const U_RACE = "test_unlockf_race"; // concurrent latch derivation
const U_TEASER = "test_unlockf_teaser"; // showroom caller: never latched
const ALL_USERS = [U_PLUS, U_RETAKE, U_REVIEW, U_FREE, U_RACE, U_TEASER];
const LANG = "__test_lang_unlockf";
const CATEGORY_SLUG = "__test_cat_unlockf";

let app: Express;
let server: Server;
let baseUrl: string;

let categoryId: number;
let lessonId: number;
let g1Id: number; // position 1: 2 phrase-stage phrases
let g2Id: number; // position 2: 2 phrase-stage phrases
let g3Id: number; // position 3: 1 sentence-stage phrase (tail sentence group)
let g1Phrases: number[] = [];
let g2Phrases: number[] = [];
let ungroupedPhraseId: number;
let sentencePhraseId: number;

// Teaser fixture (created inside its test, torn down in after()): a first
// Greetings group for LANG so getLanguageAccess resolves "teaser" for U_TEASER.
let teaserLessonId: number | null = null;
let teaserGroupId: number | null = null;

async function api(
  path: string,
  userId: string,
  init?: RequestInit,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-test-user": userId,
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function seedAttempt(
  userId: string,
  phraseId: number,
  score: number,
): Promise<void> {
  await db.insert(attemptsTable).values({
    userId,
    languageCode: LANG,
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

async function categoryPhraseIds(userId: string): Promise<number[]> {
  const { status, json } = await api(
    `/categories/${categoryId}/phrases/${encodeURIComponent(LANG)}`,
    userId,
  );
  assert.equal(status, 200);
  return (json as { id: number }[]).map((p) => p.id).sort((a, b) => a - b);
}

before(async () => {
  await ensureUsersColumns();

  for (const [id, tier] of [
    [U_PLUS, "plus"],
    [U_RETAKE, "plus"],
    [U_REVIEW, "plus"],
    [U_FREE, "free"],
    [U_RACE, "plus"],
    [U_TEASER, "free"],
  ] as const) {
    await db
      .insert(usersTable)
      .values({ id, email: null, displayName: id })
      .onConflictDoNothing();
    await db
      .update(usersTable)
      .set({ tier, subscriptionStatus: tier === "plus" ? "active" : null })
      .where(eq(usersTable.id, id));
  }

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Unlock Filter Test Language",
      nativeName: "UF",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Unlock Filter Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9402,
    })
    .returning();
  categoryId = category!.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Native UF" })
    .returning();
  lessonId = lesson!.id;

  const mkGroup = async (position: number) => {
    const [g] = await db
      .insert(lessonGroupsTable)
      .values({ languageCode: LANG, categoryId, position })
      .returning();
    return g!.id;
  };
  g1Id = await mkGroup(1);
  g2Id = await mkGroup(2);
  g3Id = await mkGroup(3);

  const mkPhrase = (
    english: string,
    sortOrder: number,
    groupId: number | null,
    groupPos: number | null,
    stage = "phrase",
  ) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
    stage,
    lessonGroupId: groupId,
    lessonGroupPosition: groupPos,
  });
  const rows = await db
    .insert(phrasesTable)
    .values([
      mkPhrase("g1-a", 0, g1Id, 1),
      mkPhrase("g1-b", 1, g1Id, 2),
      mkPhrase("g2-a", 2, g2Id, 1),
      mkPhrase("g2-b", 3, g2Id, 2),
      mkPhrase("loose", 4, null, null),
      mkPhrase("g3-sent", 5, g3Id, 1, "sentence"),
    ])
    .returning();
  const byEnglish = new Map(rows.map((r) => [r.english, r.id]));
  g1Phrases = [byEnglish.get("g1-a")!, byEnglish.get("g1-b")!];
  g2Phrases = [byEnglish.get("g2-a")!, byEnglish.get("g2-b")!];
  ungroupedPhraseId = byEnglish.get("loose")!;
  sentencePhraseId = byEnglish.get("g3-sent")!;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = String(
      req.headers["x-test-user"] ?? U_PLUS,
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
  await db
    .delete(userItemMemoryTable)
    .where(inArray(userItemMemoryTable.userId, ALL_USERS));
  await db
    .delete(attemptsTable)
    .where(inArray(attemptsTable.userId, ALL_USERS));
  await db
    .delete(lessonGroupProgressTable)
    .where(inArray(lessonGroupProgressTable.userId, ALL_USERS));
  await db
    .delete(lessonGroupTestoutsTable)
    .where(inArray(lessonGroupTestoutsTable.userId, ALL_USERS));
  if (teaserGroupId != null) {
    await db
      .delete(phrasesTable)
      .where(eq(phrasesTable.lessonGroupId, teaserGroupId));
    await db
      .delete(lessonGroupsTable)
      .where(eq(lessonGroupsTable.id, teaserGroupId));
  }
  if (teaserLessonId != null) {
    await db.delete(lessonsTable).where(eq(lessonsTable.id, teaserLessonId));
  }
  __resetTeaserCacheForTests();
  await db.delete(phrasesTable).where(eq(phrasesTable.categoryId, categoryId));
  await db.delete(lessonsTable).where(eq(lessonsTable.id, lessonId));
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.categoryId, categoryId));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
});

// (a) + (b): fresh caller gets only the first (unlocked) group's phrases plus
// ungrouped rows; locked-group phrases never leave the server.
test("category GET serves only unlocked-group + NULL-group phrases", async () => {
  const ids = await categoryPhraseIds(U_PLUS);
  assert.deepEqual(ids, [...g1Phrases, ungroupedPhraseId].sort((a, b) => a - b));
  for (const locked of g2Phrases) assert.ok(!ids.includes(locked));
});

// The journey listing derives from the SAME guard: g1 unlocked, g2/g3 locked.
test("journey listing agrees with the phrase filter (shared guard)", async () => {
  const { status, json } = await api(
    `/categories/${categoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
    U_PLUS,
  );
  assert.equal(status, 200);
  const statuses = new Map(
    (json.lessonGroups as { id: number; status: string }[]).map((g) => [
      g.id,
      g.status,
    ]),
  );
  assert.equal(statuses.get(g1Id), "unlocked");
  assert.equal(statuses.get(g2Id), "locked");
  assert.equal(statuses.get(g3Id), "locked");
  assert.equal(json.unassignedCount, 1); // the "loose" phrase
});

// (c): retake exemption — a previously attempted phrase from a LOCKED group
// stays servable to that user; its untouched sibling does not.
test("retake exemption keeps an attempted locked-group phrase servable", async () => {
  await seedAttempt(U_RETAKE, g2Phrases[0]!, 60);
  const ids = await categoryPhraseIds(U_RETAKE);
  assert.ok(ids.includes(g2Phrases[0]!), "attempted locked phrase served");
  assert.ok(!ids.includes(g2Phrases[1]!), "untouched locked phrase filtered");
  assert.ok(ids.includes(g1Phrases[0]!) && ids.includes(ungroupedPhraseId));
});

// (d): direct locked-group request → 403 lesson_group_locked (approved shape).
// The retake exemption is per-phrase in the category list; it does NOT open
// the whole group.
test("locked lesson-group phrases request is denied with 403 lesson_group_locked", async () => {
  const { status, json } = await api(
    `/lesson-groups/${g2Id}/phrases`,
    U_RETAKE,
  );
  assert.equal(status, 403);
  assert.deepEqual(json, {
    error: "lesson_group_locked",
    groupId: g2Id,
    status: "locked",
  });
});

// Entitlement 402s run BEFORE unlock state: a Free caller on a Plus language
// gets the paywall denial, never lesson_group_locked.
test("entitlement 402 takes precedence over the unlock 403", async () => {
  const { status, json } = await api(`/lesson-groups/${g2Id}/phrases`, U_FREE);
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
});

// Test-out stays exempt: it exists precisely to sample a LOCKED group.
test("test-out GET still serves a locked group's sample", async () => {
  const { status, json } = await api(
    `/lesson-groups/${g2Id}/test-out`,
    U_RETAKE,
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.phrases) && json.phrases.length > 0);
});

// (e): review is untouched — an attempted, due, locked-group phrase surfaces.
test("review queue still serves a due phrase from a locked group", async () => {
  await seedAttempt(U_REVIEW, g2Phrases[0]!, 60);
  await db.insert(userItemMemoryTable).values({
    userId: U_REVIEW,
    phraseId: g2Phrases[0]!,
    stability: 1,
    difficulty: 5,
    state: "review",
    reps: 1,
    lapses: 0,
    scheduledDays: 1,
    dueAt: new Date(Date.now() - 60_000),
  });
  const { status, json } = await api(
    `/review/phrases?lang=${encodeURIComponent(LANG)}`,
    U_REVIEW,
  );
  assert.equal(status, 200);
  const ids = (json as { id: number }[]).map((p) => p.id);
  assert.ok(ids.includes(g2Phrases[0]!));
});

// (f): completing group 1 unlocks group 2 in the category list, and the
// completion latch is persisted from the PHRASE route (shared guard), not
// only the journey route.
test("completing a group unlocks the next in the category list and latches", async () => {
  for (const pid of g1Phrases) await seedAttempt(U_PLUS, pid, 95);
  const ids = await categoryPhraseIds(U_PLUS);
  assert.deepEqual(
    ids,
    [...g1Phrases, ...g2Phrases, ungroupedPhraseId].sort((a, b) => a - b),
  );
  const latch = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(
      and(
        eq(lessonGroupProgressTable.userId, U_PLUS),
        eq(lessonGroupProgressTable.lessonGroupId, g1Id),
      ),
    );
  assert.equal(latch.length, 1);
  assert.equal(latch[0]!.status, "completed");

  // The now-unlocked group is also directly fetchable.
  const direct = await api(`/lesson-groups/${g2Id}/phrases`, U_PLUS);
  assert.equal(direct.status, 200);
  assert.equal(direct.json.length, 2);
});

// Sentence groups are lesson groups: the sentences endpoint filters by the
// same unlock chain (locked tail group → empty list; unlocked → served).
test("sentence stage honors group unlock", async () => {
  const before = await api(
    `/categories/${categoryId}/sentences/${encodeURIComponent(LANG)}`,
    U_PLUS,
  );
  assert.equal(before.status, 200);
  assert.deepEqual(before.json, []); // g3 locked: sentence filtered out

  for (const pid of g2Phrases) await seedAttempt(U_PLUS, pid, 95);
  const after = await api(
    `/categories/${categoryId}/sentences/${encodeURIComponent(LANG)}`,
    U_PLUS,
  );
  assert.equal(after.status, 200);
  const ids = (after.json as { id: number }[]).map((p) => p.id);
  assert.deepEqual(ids, [sentencePhraseId]); // g3 unlocked now
});

// (g) Concurrency: parallel requests that each observe the same fresh
// completion must produce exactly ONE latch row and zero errors — the
// (user_id, lesson_group_id) PK + onConflictDoUpdate upsert in
// deriveAndLatchUnlock is the invariant under test.
test("concurrent derives latch a completed group exactly once", async () => {
  for (const pid of g1Phrases) await seedAttempt(U_RACE, pid, 95);
  const expected = [...g1Phrases, ...g2Phrases, ungroupedPhraseId].sort(
    (a, b) => a - b,
  );
  const results = await Promise.all(
    Array.from({ length: 5 }, () => categoryPhraseIds(U_RACE)),
  );
  // Every racer succeeded AND saw the post-completion view (g2 unlocked).
  for (const ids of results) assert.deepEqual(ids, expected);
  const rows = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, U_RACE));
  assert.equal(rows.length, 1, "exactly one latch row across all racers");
  assert.equal(rows[0]!.lessonGroupId, g1Id);
  assert.equal(rows[0]!.status, "completed");
});

// (h) Caller contract: a teaser/showroom caller must NEVER be latched — the
// completion latch may not be written for a language the caller's plan
// doesn't own. Non-vacuous by construction: U_TEASER's attempts WOULD derive
// g1 completed, so if either showroom surface ever ran deriveAndLatchUnlock,
// a progress row would appear.
test("teaser showroom caller never writes a completion latch", async () => {
  // Real teaser set for LANG: a first Greetings group with TEASER_LIMIT
  // phrase-stage phrases (lib/teaser.ts resolves the set from the seeded
  // "greetings" category).
  const greetings = await db.query.categoriesTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.slug, "greetings"),
  });
  assert.ok(greetings, "seeded greetings category exists");
  const [tl] = await db
    .insert(lessonsTable)
    .values({
      languageCode: LANG,
      categoryId: greetings.id,
      titleNative: "Teaser UF",
    })
    .returning();
  teaserLessonId = tl!.id;
  const [tg] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetings.id, position: 1 })
    .returning();
  teaserGroupId = tg!.id;
  await db.insert(phrasesTable).values(
    Array.from({ length: TEASER_LIMIT }, (_, i) => ({
      lessonId: teaserLessonId!,
      languageCode: LANG,
      categoryId: greetings.id,
      nativeScript: `teaser-${i}`,
      romanized: `teaser-${i}`,
      english: `teaser-${i}`,
      sortOrder: i,
      stage: "phrase",
      lessonGroupId: teaserGroupId,
      lessonGroupPosition: i + 1,
    })),
  );
  __resetTeaserCacheForTests();

  // Completion-worthy attempts in the TEST category (not teaser phrases, so
  // teaser consumption stays 0 and access remains "teaser").
  for (const pid of g1Phrases) await seedAttempt(U_TEASER, pid, 95);

  // Showroom journey listing: forced locked, access envelope, NO latch.
  const listing = await api(
    `/categories/${categoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
    U_TEASER,
  );
  assert.equal(listing.status, 200);
  assert.equal(listing.json.access, "teaser");
  assert.equal(listing.json.teaser.consumed, 0);
  for (const g of listing.json.lessonGroups as { status: string }[]) {
    assert.equal(g.status, "locked");
  }

  // Teaser phrase fetch (the M1 branch skips the unlock guard entirely).
  const teaserFetch = await api(
    `/categories/${greetings.id}/phrases/${encodeURIComponent(LANG)}`,
    U_TEASER,
  );
  assert.equal(teaserFetch.status, 200);
  assert.equal(teaserFetch.json.length, TEASER_LIMIT);

  const rows = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, U_TEASER));
  assert.equal(rows.length, 0, "showroom caller must never be latched");
});
