// Entitlement gating for POST /openai/pronunciation (free-tier content policy).
//
// The evaluation endpoint returns the catalog phrase's stored text and signs
// it into the evaluation token, so it must be gated EXACTLY like serving the
// phrase by id (GET /phrases/:id): locked languages keep the id-aware
// exceptions (teaser set while it lasts, plus the language's first stop,
// whatever the teaser state), premium rows stay behind the extended library,
// and every denial is byte-identical to the serving route's 402 so clients
// cannot distinguish (or be confused by) the two gates.
//
// The audio integration is mocked (as in the fast-path suite) so the allow
// path completes deterministically via the sim fast-path with no network.

import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
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
import { eq } from "drizzle-orm";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { signEvaluation } from "../lib/evaluationToken";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { __resetTeaserCacheForTests } from "../lib/teaser";
import { FREE_LANGUAGE } from "../lib/entitlements";

// ─── Module mocks (must be registered before ./openai is imported) ──────────

const stubbedTranscript = "kem chho";

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    speechToText: async () => stubbedTranscript,
    ensureCompatibleFormat: async (buf: Buffer) => ({
      buffer: buf,
      format: "mp3" as const,
    }),
    openai: {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    score: 55,
                    passed: false,
                    feedback: "x",
                    tip: "x",
                  }),
                },
              },
            ],
          }),
        },
      },
    },
    textToSpeechElevenLabs: async () => Buffer.from("fake"),
    textToSpeech: async () => Buffer.from("fake"),
    textToSpeechElevenLabsStream: async () => Buffer.from("fake"),
    convertToWav: async (buf: Buffer) => buf,
    getElevenLabsQuota: async () => ({ character_count: 0, character_limit: 100000 }),
    getElevenLabsUsageStats: async () => ({ character_count: 0 }),
  },
});

// ─── Fixture ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = "test_prn_gating";
const LANG = "__test_lang_prngate";

let app: Express;
let server: Server;
let baseUrl: string;

let teaserIds: number[]; // group 1 positions 1-3 (the taste set)
let fourthPhraseId: number; // group 1 position 4, first-stop, outside the taste set
let premiumPhraseId: number; // premium row in group 1
let group2PhraseId: number; // Stop 2, never accessible to a locked caller

async function postPron(
  phraseId: number,
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${baseUrl}/openai/pronunciation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      phraseId,
      // Ignored when phraseId is set (the stored text is authoritative) but
      // required by the request schema.
      targetNative: "x",
      targetRomanized: "x",
      targetEnglish: "x",
      audioBase64: Buffer.from("fake-audio").toString("base64"),
    }),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body, callers assert on status/text */
  }
  return { status: res.status, json, text };
}

