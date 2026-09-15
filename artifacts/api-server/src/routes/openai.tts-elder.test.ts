// POST /openai/tts with speaker "elder": Answer Back's keeper speaks in the
// ELDER's voice, not the coach's.
//
// Owner ruling 2026-09-15 (option A), under the 2026-09-13 voice roles rule
// ("Bolo Bird = coach voice (they should be the same) elder should be
// different"). Found by the SEA parity review: the keeper's line went through
// the coach's phrase identity, and no existing field could select the elder.
//
// What this file pins, against a real database (tts_cache and the consent
// columns are the parts worth not mocking):
//  1. The COACH DEFAULT IS UNCHANGED: no speaker and speaker "coach" both read
//     the exact phrase key the route has always built, and never touch the
//     elder's synthesis.
//  2. The ELDER uses his own identity (India: Chacha-ji's echo, his model and
//     his instructions) and writes under elderPhraseCacheKey, never the coach's
//     row, and his take goes through the same background verification.
//  3. The GUARDS HOLD for him: an unknown speaker is a 400 from the generated
//     zod schema, an elder with no language is a 400, and a learner who
//     declined AI consent is refused before anything is synthesized.
//
// Synthesis and verification are mocked: no OpenAI or ElevenLabs call is made.
import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Request, Response, NextFunction } from "express";

// ─── What the mocks saw ───────────────────────────────────────────────────────
type SpeechCall = { model: string; voice: string; input: string; instructions?: string };
let speechCalls: SpeechCall[] = [];
let elevenLabsCalls = 0;
let verifyCalls: { cacheKey: string; text: string; languageCode?: string }[] = [];
const ELDER_AUDIO = Buffer.from("ELDER_TAKE_BYTES");

// ─── Module mocks (registered before ./openai is imported) ────────────────────
mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    speechToText: async () => "",
    ensureCompatibleFormat: async (buf: Buffer) => ({ buffer: buf, format: "mp3" as const }),
    openai: {
      audio: {
        speech: {
          create: async (args: SpeechCall) => {
            speechCalls.push(args);
            return { arrayBuffer: async () => ELDER_AUDIO };
          },
        },
      },
      chat: { completions: { create: async () => ({ choices: [{ message: { content: "{}" } }] }) } },
    },
    textToSpeechElevenLabs: async () => {
      elevenLabsCalls++;
      return Buffer.from("COACH_FRESH");
    },
    textToSpeech: async () => {
      elevenLabsCalls++;
      return Buffer.from("COACH_FALLBACK");
    },
    textToSpeechElevenLabsStream: async () => Buffer.from("fake"),
    convertToWav: async (buf: Buffer) => buf,
    getElevenLabsQuota: async () => ({ character_count: 0, character_limit: 100000 }),
    getElevenLabsUsageStats: async () => ({ character_count: 0 }),
  },
});

mock.module("../lib/ttsCacheAudit", {
  namedExports: {
    verifyServedTakeInBackground: (args: { cacheKey: string; text: string; languageCode?: string }) => {
      verifyCalls.push({ cacheKey: args.cacheKey, text: args.text, languageCode: args.languageCode });
    },
  },
});

const express = (await import("express")).default;
const { db, pool, ttsCacheTable, usersTable } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: openaiRouter } = await import("./openai");
const { guardAiRequests } = await import("../middlewares/guardAiRequests");
const { writeAiConsent } = await import("../lib/aiConsent");
const { ensureUsersColumns } = await import("../lib/testDbCompat");
const { phraseTtsCacheKey } = await import("../lib/ttsCache");
const { phraseAudioIdentity, TTS_PROVIDER } = await import("../lib/ttsConfig");
const { getVoiceIdForLanguage } = await import("../lib/languageVoice");
const {
  CHACHA_TTS_INSTRUCTIONS,
  CHACHA_TTS_MODEL,
  CHACHA_TTS_VOICE,
  elderPhraseCacheKey,
} = await import("../lib/chachaStrings");

const RUN = `_${process.pid}`;
// A real Hindi keeper line, suffixed so two runs never share a row.
const TEXT = `आप कैसे हैं?${RUN}`;
const LANG = "hi";
const LANG_NAME = "Hindi";
const DECLINED_USER = `test_tts_elder_declined${RUN}`;
const COACH_AUDIO = "b64_COACH_CACHED==";

/** The coach key exactly as the route builds it for a signed-out request (no Plus voice). */
function coachKey(): string {
  const identity = phraseAudioIdentity(LANG);
  const voice = TTS_PROVIDER === "elevenlabs" ? getVoiceIdForLanguage(LANG) : identity.voice;
  return phraseTtsCacheKey(TEXT, identity.provider, identity.model, voice, LANG_NAME);
}

let server: Server;
let baseUrl: string;

