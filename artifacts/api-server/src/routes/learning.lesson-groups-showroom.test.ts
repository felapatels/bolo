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
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { __resetTeaserCacheForTests, TEASER_LIMIT } from "../lib/teaser";

// D1b decision 3: the lesson-groups listing is the journey map's paywall
// "showroom". For teaser and exhausted callers, and ONLY those two states,
// GET /categories/:id/lesson-groups/:lang returns the full group structure
// (counts and statuses only, ZERO phrase content, everything forced locked
// except the marked teaser station) instead of M1's 402. This suite pins the
// exception's exact boundary:
//   - plain-locked (no teaser set) keeps the pre-M1 402 BYTE-identical,
//   - teaser mode marks exactly one accessible station,
//   - exhausted mode locks everything,
//   - showroom mode never writes completion-latch rows,
//   - allowed callers keep the original contract (plus the new stage field).
// Live shared Postgres: test-only ids, self-provisioned tables, full cleanup.
// See .agents/memory/api-server-tests.md and docs/CODEBASE-FACTS.md section 4.
const TEST_USER_ID = "test_lg_showroom";
const LANG = "__test_lang_showroom";
const LANG_PLAIN = "__test_lang_showroom_plain"; // no Greetings group => no teaser
const OTHER_CATEGORY_SLUG = "__test_cat_showroom";

let app: Express;
let server: Server;
let baseUrl: string;

let greetingsId: number;
let createdGreetings = false;
let otherCategoryId: number;
let g1Id: number; // Greetings group 1 (phrase stage, hosts the teaser set)
let g2Id: number; // Greetings group 2 (phrase stage)
let g3Id: number; // Greetings group 3 (sentence stage)
let g4Id: number; // group in the non-Greetings category
let g1PhraseIds: number[] = [];

async function getJson(path: string): Promise<{
  status: number;
  json: any;
  text: string;
}> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body; callers assert on text.
  }
  return { status: res.status, json, text };
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

  // Free user: the whole point is exercising the plan-locked states.
  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Showroom Test" })
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null })
    .where(eq(usersTable.id, TEST_USER_ID));

  await db
    .insert(languagesTable)
    .values([
      {
        code: LANG,
        name: "Showroomish",
        nativeName: "S",
        script: "Latin",
        fontFamily: "sans-serif",
      },
      {
        code: LANG_PLAIN,
        name: "Plainlockish",
        nativeName: "P",
        script: "Latin",
        fontFamily: "sans-serif",
      },
    ])
    .onConflictDoNothing();

  // The teaser set is keyed off the REAL "greetings" slug (lib/teaser.ts).
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
      title: "Showroom Other Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#444444",
      sortOrder: 9302,
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
      { languageCode: LANG, categoryId: otherCategoryId, position: 1 },
    ])
    .returning();
  g1Id = groups[0]!.id;
  g2Id = groups[1]!.id;
  g3Id = groups[2]!.id;
  g4Id = groups[3]!.id;

  const mkPhrase = (
    english: string,
    lessonId: number,
    categoryId: number,
    groupId: number,
    groupPos: number,
    stage: "phrase" | "sentence" = "phrase",
  ) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder: groupPos,
    stage,
    lessonGroupId: groupId,
    lessonGroupPosition: groupPos,
  });

  const rows = await db
    .insert(phrasesTable)
    .values([
      // g1: the teaser set (first 3 phrase-stage phrases of Greetings group 1).
      mkPhrase("t1", greetingsLesson!.id, greetingsId, g1Id, 1),
      mkPhrase("t2", greetingsLesson!.id, greetingsId, g1Id, 2),
      mkPhrase("t3", greetingsLesson!.id, greetingsId, g1Id, 3),
      // g2: phrase stage, never teaser-accessible.
      mkPhrase("p1", greetingsLesson!.id, greetingsId, g2Id, 1),
      mkPhrase("p2", greetingsLesson!.id, greetingsId, g2Id, 2),
      // g3: sentence stage (drives the stage field derivation).
      mkPhrase("s1", greetingsLesson!.id, greetingsId, g3Id, 1, "sentence"),
      mkPhrase("s2", greetingsLesson!.id, greetingsId, g3Id, 2, "sentence"),
      // g4: a group outside Greetings.
      mkPhrase("o1", otherLesson!.id, otherCategoryId, g4Id, 1),
    ])
    .returning();
  g1PhraseIds = rows.slice(0, 3).map((r) => r.id);

  // The per-language teaser cache must resolve AFTER the fixtures exist.
  __resetTeaserCacheForTests();

  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));

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
  await db
    .delete(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, TEST_USER_ID));
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  // FK order: phrases -> lesson_groups + lessons -> categories -> language/user.
  const langs = [LANG, LANG_PLAIN];
  await db.delete(phrasesTable).where(inArray(phrasesTable.languageCode, langs));
  await db
    .delete(lessonGroupsTable)
    .where(inArray(lessonGroupsTable.languageCode, langs));
  await db
    .delete(lessonsTable)
    .where(inArray(lessonsTable.languageCode, langs));
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, OTHER_CATEGORY_SLUG));
  if (createdGreetings) {
    await db.delete(categoriesTable).where(eq(categoriesTable.id, greetingsId));
  }
  await db.delete(languagesTable).where(inArray(languagesTable.code, langs));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// The full per-group key set the showroom may expose. Anything beyond this
