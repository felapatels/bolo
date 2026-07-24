// Tests for the sim ≥ 0.93 fast-path in POST /openai/pronunciation.
//
// The fast-path short-circuits the LLM call and returns a deterministic score
// whenever the transcript is phonetically very close to the target. The
// applyScoreGuards guardrails are intentionally NOT run on this path (the
// near-match-floor guard would always override anyway), so the key questions are:
//
//  1. Does the fast-path fire and return passed=true with no LLM call when
//     sim ≥ 0.93?
//  2. Does a partial-match attempt (sim below 0.93) still reach the full
//     LLM + guardrail path?
//  3. Can a transcript simultaneously match the target at ≥ 0.93 AND match a
//     different phrase at ≥ 0.93 (the edge case)? If so, the fast-path fires
//     and returns passed=true — by design, since near-match-floor would anyway.
//
// Parts A and B cover the three cases at the unit level (compareToTarget only,
// no HTTP). Part C covers cases 1 and 2 through the real Express route with the
// audio module mocked so we control the transcript and can count LLM calls.

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";

import { compareToTarget } from "../lib/pronunciationGuards";

// ─── Shared mock state ────────────────────────────────────────────────────────
// The mock closures read these module-level variables, so each test can control
// what the faked STT returns and count how many times the LLM is called.

let stubbedTranscript = "";
let llmCallCount = 0;
const LLM_SCORE = 55; // well below 80 so any passing result is from the fast-path

// ─── Module mocks (must be registered before ./openai is imported) ────────────
// node:test runs each file in its own process so the module cache is fresh here.

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    // STT: return whatever the test has loaded into stubbedTranscript.
    speechToText: async () => stubbedTranscript,

    // Format conversion: pass the buffer through unchanged.
    ensureCompatibleFormat: async (buf: Buffer) => ({
      buffer: buf,
      format: "mp3" as const,
    }),

    // LLM: count the call and return a below-pass score so we can distinguish
    // "fast-path passed" from "LLM path passed".
    openai: {
      chat: {
        completions: {
          create: async () => {
            llmCallCount++;
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      score: LLM_SCORE,
                      passed: false,
                      feedback: "Good effort, keep going!",
                      tip: "Try breaking the word into syllables.",
                    }),
                  },
                },
              ],
            };
          },
        },
      },
    },

    // TTS helpers: unused by the pronunciation endpoint but imported by the
    // same module so they must exist to avoid "is not a function" at route-mount.
    textToSpeechElevenLabs: async () => Buffer.from("fake"),
    textToSpeech: async () => Buffer.from("fake"),
    // Used by parrotChat.ts (imported transitively via openai.ts route file).
    textToSpeechElevenLabsStream: async () => Buffer.from("fake"),
    convertToWav: async (buf: Buffer) => buf,
    // Used by elevenLabsQuotaMonitor.ts.
    getElevenLabsQuota: async () => ({ character_count: 0, character_limit: 100000 }),
    getElevenLabsUsageStats: async () => ({ character_count: 0 }),
  },
});

// ─── Express test server ──────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

before(async () => {
  assert.ok(
    process.env.SESSION_SECRET,
    "SESSION_SECRET must be set (needed by signEvaluation)",
  );

  // Import the router AFTER the module mocks are registered so it picks up the
  // stubs instead of the real audio integration.
  const { default: openaiRouter } = await import("./openai");

  const app = express();
  app.use(express.json());

  // Stub req.log (Pino is not wired in test apps).
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).log = { warn: () => {}, error: () => {}, info: () => {} };
    next();
  });

  // Stub userId so the route doesn't reject as unauthenticated.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).userId = "test_fast_path_user";
    next();
  });

  app.use(openaiRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server?.close();
});

// Helper: POST to /openai/pronunciation with the given target and a dummy audio
// payload (the mocked speechToText ignores the actual bytes).
async function postPronunciation(
  targetNative: string,
  targetRomanized: string,
  targetEnglish = "test phrase",
  languageName = "Gujarati",
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/openai/pronunciation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      targetNative,
      targetRomanized,
      targetEnglish,
      languageName,
      audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
    }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Part A — Pure unit tests: compareToTarget edge case
//
// These prove that the edge case is real and explain why the fast-path design
// (no wrong-phrase-cap) is safe: near-match-floor would override anyway.
// ═══════════════════════════════════════════════════════════════════════════════

test("compareToTarget: near-exact match lands at sim ≥ 0.93 (fast-path condition is met)", () => {
  // "kem cho" is a slight romanisation variant of "kem chho" — folds to the
  // same phonetic key after normalizeLatin, so sim should approach 1.0.
  const cmp = compareToTarget("kem cho", "કેમ છો", "kem chho");
  assert.ok(cmp.comparable, "should be comparable (Latin transcript vs Latin target)");
  assert.ok(
    cmp.sim >= 0.93,
    `expected sim ≥ 0.93 for near-exact match, got ${cmp.sim}`,
  );
});

test("compareToTarget: partial match lands below sim 0.93 (fast-path condition NOT met)", () => {
  // "kem" is clearly an attempt at "kem chho" but is missing the second
  // syllable — should be comparable but below the fast-path threshold.
  const cmp = compareToTarget("kem", "કેમ છો", "kem chho");
  assert.ok(cmp.comparable, "should be comparable");
  assert.ok(
    cmp.sim < 0.93,
    `expected sim < 0.93 for partial match, got ${cmp.sim}`,
  );
  // Must also be a real attempt, not garbled noise.
  assert.ok(
    cmp.sim >= 0.3,
    `expected sim ≥ 0.3 (real attempt), got ${cmp.sim}`,
  );
});

