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
  lessonGenerationsTable,
  lessonGroupsTable,
  lessonGroupProgressTable,
  lessonGroupTestoutsTable,
  phrasesTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { signEvaluation } from "../lib/evaluationToken";
import { replenishPhrases } from "../lib/phraseReplenisher";
import {
  deriveGroupStatuses,
  isGroupCompleted,
  testoutRequiredCorrect,
} from "../lib/lessonGroupUnlock";

// D1a Slice 2: sequential unlock + test-out + insert-time replenisher group
// assignment, driven against the real router and live schema. Decisions under
// test: completion = >= 80% of a group's phrases at bestScore >= 80 (the
// attempts-based signal, NOT FSRS); unlock never re-locks; entitlement gates
// evaluate BEFORE any unlock logic (a Free caller on a Plus language gets 402,
// never unlock state); test-out requires server-signed evaluation tokens and
// persists every submission. All rows use test-only ids and are cleaned up
// after, see .agents/memory/api-server-tests.md.
const PLUS_USER = "test_lg_unlock_plus";
const FRESH_USER = "test_lg_unlock_fresh";
const FREE_USER = "test_lg_unlock_free";
// Dedicated to the throttle tests: their submission log rows must not be
// polluted by (or pollute) the other users' test-out submissions.
const THROTTLE_USER = "test_lg_unlock_throttle";
const LANG = "__test_lang_lg_unlock";
const CATEGORY_SLUG = "__test_cat_lg_unlock";

let app: Express;
let server: Server;
let baseUrl: string;

let categoryId: number;
let lessonId: number;
let g1Id: number; // position 1, 2 phrase-stage phrases
let g2Id: number; // position 2, 2 phrase-stage phrases
let g3Id: number; // position 3, 1 sentence-stage phrase (tail sentence group)
let g1Phrases: number[] = [];
let g2Phrases: number[] = [];

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

function nailedToken(userId: string, phraseId: number): string {
  return signEvaluation({
    userId,
    phraseId,
    languageCode: LANG,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 95,
    passed: true,
    feedback: "x",
    band: "perfect",
    xpAwarded: 10,
  });
}