// (phrase text, ids of members, audio, hints...) is phrase content and must
// never appear.
const GROUP_KEYS = [
  "id",
  "position",
  "title",
  "phraseCount",
  "attemptedCount",
  "masteredCount",
  "status",
  "stage",
] as const;

function assertNoPhraseContent(group: Record<string, unknown>): void {
  const allowed = new Set<string>([...GROUP_KEYS, "teaserStation"]);
  for (const key of Object.keys(group)) {
    assert.ok(
      allowed.has(key),
      `unexpected key "${key}" on a showroom group — counts and statuses only`,
    );
  }
}

// ── The exception's outer boundary: plain-locked stays a byte-identical 402 ──

test("plain-locked language (no teaser set) keeps the pre-M1 402 byte-identical", async () => {
  const { status, text, json } = await getJson(
    `/categories/${otherCategoryId}/lesson-groups/${encodeURIComponent(LANG_PLAIN)}`,
  );
  assert.equal(status, 402);
  // BYTE-identical to the pre-M1 payload (upgradeRequired() key order in
  // lib/entitlements.ts, serialized by express res.json): the showroom
  // exception provably applies to teaser and exhausted callers only.
  const expected = JSON.stringify({
    error: "upgrade_required",
    upgradeRequired: true,
    reason: "language_locked",
    message: "This language is a paid unlock. Upgrade to start learning it.",
    feature: "allLanguages",
    requiredPlan: "one_language",
  });
  assert.equal(text, expected, "402 body must be byte-identical to pre-M1");
  assert.equal(json.teaser, undefined);
  assert.equal(json.lessonGroups, undefined);
});

// ── Teaser mode: structure present, only the teaser station accessible ──────