test("compareToTarget edge case: transcript can simultaneously match target AND a different phrase at ≥ 0.85", () => {
  // Very short, similar words (single syllable) can produce high similarity
  // against both the target and a sibling. This is the scenario the task
  // description flags: "phonetically matches a different phrase while also
  // matching the target at ≥ 0.85". On the fast-path the wrong-phrase-cap is
  // intentionally skipped — the near-match-floor would override it anyway.
  const target = { native: "ā", romanized: "aa" };
  const sibling = { nativeScript: "â", romanized: "a" };

  const targetSim = compareToTarget("aa", target.native, target.romanized);
  const sibSim = compareToTarget("aa", sibling.nativeScript, sibling.romanized);

  // Both must be comparable and both must score ≥ 0.85 to confirm the edge
  // case is reachable.
  assert.ok(targetSim.comparable && targetSim.sim >= 0.85,
    `target sim should be ≥ 0.85, got ${targetSim.sim} (comparable=${targetSim.comparable})`);
  assert.ok(sibSim.comparable && sibSim.sim >= 0.85,
    `sibling sim should be ≥ 0.85, got ${sibSim.sim} (comparable=${sibSim.comparable})`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Part B — Pure unit tests: threshold boundary
// ═══════════════════════════════════════════════════════════════════════════════

test("compareToTarget: exact-same string gives sim = 1.0", () => {
  const cmp = compareToTarget("kem chho", "કેમ છો", "kem chho");
  assert.ok(cmp.comparable);
  assert.equal(cmp.sim, 1);
});

test("compareToTarget: completely unrelated transcript gives low sim", () => {
  const cmp = compareToTarget("hello world friend", "કેમ છો", "kem chho");
  assert.ok(cmp.comparable);
  assert.ok(cmp.sim < 0.5, `expected sim < 0.5, got ${cmp.sim}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Part C — Route integration tests (mocked audio module)
// ═══════════════════════════════════════════════════════════════════════════════

test("fast-path: sim ≥ 0.93 → passed=true, no LLM call", async () => {
  // "kem cho" normalises to effectively the same phonetic key as "kem chho"
  // (chh→ch fold), producing sim = 1.0 ≥ 0.93 and triggering the fast-path.
  stubbedTranscript = "kem cho";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.passed, true, "fast-path must return passed=true");
  assert.ok(json.score >= 85, `fast-path score must be ≥ 85, got ${json.score}`);
  assert.equal(llmCallCount, 0, "fast-path must not call the LLM");
  assert.ok(typeof json.evaluationToken === "string", "must return a signed evaluation token");
  assert.equal(json.transcript, "kem cho", "transcript in response must match what STT returned");
});

test("fast-path: clearly wrong word does not pass (score < 80, passed=false)", async () => {
  // "hello world" is entirely unrelated to "kem chho" — sim is far below 0.93
  // so the fast-path must not fire; the LLM mock returns LLM_SCORE=55 < 80
  // and the partial-match-cap guard ensures score stays below 80.
  stubbedTranscript = "hello world";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.passed, false, "wrong word must not pass");
  assert.ok(json.score < 80, `wrong word score must be < 80, got ${json.score}`);
});

test("fast-path: sim ≥ 0.95 → score exactly 90", async () => {
  // An exact transcript match normalises to sim = 1.0, so score should be 90.
  stubbedTranscript = "kem chho";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200);
  assert.equal(json.passed, true);
  assert.equal(json.score, 90, `expected score 90 for sim ≥ 0.95, got ${json.score}`);
  assert.equal(llmCallCount, 0, "must not call the LLM");
});

test("partial-match (sim 0.50–0.84): LLM path is reached", async () => {
  // "kem" is clearly an attempt at "kem chho" but only partial — should fall
  // below the 0.85 threshold so the route calls the LLM.
  stubbedTranscript = "kem";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.ok(llmCallCount >= 1, `expected at least one LLM call for partial match, got ${llmCallCount}`);
  // The LLM mock returns LLM_SCORE (55) < 80, so passed must be false here
  // (no fast-path floor would rescue it).
  assert.equal(json.passed, false, "partial match with LLM_SCORE=55 should not pass");
});

test("partial-match: guardrails run (partial-match-cap prevents passing on low sim)", async () => {
  // Even if we set the LLM to say 88, the partial-match-cap guard should
  // clamp it below 80 because sim("kem", "kem chho") < 0.70. This confirms
  // applyScoreGuards IS exercised on the LLM path, unlike the fast-path.
  //
  // We can't dynamically swap the LLM score inside mock.module, so we test
  // this via applyScoreGuards directly (same guards the route calls).
  const { applyScoreGuards } = await import("../lib/pronunciationGuards");
  const result = applyScoreGuards({
    score: 88,
    passed: true,
    transcript: "kem",
    targetNative: "કેમ છો",
    targetRomanized: "kem chho",
  });
  assert.equal(result.guard, "partial-match-cap");
  assert.ok(result.score < 80, `guardrail should clamp below 80, got ${result.score}`);
  assert.equal(result.passed, false);
});

test("empty transcript: route returns passed=false, no LLM call", async () => {
  // If STT hears nothing, the route returns a fixed "couldn't hear" response
  // before reaching either the fast-path or the LLM.
  stubbedTranscript = "";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200);
  assert.equal(json.passed, false);
  assert.equal(json.score, 0);
  assert.equal(llmCallCount, 0, "empty transcript must not reach the LLM");
});