function closeToken(userId: string, phraseId: number): string {
  return signEvaluation({
    userId,
    phraseId,
    languageCode: LANG,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 60,
    passed: false,
    feedback: "x",
    band: "almost",
    xpAwarded: 5,
  });
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

async function groupStatuses(userId: string): Promise<Map<number, string>> {
  const { status, json } = await api(
    `/categories/${categoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
    userId,
  );
  assert.equal(status, 200);
  return new Map(
    (json.lessonGroups as { id: number; status: string }[]).map((g) => [
      g.id,
      g.status,
    ]),
  );
}

before(async () => {
  await ensureUsersColumns();
  // Self-provision the Slice 2 tables (shared live Postgres may lag).
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_group_testouts (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      lesson_group_id integer NOT NULL REFERENCES lesson_groups(id),
      passed boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  for (const [id, tier] of [
    [PLUS_USER, "plus"],
    [FRESH_USER, "plus"],
    [FREE_USER, "free"],
    [THROTTLE_USER, "plus"],
  ] as const) {
    await db
      .insert(usersTable)
      .values({ id, email: null, displayName: id })
      .onConflictDoNothing();
    await db
      .update(usersTable)
      .set({
        tier,
        subscriptionStatus: tier === "plus" ? "active" : null,
      })
      .where(eq(usersTable.id, id));
  }

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Unlock Test Language",
      nativeName: "U",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Unlock Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9401,
    })
    .returning();
  categoryId = category!.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Native U" })
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
    groupId: number,
    groupPos: number,
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
      mkPhrase("g3-sent", 4, g3Id, 1, "sentence"),
    ])
    .returning();
  const byEnglish = new Map(rows.map((r) => [r.english, r.id]));
  g1Phrases = [byEnglish.get("g1-a")!, byEnglish.get("g1-b")!];
  g2Phrases = [byEnglish.get("g2-a")!, byEnglish.get("g2-b")!];

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = String(
      req.headers["x-test-user"] ?? PLUS_USER,
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
  const userIds = [PLUS_USER, FRESH_USER, FREE_USER, THROTTLE_USER];
  await db
    .delete(attemptsTable)
    .where(inArray(attemptsTable.userId, userIds));
  await db
    .delete(lessonGroupProgressTable)
    .where(inArray(lessonGroupProgressTable.userId, userIds));
  await db
    .delete(lessonGroupTestoutsTable)
    .where(inArray(lessonGroupTestoutsTable.userId, userIds));
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.languageCode, LANG));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db
    .delete(lessonGroupsTable)
    .where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  await pool.end();
});

// ── Pure derivation ────────────────────────────────────────────────────────

test("deriveGroupStatuses: fresh user sees first group unlocked, rest locked", () => {
  const statuses = deriveGroupStatuses(
    [
      { id: 1, position: 1, phraseIds: [10, 11] },
      { id: 2, position: 2, phraseIds: [12, 13] },
    ],
    new Map(),
    new Set(),
  );
  assert.equal(statuses.get(1), "unlocked");
  assert.equal(statuses.get(2), "locked");
});

test("isGroupCompleted honors the 80% bestScore>=80 rule and empty groups never complete", () => {
  const stats = new Map([
    [1, { attemptCount: 1, bestScore: 90, mastered: true }],
    [2, { attemptCount: 1, bestScore: 85, mastered: true }],
    [3, { attemptCount: 3, bestScore: 70, mastered: false }],
  ]) as any;
  assert.equal(isGroupCompleted([1, 2, 3], stats), false); // 2/3 = 66%
  assert.equal(isGroupCompleted([1, 2], stats), true); // 100%
  assert.equal(isGroupCompleted([], stats), false);
  assert.equal(testoutRequiredCorrect(5), 4);
  assert.equal(testoutRequiredCorrect(2), 2);
});

// ── Endpoint: derived unlock state ─────────────────────────────────────────

test("fresh user: first group unlocked, later groups locked", async () => {
  const statuses = await groupStatuses(FRESH_USER);
  assert.equal(statuses.get(g1Id), "unlocked");
  assert.equal(statuses.get(g2Id), "locked");
  assert.equal(statuses.get(g3Id), "locked");
});

test("mastering >= 80% of group 1 completes it and unlocks group 2", async () => {
  await seedAttempt(PLUS_USER, g1Phrases[0]!, 40); // in_progress first
  let statuses = await groupStatuses(PLUS_USER);
  assert.equal(statuses.get(g1Id), "in_progress");
  assert.equal(statuses.get(g2Id), "locked");

  await seedAttempt(PLUS_USER, g1Phrases[0]!, 95);
  await seedAttempt(PLUS_USER, g1Phrases[1]!, 88);
  statuses = await groupStatuses(PLUS_USER);
  assert.equal(statuses.get(g1Id), "completed");
  assert.equal(statuses.get(g2Id), "unlocked");
  assert.equal(statuses.get(g3Id), "locked");
});

// ── Test-out ───────────────────────────────────────────────────────────────

test("test-out GET samples the group and states the pass bar", async () => {
  const { status, json } = await api(
    `/lesson-groups/${g2Id}/test-out`,
    FRESH_USER,
  );
  assert.equal(status, 200);
  assert.equal(json.sampleSize, 2);
  assert.equal(json.requiredCorrect, 2);
  assert.equal(json.phrases.length, 2);
  const ids = json.phrases.map((p: { id: number }) => p.id).sort();
  assert.deepEqual(ids, [...g2Phrases].sort());
});

test("failing test-out records the submission but persists no skip", async () => {
  const { status, json } = await api(
    `/lesson-groups/${g2Id}/test-out`,
    FRESH_USER,
    {
      method: "POST",
      body: JSON.stringify({
        attempts: [
          { phraseId: g2Phrases[0], evaluationToken: nailedToken(FRESH_USER, g2Phrases[0]!) },
          { phraseId: g2Phrases[1], evaluationToken: closeToken(FRESH_USER, g2Phrases[1]!) },
        ],
      }),
    },
  );
  assert.equal(status, 200);
  assert.equal(json.passed, false);
  assert.equal(json.correctCount, 1);
  const progress = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, FRESH_USER));
  assert.equal(progress.length, 0);
  const logged = await db
    .select()
    .from(lessonGroupTestoutsTable)
    .where(eq(lessonGroupTestoutsTable.userId, FRESH_USER));
  assert.equal(logged.length, 1);
  assert.equal(logged[0]!.passed, false);
});

test("passing test-out persists tested_out and unlocks the next group", async () => {
  const { status, json } = await api(
    `/lesson-groups/${g2Id}/test-out`,
    FRESH_USER,
    {
      method: "POST",
      body: JSON.stringify({
        attempts: g2Phrases.map((pid) => ({
          phraseId: pid,
          evaluationToken: nailedToken(FRESH_USER, pid),
        })),
      }),
    },
  );
  assert.equal(status, 200);
  assert.equal(json.passed, true);
  assert.equal(json.status, "tested_out");

  const statuses = await groupStatuses(FRESH_USER);
  assert.equal(statuses.get(g2Id), "tested_out");
  assert.equal(statuses.get(g3Id), "unlocked"); // sequential unlock advanced
  // g1 stays as it was, never re-locked by anything above.
  assert.equal(statuses.get(g1Id), "unlocked");
});

test("test-out rejects forged, foreign, duplicate, or out-of-group tokens", async () => {
  // Token signed for a different user.
  let r = await api(`/lesson-groups/${g2Id}/test-out`, FRESH_USER, {
    method: "POST",
    body: JSON.stringify({
      attempts: [
        { phraseId: g2Phrases[0], evaluationToken: nailedToken(PLUS_USER, g2Phrases[0]!) },
        { phraseId: g2Phrases[1], evaluationToken: nailedToken(FRESH_USER, g2Phrases[1]!) },
      ],
    }),
  });
  assert.equal(r.status, 400);
  // Phrase not in this group.
  r = await api(`/lesson-groups/${g2Id}/test-out`, FRESH_USER, {
    method: "POST",
    body: JSON.stringify({
      attempts: [
        { phraseId: g1Phrases[0], evaluationToken: nailedToken(FRESH_USER, g1Phrases[0]!) },
        { phraseId: g2Phrases[1], evaluationToken: nailedToken(FRESH_USER, g2Phrases[1]!) },
      ],
    }),
  });
  assert.equal(r.status, 400);
  // Same phrase twice (must be distinct + full sample size).
  r = await api(`/lesson-groups/${g2Id}/test-out`, FRESH_USER, {
    method: "POST",
    body: JSON.stringify({
      attempts: [
        { phraseId: g2Phrases[0], evaluationToken: nailedToken(FRESH_USER, g2Phrases[0]!) },
        { phraseId: g2Phrases[0], evaluationToken: nailedToken(FRESH_USER, g2Phrases[0]!) },
      ],
    }),
  });
  assert.equal(r.status, 400);
  // Tampered token.
  r = await api(`/lesson-groups/${g2Id}/test-out`, FRESH_USER, {
    method: "POST",
    body: JSON.stringify({
      attempts: [
        { phraseId: g2Phrases[0], evaluationToken: `${nailedToken(FRESH_USER, g2Phrases[0]!)}x` },
        { phraseId: g2Phrases[1], evaluationToken: nailedToken(FRESH_USER, g2Phrases[1]!) },
      ],
    }),
  });
  assert.equal(r.status, 400);
});

// ── Entitlement precedence ─────────────────────────────────────────────────

test("entitlements evaluate before unlock: Free caller gets 402, never unlock state", async () => {
  const list = await api(
    `/categories/${categoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
    FREE_USER,
  );
  assert.equal(list.status, 402);
  assert.equal(list.json.reason, "language_locked");
  assert.equal(list.json.lessonGroups, undefined);

  const sample = await api(`/lesson-groups/${g2Id}/test-out`, FREE_USER);
  assert.equal(sample.status, 402);

  const submit = await api(`/lesson-groups/${g2Id}/test-out`, FREE_USER, {
    method: "POST",
    body: JSON.stringify({
      attempts: [
        { phraseId: g2Phrases[0], evaluationToken: nailedToken(FREE_USER, g2Phrases[0]!) },
        { phraseId: g2Phrases[1], evaluationToken: nailedToken(FREE_USER, g2Phrases[1]!) },
      ],
    }),
  });
  assert.equal(submit.status, 402);
});

// ── Replenisher insert-time assignment ─────────────────────────────────────

async function pairGroups() {
  return db
    .select({
      id: lessonGroupsTable.id,
      position: lessonGroupsTable.position,
    })
    .from(lessonGroupsTable)
    .where(
      and(
        eq(lessonGroupsTable.languageCode, LANG),
        eq(lessonGroupsTable.categoryId, categoryId),
      ),
    )
    .orderBy(asc(lessonGroupsTable.position));
}

let seq = 0;
function fakeGenerate(count: number) {
  return async () =>
    Array.from({ length: count }, () => {
      seq++;
      return {
        nativeScript: `repl-${seq}`,
        romanized: `repl-${seq}`,
        english: `repl-${seq}`,
        difficulty: 1,
      };
    });
}

test("replenished phrases append to the last phrase-stage group below the cap", async () => {
  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: PLUS_USER,
    count: 2,
    generate: fakeGenerate(2),
    cooldownMs: -60_000, // disable the cooldown for the test
  });
  assert.equal(added, 2);
  const rows = await db
    .select()
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, g2Id))
    .orderBy(asc(phrasesTable.lessonGroupPosition));
  // g2 (last phrase-stage group; g3 is sentence-stage) grew from 2 to 4.
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.lessonGroupPosition),
    [1, 2, 3, 4],
  );
  // No group positions changed; nothing unassigned.
  const groups = await pairGroups();
  assert.deepEqual(groups.map((g) => g.position), [1, 2, 3]);
});

