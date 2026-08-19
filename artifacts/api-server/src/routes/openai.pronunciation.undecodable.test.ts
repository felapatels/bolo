/**
 * Undecodable recordings degrade to the soft nocatch outcome (Task 1067).
 *
 * Two directions have to hold:
 *  1. When the transcription step raises the dedicated UndecodableAudioError,
 *     the response is the ordinary nocatch, signed token, zero score, the
 *     new distinct cause label, no-fault copy, not a 502.
 *  2. When it raises ANY other error (a service outage, a rate limit), the
 *     route still answers the loud 502 it does today. This is the pin that
 *     stops a later refactor from over-widening the catch.
 */

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";

// ── Shared mock state ────────────────────────────────────────────────────────

class MockUndecodableAudioError extends Error {
  readonly format: string;
  readonly byteLength: number;
  constructor(format: string, byteLength: number, message?: string) {
    super(message ?? `Audio could not be decoded (format=${format} bytes=${byteLength})`);
    this.name = "UndecodableAudioError";
    this.format = format;
    this.byteLength = byteLength;
  }
}

// null = transcribe normally; otherwise every speechToText call throws this.
let sttError: Error | null = null;

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    UndecodableAudioError: MockUndecodableAudioError,
    speechToText: async () => {
      if (sttError) throw sttError;
      return "kem cho";
    },
    ensureCompatibleFormat: async (buf: Buffer) => ({ buffer: buf, format: "wav" }),
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
                    feedback: "Good effort, keep going!",
                    tip: "Try breaking the word into syllables.",
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

const { verifyEvaluation } = await import("../lib/evaluationToken");

// ── Test server ──────────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;
// Captured warn-log payloads so the arrival log (format + byte length) can be
// asserted.
let warnLogs: Array<{ obj: unknown; msg: string }> = [];

before(async () => {
  process.env.SESSION_SECRET ??= "test-secret-for-signing-32-chars!!";
  const { default: openaiRouter } = await import("./openai");

  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = {
      warn: (obj: unknown, msg: string) => warnLogs.push({ obj, msg }),
      error: () => {},
      info: () => {},
    };
    (req as any).userId = "test_undecodable_user";
    (req as any).resolvedPlan = { plan: "plus", chosenLanguage: null };
    next();
  });
  app.use(openaiRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server?.close());

async function postPronunciation(): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/openai/pronunciation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      targetNative: "કેમ છો",
      targetRomanized: "kem chho",
      targetEnglish: "how are you",
      languageName: "Gujarati",
      audioBase64: Buffer.from("not-really-audio").toString("base64"),
    }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("an undecodable recording degrades to a soft nocatch with its own cause", async () => {
  sttError = new MockUndecodableAudioError("webm", 1234);
  warnLogs = [];

  const { status, json } = await postPronunciation();
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.band, "nocatch", "an undecodable recording is a system miss");
  assert.equal(json.score, 0);
  assert.equal(json.passed, false);
  assert.equal(json.xpAwarded, 0);
  assert.equal(json.transcript, "");
  // No-fault copy: nothing suggests the learner did anything wrong.
  assert.ok(!/speak up|louder|closer/i.test(json.feedback), json.feedback);
  assert.ok(/on us, not you/i.test(json.feedback), json.feedback);

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "a signed evaluation token is still issued");
  assert.equal(claims!.nocatchCause, "undecodable_audio", "distinct cause label rides the token");
  assert.equal(claims!.score, 0);
  assert.equal(claims!.band, "nocatch");

  // The log records what actually arrived: format and byte length.
  const arrival = warnLogs.find((l) => /undecodable/i.test(l.msg));
  assert.ok(arrival, `expected an arrival log, got ${JSON.stringify(warnLogs)}`);
  assert.deepEqual(arrival!.obj, { format: "webm", byteLength: 1234 });

  sttError = null;
});

test("any other transcription failure still answers the loud 502", async () => {
  sttError = Object.assign(new Error("Service Unavailable"), { status: 503 });

  const { status, json } = await postPronunciation();
  assert.equal(status, 502, "an outage must stay loud");
  assert.equal(json.error, "Could not understand the recording");
  assert.equal(json.evaluationToken, undefined, "no token on a hard failure");

  sttError = null;
});