test("teaser caller gets the showroom: all locked except the marked teaser station, zero phrase content", async () => {
  const { status, json } = await getJson(
    `/categories/${greetingsId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);

  // Envelope: exactly the list contract plus the showroom fields.
  assert.deepEqual(
    Object.keys(json).sort(),
    ["access", "lessonGroups", "teaser", "unassignedCount"].sort(),
  );
  assert.equal(json.access, "teaser");
  assert.deepEqual(json.teaser, { consumed: 0, limit: TEASER_LIMIT });

  const gs = json.lessonGroups;
  assert.equal(gs.length, 3);
  assert.deepEqual(
    gs.map((g: any) => g.id),
    [g1Id, g2Id, g3Id],
    "position order",
  );

  const [s1, s2, s3] = gs;
  // Only the teaser set's home station is accessible and marked.
  assert.equal(s1.status, "unlocked");
  assert.equal(s1.teaserStation, true);
  assert.equal(s2.status, "locked");
  assert.ok(!("teaserStation" in s2));
  assert.equal(s3.status, "locked");
  assert.ok(!("teaserStation" in s3));

  // Stage derivation rides along.
  assert.equal(s1.stage, "phrase");
  assert.equal(s2.stage, "phrase");
  assert.equal(s3.stage, "sentence");

  // Counts render, phrase content never does.
  assert.equal(s1.phraseCount, 3);
  assert.equal(s3.phraseCount, 2);
  for (const g of gs) assertNoPhraseContent(g);
});

test("showroom spans every category of the locked language; the teaser mark stays in Greetings", async () => {
  const { status, json } = await getJson(
    `/categories/${otherCategoryId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.equal(json.access, "teaser");
  assert.deepEqual(json.teaser, { consumed: 0, limit: TEASER_LIMIT });
  assert.equal(json.lessonGroups.length, 1);
  assert.equal(json.lessonGroups[0].status, "locked");
  assert.ok(!("teaserStation" in json.lessonGroups[0]));
  assertNoPhraseContent(json.lessonGroups[0]);
});

// ── Exhausted mode: everything locked, and no completion-latch writes ────────

test("exhausted caller: everything locked (even a fully mastered group) and no latch rows written", async () => {
  // Master ALL of g1 directly in the attempts table: consumes all 3 teaser
  // slots AND puts g1 at 100% mastery — which must still render locked, and
  // must NOT be latched as completed for a plan-locked language.
  for (const pid of g1PhraseIds) {
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

  const { status, json } = await getJson(
    `/categories/${greetingsId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  assert.equal(json.access, "exhausted");
  assert.deepEqual(json.teaser, { consumed: TEASER_LIMIT, limit: TEASER_LIMIT });

  for (const g of json.lessonGroups) {
    assert.equal(g.status, "locked", `group ${g.id} must be forced locked`);
    assert.ok(!("teaserStation" in g), "no teaser mark in exhausted mode");
    assertNoPhraseContent(g);
  }
  // The mastery still shows in the counts (the learner's own attempt data)...
  const s1 = json.lessonGroups[0];
  assert.equal(s1.masteredCount, 3);
  // ...but the read must NOT have latched a completion row.
  const latched = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, TEST_USER_ID));
  assert.equal(latched.length, 0, "showroom mode must never write latch rows");
});

// ── Allowed callers: original contract untouched, stage added, latch resumes ─

test("allowed (Plus) caller keeps the original contract with stage, and latching resumes", async () => {
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER_ID));

  const { status, json } = await getJson(
    `/categories/${greetingsId}/lesson-groups/${encodeURIComponent(LANG)}`,
  );
  assert.equal(status, 200);
  // No showroom envelope for an allowed language.
  assert.deepEqual(
    Object.keys(json).sort(),
    ["lessonGroups", "unassignedCount"].sort(),
  );

  const [s1, s2, s3] = json.lessonGroups;
  assert.equal(s1.status, "completed", "g1 is 100% mastered");
  assert.equal(s2.status, "unlocked", "predecessor completed");
  assert.equal(s3.status, "locked");
  assert.equal(s1.stage, "phrase");
  assert.equal(s3.stage, "sentence");
  assert.ok(!("teaserStation" in s1), "no teaser mark for allowed callers");

  // The completion latch is back in force outside showroom mode.
  const latched = await db
    .select()
    .from(lessonGroupProgressTable)
    .where(eq(lessonGroupProgressTable.userId, TEST_USER_ID));
  assert.equal(latched.length, 1);
  assert.equal(latched[0]!.lessonGroupId, g1Id);
  assert.equal(latched[0]!.status, "completed");
});

// ── Sentence-stage groups are server-denied for non-Plus callers ─────────────
// The journey UI dialog-gates sentence stations, but a deep link
// (?group=<sentence group id>) hits GET /lesson-groups/:id/phrases directly.
// The sentence stage must deny exactly like /categories/:id/sentences/:lang —
// 402 feature_locked, zero sentence text — never lean on client gating. The
// fixture lives on the REAL free-allowed language so the language gate passes
// and only the sentence gate can deny.

test("sentence-stage group phrases: 402 feature_locked for non-Plus, content for Plus", async () => {
  const [hiLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: "hi", categoryId: otherCategoryId, titleNative: "HG" })
    .returning();
  const [hiGroup] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: "hi", categoryId: otherCategoryId, position: 99 })
    .returning();
  const hiRows = await db
    .insert(phrasesTable)
    .values(
      (["__test_hi_sentence_1", "__test_hi_sentence_2"] as const).map(
        (english, i) => ({
          lessonId: hiLesson!.id,
          languageCode: "hi",
          categoryId: otherCategoryId,
          nativeScript: english,
          romanized: english,
          english,
          sortOrder: i + 1,
          stage: "sentence" as const,
          lessonGroupId: hiGroup!.id,
          lessonGroupPosition: i + 1,
        }),
      ),
    )
    .returning();

  try {
    // Plus caller (tier flipped by the previous test) gets the sentences.
    let r = await getJson(`/lesson-groups/${hiGroup!.id}/phrases`);
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 2);

    // Non-Plus caller: authoritative 402 mirroring the category sentences
    // gate, and no sentence text in the body.
    await db
      .update(usersTable)
      .set({ tier: "free", subscriptionStatus: null })
      .where(eq(usersTable.id, TEST_USER_ID));
    r = await getJson(`/lesson-groups/${hiGroup!.id}/phrases`);
    assert.equal(r.status, 402);
    assert.equal(r.json.error, "upgrade_required");
    assert.equal(r.json.reason, "feature_locked");
    assert.equal(r.json.feature, "sentences");
    assert.ok(
      !r.text.includes("__test_hi_sentence"),
      "no sentence text may leak to a denied caller",
    );
  } finally {
    await db
      .delete(phrasesTable)
      .where(
        inArray(
          phrasesTable.id,
          hiRows.map((row) => row.id),
        ),
      );
    await db
      .delete(lessonGroupsTable)
      .where(eq(lessonGroupsTable.id, hiGroup!.id));
    await db.delete(lessonsTable).where(eq(lessonsTable.id, hiLesson!.id));
  }
});