test("overflow creates a new phrase-stage group and shifts the sentence group up", async () => {
  // Fill g2 to the cap (14) so the next batch must open a new group.
  const current = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, g2Id));
  const fill = 14 - current.length;
  await db.insert(phrasesTable).values(
    Array.from({ length: fill }, (_, i) => ({
      lessonId,
      languageCode: LANG,
      categoryId,
      nativeScript: `fill-${i}`,
      romanized: `fill-${i}`,
      english: `fill-${i}`,
      sortOrder: 100 + i,
      stage: "phrase",
      lessonGroupId: g2Id,
      lessonGroupPosition: current.length + i + 1,
    })),
  );

  const added = await replenishPhrases({
    languageCode: LANG,
    categoryId,
    userId: PLUS_USER,
    count: 3,
    generate: fakeGenerate(3),
    cooldownMs: -60_000,
  });
  assert.equal(added, 3);

  const groups = await pairGroups();
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map((g) => g.position), [1, 2, 3, 4]);
  // Same ids for g1/g2; the NEW group took position 3; sentence group g3
  // shifted to position 4 with its id (and any progress keyed on it) intact.
  assert.equal(groups[0]!.id, g1Id);
  assert.equal(groups[1]!.id, g2Id);
  assert.equal(groups[3]!.id, g3Id);
  const newGroupId = groups[2]!.id;
  const newRows = await db
    .select()
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, newGroupId));
  assert.equal(newRows.length, 3);
  assert.ok(newRows.every((r) => r.stage === "phrase"));
  // Stage purity preserved: the shifted sentence group holds only sentences.
  const g3Rows = await db
    .select()
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, g3Id));
  assert.ok(g3Rows.every((r) => r.stage === "sentence"));
  // tested_out progress still points at g2 by id after the shift.
  const progress = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(
      and(
        eq(lessonGroupProgressTable.userId, FRESH_USER),
        eq(lessonGroupProgressTable.lessonGroupId, g2Id),
      ),
    );
  assert.equal(progress.length, 1);
  assert.equal(progress[0]!.status, "tested_out");
});

