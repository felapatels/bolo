/**
 * Noise production baseline, through the real pronunciation route.
 *
 * Three things have to hold:
 *  1. A scored attempt's signed token carries the derived SNR measurement.
 *  2. If the measurement fails, the learner's result is byte-identical to the
 *     run where it succeeded, scoring never depends on it.
 *  3. An attempt that fails to score carries its cause label for EVERY learner
 *     (the label only; the transcript-bearing sidecars stay on their allowlist,
 *     and this test user is not on it).
 */

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";

// ── Synthetic clip (a quiet opening, then "speech") ──────────────────────────

const SAMPLE_RATE = 16_000;

function wav(samples: number[]): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s))), i * 2),
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const CLIP = wav([
  ...new Array(Math.round(SAMPLE_RATE * 0.3)).fill(0).map((_, i) => Math.sin(i) * 40),
  ...new Array(SAMPLE_RATE)
    .fill(0)
    .map((_, i) => Math.sin((2 * Math.PI * 180 * i) / SAMPLE_RATE) * 8000),
]);

// ── Shared mock state ────────────────────────────────────────────────────────

let stubbedTranscript = "kem cho";
// "wav" means the pipeline already produced PCM (no conversion needed);
// "webm" routes the measurement through convertToWav, which we can fail.
let stubbedFormat: "wav" | "webm" = "wav";
let convertShouldThrow = false;

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    speechToText: async () => stubbedTranscript,
    ensureCompatibleFormat: async (buf: Buffer) => ({
      buffer: buf,
      format: stubbedFormat,
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
    convertToWav: async (buf: Buffer) => {
      if (convertShouldThrow) throw new Error("ffmpeg unavailable");
      return buf;
    },
    getElevenLabsQuota: async () => ({ character_count: 0, character_limit: 100000 }),
    getElevenLabsUsageStats: async () => ({ character_count: 0 }),
  },
});

const { verifyEvaluation } = await import("../lib/evaluationToken");

// ── Test server ──────────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.SESSION_SECRET ??= "test-secret-for-signing-32-chars!!";
  const { default: openaiRouter } = await import("./openai");

  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = { warn: () => {}, error: () => {}, info: () => {} };
    (req as any).userId = "test_noise_baseline_user";
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
      audioBase64: CLIP.toString("base64"),
    }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("a scored attempt's token carries the derived noise measurement", async () => {
  stubbedTranscript = "kem cho";
  stubbedFormat = "wav";
  convertShouldThrow = false;

  const { status, json } = await postPronunciation();
  assert.equal(status, 200, JSON.stringify(json));

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "token must verify");
  assert.ok(
    typeof claims!.snrDb === "number",
    `expected a measurement on the token, got ${claims!.snrDb}`,
  );
  assert.ok(
    claims!.snrDb! > 25,
    `a clean clip should read as quiet, got ${claims!.snrDb}`,
  );
  assert.equal(claims!.nocatchCause, undefined, "a scored attempt has no failure cause");
});

test("a measurement failure leaves the learner's result untouched", async () => {
  stubbedTranscript = "kem cho";

  stubbedFormat = "wav";
  convertShouldThrow = false;
  const measured = await postPronunciation();

  // Force the measurement down the conversion path and blow it up there.
  stubbedFormat = "webm";
  convertShouldThrow = true;
  const unmeasured = await postPronunciation();

  assert.equal(unmeasured.status, 200, "the attempt must still score");
  assert.equal(unmeasured.json.score, measured.json.score, "same score");
  assert.equal(unmeasured.json.passed, measured.json.passed, "same verdict");
  assert.equal(unmeasured.json.band, measured.json.band, "same band");
  assert.equal(unmeasured.json.transcript, measured.json.transcript, "same transcript");

  const claims = verifyEvaluation(unmeasured.json.evaluationToken);
  assert.ok(claims, "the token is still issued");
  assert.equal(claims!.snrDb, null, "the measurement is simply absent");

  convertShouldThrow = false;
  stubbedFormat = "wav";
});

test("an attempt that fails to score carries its cause label (for every learner)", async () => {
  // Empty transcript from both passes → the system heard nothing.
  stubbedTranscript = "";
  stubbedFormat = "wav";

  const { status, json } = await postPronunciation();
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.band, "nocatch", "an unheard attempt is a system miss");

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims);
  assert.equal(
    claims!.nocatchCause,
    "empty_audio_or_silence",
    "the cause label must ride the token, not just the allowlisted sidecar",
  );
  assert.ok(
    typeof claims!.snrDb === "number",
    "a failed attempt is exactly where the noise number matters most",
  );

  stubbedTranscript = "kem cho";
});