async function postTts(body: unknown, user?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/openai/tts`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function rowFor(cacheKey: string) {
  return db.query.ttsCacheTable.findFirst({ where: eq(ttsCacheTable.cacheKey, cacheKey) });
}

/** The cache write is fire-and-forget; give it a moment to land. */
async function eventuallyRow(cacheKey: string) {
  for (let i = 0; i < 50; i++) {
    const row = await rowFor(cacheKey);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 20));
  }
  return undefined;
}

before(async () => {
  await ensureUsersColumns();
  await db.insert(usersTable).values({ id: DECLINED_USER, displayName: "TTS Elder Declined" }).onConflictDoNothing();
  await writeAiConsent(DECLINED_USER, false);
  await db.delete(ttsCacheTable).where(inArray(ttsCacheTable.cacheKey, [coachKey(), elderPhraseCacheKey(TEXT, LANG)]));
  await db.insert(ttsCacheTable).values({ cacheKey: coachKey(), audioBase64: COACH_AUDIO, format: "mp3" });

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = { info: () => {}, warn: () => {}, error: () => {} };
    const user = req.header("x-test-user");
    if (user) (req as any).userId = user;
    next();
  });
  // The production order from routes/index.ts: the consent guard sits in front
  // of the openai router, so the elder inherits it by construction.
  app.use(guardAiRequests);
  app.use(openaiRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  speechCalls = [];
  elevenLabsCalls = 0;
  verifyCalls = [];
});

after(async () => {
  await db.delete(ttsCacheTable).where(inArray(ttsCacheTable.cacheKey, [coachKey(), elderPhraseCacheKey(TEXT, LANG)]));
  await db.delete(usersTable).where(eq(usersTable.id, DECLINED_USER));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("no speaker is the coach: the same phrase key as always, and the elder is never asked", async () => {
  const { status, json } = await postTts({ text: TEXT, languageName: LANG_NAME, languageCode: LANG });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.audioBase64, COACH_AUDIO, "served from the coach's existing row");
  assert.equal(speechCalls.length, 0);
  assert.equal(elevenLabsCalls, 0);
});

test("speaker coach is identical to no speaker", async () => {
  const { status, json } = await postTts({ text: TEXT, languageName: LANG_NAME, languageCode: LANG, speaker: "coach" });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.audioBase64, COACH_AUDIO);
  assert.equal(speechCalls.length, 0);
  assert.equal(elevenLabsCalls, 0);
});

test("speaker elder speaks in Chacha-ji's own voice and writes his own row, verified", async () => {
  const { status, json } = await postTts({ text: TEXT, languageName: LANG_NAME, languageCode: LANG, speaker: "elder" });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.audioBase64, ELDER_AUDIO.toString("base64"), "not the coach's cached take");
  assert.equal(elevenLabsCalls, 0, "the coach's synthesiser is never reached");
  assert.equal(speechCalls.length, 1);
  assert.deepEqual(
    { model: speechCalls[0]!.model, voice: speechCalls[0]!.voice, input: speechCalls[0]!.input, instructions: speechCalls[0]!.instructions },
    { model: CHACHA_TTS_MODEL, voice: CHACHA_TTS_VOICE, input: TEXT, instructions: CHACHA_TTS_INSTRUCTIONS },
  );

  const elderKey = elderPhraseCacheKey(TEXT, LANG);
  const row = await eventuallyRow(elderKey);
  assert.ok(row, "the elder's take is cached under his own key");
  assert.equal(row!.audioBase64, ELDER_AUDIO.toString("base64"));
  assert.equal((await rowFor(coachKey()))!.audioBase64, COACH_AUDIO, "the coach's row is untouched");

  for (let i = 0; i < 50 && verifyCalls.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(verifyCalls, [{ cacheKey: elderKey, text: TEXT, languageCode: LANG }]);
});

test("a second elder play is a cache hit on his row, with no new synthesis", async () => {
  await eventuallyRow(elderPhraseCacheKey(TEXT, LANG));
  const { status, json } = await postTts({ text: TEXT, languageCode: LANG, speaker: "elder" });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.audioBase64, ELDER_AUDIO.toString("base64"));
  assert.equal(speechCalls.length, 0);
});

test("the elder ignores the coach's voice controls: a preview voice cannot re-voice or gate him", async () => {
  const { status, json } = await postTts({
    text: TEXT,
    languageCode: LANG,
    speaker: "elder",
    previewVoiceId: getVoiceIdForLanguage(LANG),
    voice: "nova",
  });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.audioBase64, ELDER_AUDIO.toString("base64"));
});

test("an unknown speaker is refused by the generated schema, and nothing is synthesized", async () => {
  const { status } = await postTts({ text: TEXT, languageCode: LANG, speaker: "bird" });
  assert.equal(status, 400);
  assert.equal(speechCalls.length, 0);
  assert.equal(elevenLabsCalls, 0);
});

test("an elder request with no language is refused: his voice and key are per language", async () => {
  const { status, json } = await postTts({ text: `${TEXT} nolang`, languageName: LANG_NAME, speaker: "elder" });
  assert.equal(status, 400);
  assert.equal(json.error, "speaker elder needs languageCode");
  assert.equal(speechCalls.length, 0);
});

test("a learner who declined AI consent is refused for the elder too, before any synthesis", async () => {
  const { status, json } = await postTts(
    { text: `${TEXT} consent`, languageCode: LANG, speaker: "elder" },
    DECLINED_USER,
  );
  assert.equal(status, 403, JSON.stringify(json));
  assert.equal(json.reason, "ai_consent_required");
  assert.equal(speechCalls.length, 0);
});