async function getPhrase(
  id: number,
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${baseUrl}/phrases/${id}`);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

function tokenFor(phraseId: number, score: number) {
  return signEvaluation({
    userId: TEST_USER_ID,
    phraseId,
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

async function postAttempt(phraseId: number): Promise<number> {
  const res = await fetch(`${baseUrl}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ evaluationToken: tokenFor(phraseId, 90) }),
  });
  await res.text();
  return res.status;
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
    "SESSION_SECRET must be set to sign evaluation tokens",
  );

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: "prngate@test.local" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values([
      { code: LANG, name: "Prngatish", nativeName: "P", script: "Latin", fontFamily: "x" },
      { code: FREE_LANGUAGE, name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", fontFamily: "x" },
    ])
    .onConflictDoNothing();

  const existingGreetings = await db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.slug, "greetings"),
  });
  let greetingsId: number;
  if (existingGreetings) {
    greetingsId = existingGreetings.id;
  } else {
    const [row] = await db
      .insert(categoriesTable)
      .values({ slug: "greetings", title: "Greetings & Manners", description: "x", iconName: "HandHeart", accent: "#fff" })
      .returning();
    greetingsId = row!.id;
  }

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, titleNative: "x" })
    .returning();
  const [group1] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, position: 1 })
    .returning();
  const [group2] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, position: 2 })
    .returning();

  const phrase = (over: Partial<typeof phrasesTable.$inferInsert>) => ({
    lessonId: lesson!.id,
    languageCode: LANG,
    categoryId: greetingsId,
    // Distinct per row: one topic cannot hold the same phrase text twice
    // (phrases_topic_stage_text_unique).
    nativeScript: `kem chho ${over.sortOrder ?? 0}`,
    romanized: "kem chho",
    english: "x",
    hint: null,
    difficulty: 1,
    sortOrder: 0,
    ...over,
  });

  const rows = await db
    .insert(phrasesTable)
    .values([
      phrase({ lessonGroupId: group1!.id, lessonGroupPosition: 1, sortOrder: 1 }),
      phrase({ lessonGroupId: group1!.id, lessonGroupPosition: 2, sortOrder: 2 }),
      phrase({ lessonGroupId: group1!.id, lessonGroupPosition: 3, sortOrder: 3 }),
      phrase({ lessonGroupId: group1!.id, lessonGroupPosition: 4, sortOrder: 4 }),
      phrase({
        lessonGroupId: group1!.id,
        lessonGroupPosition: 5,
        sortOrder: 5,
        premium: true,
        nativeScript: "__prn_premium_secret",
        romanized: "__prn_premium_secret",
      }),
      phrase({
        lessonGroupId: group2!.id,
        lessonGroupPosition: 1,
        sortOrder: 6,
        nativeScript: "__prn_g2_secret",
        romanized: "__prn_g2_secret",
      }),
    ])
    .returning();
  teaserIds = [rows[0]!.id, rows[1]!.id, rows[2]!.id];
  fourthPhraseId = rows[3]!.id;
  premiumPhraseId = rows[4]!.id;
  group2PhraseId = rows[5]!.id;

  // Routers are imported AFTER the module mocks so the openai route picks up
  // the audio stubs. The learning router is mounted too so every denial can
  // be byte-compared against the serving route, and so the teaser meter can
  // be exhausted through the real /attempts path.
  const { default: openaiRouter } = await import("./openai");
  const { default: learningRouter } = await import("./learning");

  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = { warn: () => {}, error: () => {}, info: () => {} };
    (req as any).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(openaiRouter);
  app.use(learningRouter);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await clearUserRows();
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
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
  server?.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test("locked Stop-2 phrase: evaluation denies byte-identically to serving, nothing leaks", async () => {
  const served = await getPhrase(group2PhraseId);
  const evaluated = await postPron(group2PhraseId);
  assert.equal(served.status, 402);
  assert.equal(evaluated.status, 402);
  assert.deepEqual(evaluated.json, served.json, "denials must be byte-identical");
  assert.ok(!evaluated.text.includes("__prn_g2_secret"), "no phrase text may leak");
  assert.equal(evaluated.json.evaluationToken, undefined);
});

test("premium first-stop phrase: evaluation denies byte-identically to serving", async () => {
  const served = await getPhrase(premiumPhraseId);
  const evaluated = await postPron(premiumPhraseId);
  assert.equal(served.status, 402);
  assert.equal(evaluated.status, 402);
  assert.equal(evaluated.json.reason, "feature_locked");
  assert.deepEqual(evaluated.json, served.json, "denials must be byte-identical");
  assert.ok(!evaluated.text.includes("__prn_premium_secret"), "no phrase text may leak");
});

test("non-premium first-stop phrase evaluates end-to-end for a free caller", async () => {
  const { status, json } = await postPron(fourthPhraseId);
  assert.equal(status, 200);
  assert.equal(json.passed, true, "stubbed exact transcript must pass via the fast-path");
  assert.equal(json.transcript, stubbedTranscript);
  assert.ok(typeof json.evaluationToken === "string", "must return a signed evaluation token");
});

test("after teaser exhaustion the first stop still evaluates; Stop 2 still denies", async () => {
  for (const id of teaserIds) {
    assert.equal(await postAttempt(id), 201);
  }

  const open = await postPron(fourthPhraseId);
  assert.equal(open.status, 200);
  assert.equal(open.json.passed, true);

  const served = await getPhrase(group2PhraseId);
  const evaluated = await postPron(group2PhraseId);
  assert.equal(served.status, 402);
  assert.equal(evaluated.status, 402);
  assert.deepEqual(evaluated.json, served.json, "denials must be byte-identical");
});