test("completion is latched: dilution by replenishment never re-locks a cleared group's successor", async () => {
  // PLUS_USER completed g1 earlier; that GET latched a persisted 'completed'
  // row. Simulate the replenisher appending fresh (unmastered) phrases to g1,
  // dropping the live mastered ratio to 2/6 (33%), well below 80%.
  const existing = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, g1Id));
  await db.insert(phrasesTable).values(
    Array.from({ length: 4 }, (_, i) => ({
      lessonId,
      languageCode: LANG,
      categoryId,
      nativeScript: `dilute-${i}`,
      romanized: `dilute-${i}`,
      english: `dilute-${i}`,
      sortOrder: 200 + i,
      stage: "phrase",
      lessonGroupId: g1Id,
      lessonGroupPosition: existing.length + i + 1,
    })),
  );
  const statuses = await groupStatuses(PLUS_USER);
  assert.equal(statuses.get(g1Id), "completed"); // latched, not re-derived away
  assert.notEqual(statuses.get(g2Id), "locked"); // successor never regresses
});

test("race: concurrent Free+Plus replenishment never duplicates positions or crashes", async () => {
  const [a, b] = await Promise.all([
    replenishPhrases({
      languageCode: LANG,
      categoryId,
      userId: PLUS_USER,
      count: 2,
      generate: fakeGenerate(2),
      cooldownMs: -60_000,
      lockKeyPrefix: "test-race-plus",
    }),
    replenishPhrases({
      languageCode: LANG,
      categoryId,
      userId: FREE_USER,
      count: 2,
      generate: fakeGenerate(2),
      cooldownMs: -60_000,
      lockKeyPrefix: "test-race-free",
    }),
  ]);
  assert.equal(a + b, 4); // both writers landed, neither crashed

  // Invariants: no duplicate group positions in the pair, no duplicate
  // (group, position) among phrases, stage purity everywhere.
  const groups = await pairGroups();
  const positions = groups.map((g) => g.position);
  assert.equal(new Set(positions).size, positions.length);
  const phrases = await db
    .select()
    .from(phrasesTable)
    .where(eq(phrasesTable.languageCode, LANG));
  const slots = phrases
    .filter((p) => p.lessonGroupId != null)
    .map((p) => `${p.lessonGroupId}:${p.lessonGroupPosition}`);
  assert.equal(new Set(slots).size, slots.length);
});

// Trigger fallback (July 29, 2026): the composite scope FK was replaced by
// triggers (migration 0030 + startup guard) because the publish diff engine
// cannot order the FK after its unique constraint. These regressions prove
// the triggers enforce the same invariant with the same SQLSTATE (23503).
test("trigger fallback: scope-mismatched phrase insert fails with 23503", async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO phrases (language_code, category_id, native_script, romanized, english, difficulty, stage, lesson_group_id, lesson_group_position)
       VALUES ($1, $2, '__trg_test__', 'trg', 'trigger test', 1, 'phrase', $3, 999)`,
      // Wrong language for g1Id's group scope: the group belongs to LANG.
      ["gu", categoryId, g1Id],
    ),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "23503");
      return true;
    },
  );
});

test("trigger fallback: deleting a referenced lesson group fails with 23503", async () => {
  await assert.rejects(
    pool.query(`DELETE FROM lesson_groups WHERE id = $1`, [g1Id]),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "23503");
      return true;
    },
  );
  // And rekeying its scope columns is equally rejected.
  await assert.rejects(
    pool.query(`UPDATE lesson_groups SET language_code = 'gu' WHERE id = $1`, [
      g1Id,
    ]),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "23503");
      return true;
    },
  );
});

// ── Test-out submission throttle ───────────────────────────────────────────
// Max 3 submissions per user per group per rolling hour, counted from the
// lesson_group_testouts log. THROTTLE_USER is dedicated to these two tests.

test("test-out throttle: the 4th submission within the hour gets 429", async () => {
  // Two prior submissions logged 10 minutes ago…
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  await db.insert(lessonGroupTestoutsTable).values([
    { userId: THROTTLE_USER, lessonGroupId: g2Id, passed: false, createdAt: tenMinAgo },
    { userId: THROTTLE_USER, lessonGroupId: g2Id, passed: false, createdAt: tenMinAgo },
  ]);

  // Earlier replenisher tests may have grown g2, so derive the attempt set
  // from a live sample instead of the stale seeded phrase list.
  const sample = await api(`/lesson-groups/${g2Id}/test-out`, THROTTLE_USER);
  assert.equal(sample.status, 200);
  const attempts = (sample.json.phrases as { id: number }[]).map((p) => ({
    phraseId: p.id,
    evaluationToken: closeToken(THROTTLE_USER, p.id),
  }));

  const submit = () =>
    api(`/lesson-groups/${g2Id}/test-out`, THROTTLE_USER, {
      method: "POST",
      body: JSON.stringify({ attempts }),
    });

  // …the 3rd attempt in the window still goes through (and gets logged)…
  const third = await submit();
  assert.equal(third.status, 200, `3rd submission: ${JSON.stringify(third.json)}`);
  assert.equal(third.json.passed, false);

  // …and the 4th within the same hour is throttled.
  const fourth = await submit();
  assert.equal(fourth.status, 429);

  // The throttled submission was NOT logged, only the 3 in-window rows exist.
  const logged = await db
    .select()
    .from(lessonGroupTestoutsTable)
    .where(eq(lessonGroupTestoutsTable.userId, THROTTLE_USER));
  assert.equal(logged.length, 3);
});

test("test-out throttle 429 shape: Retry-After header + retryAfterSeconds body", async () => {
  // Still saturated from the previous test (3 in-window submissions). The
  // throttle fires before token verification, so a minimal body suffices, // and proves a rate-limited caller learns nothing about sample validity.
  const res = await fetch(`${baseUrl}/lesson-groups/${g2Id}/test-out`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": THROTTLE_USER },
    body: JSON.stringify({
      attempts: [{ phraseId: 1, evaluationToken: "throttled-before-verification" }],
    }),
  });
  assert.equal(res.status, 429);

  // Retry-After header: integer seconds until the oldest in-window submission
  // (10 min ago) ages out of the rolling hour, so ~50 min, never more than 60.
  const retryAfter = Number(res.headers.get("retry-after"));
  assert.ok(Number.isInteger(retryAfter), "Retry-After must be integer seconds");
  assert.ok(retryAfter >= 1 && retryAfter <= 3600, `Retry-After in (0, 1h]: ${retryAfter}`);
  assert.ok(retryAfter <= 50 * 60 + 60, `tracks the oldest in-window row: ${retryAfter}`);

  const json = (await res.json()) as { error?: unknown; retryAfterSeconds?: unknown };
  assert.equal(typeof json.error, "string");
  assert.equal(json.retryAfterSeconds, retryAfter);
});
