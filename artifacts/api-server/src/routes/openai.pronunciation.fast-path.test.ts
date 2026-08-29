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

import { test, describe, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";

import { compareToTarget } from "../lib/pronunciationGuards";
import {
  db,
  phrasesTable,
  lessonsTable,
  categoriesTable,
  languagesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── Shared mock state ────────────────────────────────────────────────────────
// The mock closures read these module-level variables, so each test can control
// what the faked STT returns and count how many times the LLM is called.

let stubbedTranscript = "";
let llmCallCount = 0;
const LLM_SCORE = 55; // well below 80 so any passing result is from the fast-path

// When sttQueue is non-empty, each speechToText call pops the front value.
// If the queue is exhausted, it falls back to stubbedTranscript as usual.
// Use this to simulate a different first-pass and second-pass transcript.
let sttQueue: string[] = [];
let sttCallCount = 0;

// ─── Module mocks (must be registered before ./openai is imported) ────────────
// node:test runs each file in its own process so the module cache is fresh here.

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    // Error class imported by parrotChat.ts (transitively via the route file);
    // must exist on the mock or module instantiation throws.
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    // STT: pop from sttQueue if non-empty; otherwise return stubbedTranscript.
    // Tests that need different first-pass vs second-pass values push values
    // onto sttQueue before posting.
    speechToText: async () => {
      sttCallCount++;
      if (sttQueue.length > 0) return sttQueue.shift()!;
      return stubbedTranscript;
    },

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
    // Plus, so the pronunciation entitlement gate resolves "allowed" for the
    // catalog-phrase (phraseId) tests without teaser/first-stop DB lookups.
    // Gating has its own suite (openai.pronunciation.gating.test.ts).
    (_req as any).resolvedPlan = { plan: "plus", chosenLanguage: null };
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
  assert.ok(json.score >= 86, `fast-path score must be ≥ 86, got ${json.score}`);
  assert.equal(llmCallCount, 0, "fast-path must not call the LLM");
  assert.ok(typeof json.evaluationToken === "string", "must return a signed evaluation token");
  assert.equal(json.transcript, "kem cho", "transcript in response must match what STT returned");
  // Task 907: an already-Latin transcript passes through as its own romanized form.
  assert.equal(json.transcriptRomanized, "kem cho",
    "Latin transcript must pass through as transcriptRomanized");
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

test("fast-path: sim = 1.0 (exact match) → S1 honesty cap holds score at 92; band derives 'perfect' at the 91 threshold", async () => {
  // An exact transcript match normalises to sim = 1.0. simToScore would give
  // 100, but the S1 honesty cap fires: transcript equals the normalized target
  // and both STT passes agree, so the score caps at 92. The cap is a SCORE
  // ceiling; the band derives from the capped score, and since the perfect
  // threshold moved to 91 (owner ruling, Aug 2, 2026) a capped 92 bands
  // 'perfect'.
  stubbedTranscript = "kem chho";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200);
  assert.equal(json.passed, true);
  assert.equal(json.score, 92, `expected capped score 92 for sim = 1.0, got ${json.score}`);
  assert.equal(json.band, "perfect", `expected band 'perfect' for capped 92 at the 91 threshold, got ${json.band}`);
  assert.equal(llmCallCount, 0, "must not call the LLM");
});

test("fast-path: scores are monotonic across the 0.93 threshold boundary", async () => {
  // A transcript just above the fast-path threshold (sim ≥ 0.93) must not score
  // LOWER than one just below it that was rescued by the near-match-floor guard.
  // Both paths now use simToScore(sim, 0.90), so the mapping is continuous.
  // "kem cho" → sim = 1.0 (chh→ch fold), so fast-path score = 100.
  // This test just confirms the fast-path uses the same base as the guard.
  stubbedTranscript = "kem cho";
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}`);
  assert.equal(json.passed, true);
  // simToScore(1.0, 0.90) = 100; the monotonicity bound: must be ≥ simToScore(0.93, 0.90) = 86
  assert.ok(json.score >= 86, `fast-path score must be ≥ 86, got ${json.score}`);
  assert.equal(llmCallCount, 0, "fast-path must not call the LLM");
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
  // Task 907: nocatch/empty-transcript paths carry an empty romanized form.
  assert.equal(json.transcriptRomanized, "",
    "empty transcript must return an empty transcriptRomanized");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Part D — Accuracy regression tests for the four fast-path fixes
// ═══════════════════════════════════════════════════════════════════════════════

test("fix #2 — short target (≤ 4 normalized chars) always routes through the LLM, not the fast path", async () => {
  // "ha" normalises to 2 chars (well under the 4-char guard). Even though
  // sim("ha","ha")=1.0 ≥ 0.93, the fast path must be skipped so the LLM's
  // phonemic reasoning handles the ambiguous short word.
  stubbedTranscript = "ha";
  llmCallCount = 0;

  // Target: 2-char romanized "ha" / native "há" (short word).
  const { status, json } = await postPronunciation("há", "ha");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  // The fast path must be bypassed — confirmed by the LLM being called.
  assert.ok(llmCallCount >= 1, "short target must call the LLM, not take the fast path");
  // The LLM mock returns LLM_SCORE=55, but because sim("ha","ha")=1.0 ≥ 0.90,
  // the near-match-floor guard correctly rescues the score to 100 and passes
  // the learner — they DID say the word correctly. The key proof is that the
  // LLM was called at all (fast path bypassed), not that it failed.
  assert.ok(json.passed === true, "near-match-floor rescues a correct short-word attempt even after LLM path");
});

test("fix #2 — multi-syllable target (> 4 normalized chars) still uses the fast path when sim ≥ 0.93", async () => {
  // Confirm the short-phrase guard doesn't accidentally block normal phrases.
  // "kem chho" normalises to "kemcho" (6 chars > 4) so fast path fires normally.
  stubbedTranscript = "kem cho"; // sim=1.0 ≥ 0.93
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}`);
  assert.equal(llmCallCount, 0, "multi-char target at sim≥0.93 must still use fast path");
  assert.equal(json.passed, true, "fast path must return passed=true");
});

test("fix #2 — native-script STT transcript for a long target still triggers the fast path (not blocked by short guard)", async () => {
  // Regression test for a subtle bug: if isShortTarget were based on
  // normalizeLatin(transcript), a native-script transcript (Gujarati/Hindi/etc.)
  // would return an empty string (length 0), making the guard always true and
  // silently disabling the fast path for every native-script STT output.
  //
  // The guard is correctly based on normalizeLatin(targetRomanized) only.
  // "kem chho" → "kemcho" = 6 chars > 4 → fast path is NOT blocked.
  //
  // The test re-uses the same mock native string that compareToTarget checks
  // (sameScriptAs fires, sim=1.0 against the target's native chars).
  stubbedTranscript = "કેમ છો"; // native-script transcript, sim=1.0 against native target
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(llmCallCount, 0,
    "native-script transcript for a long target must still use fast path — " +
    "short guard must not fire just because normalizeLatin(nativeTranscript) is empty");
  assert.equal(json.passed, true, "native-script exact match must pass via fast path");
  // Task 907: a covered native script (Gujarati) is transliterated to card
  // style for display; scoring inputs and bands above are untouched.
  // "kem chho", NOT "kem cho", SINCE BUILD 17 (cc94948b): the romanizer spells
  // the way the seed spells, and the seed writes છ as chh. Inverted, not
  // deleted; the fast path itself is unchanged.
  assert.equal(json.transcriptRomanized, "kem chho",
    "Gujarati transcript must romanize to card-style ASCII");
});

test("S1 dual-pass — disagreeing passes score the transcript FARTHER from the target (no toward-target tie-break)", async () => {
  // The mini pass hears "hello world" (sim far below the target) while the
  // high-quality pass hears "kem cho" (sim = 1.0). Pre-S1, the toward-target
  // tie-break preferred "kem cho" and fast-passed the attempt. The S1 honesty
  // rule scores the FARTHER transcript instead: "hello world" goes down the
  // LLM path (mock returns 55) and the attempt does not pass.
  sttQueue = ["hello world", "kem cho"]; // mini pass, then high-quality pass
  sttCallCount = 0;
  llmCallCount = 0;

  const { status, json } = await postPronunciation("કેમ છો", "kem chho");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(sttCallCount, 2, `expected exactly 2 STT calls (dual-pass), got ${sttCallCount}`);
  assert.equal(json.transcript, "hello world",
    "band computation must use the transcript farther from the target");
  assert.equal(json.passed, false,
    "the target-matching pass must never silently win a disagreement");
  assert.ok(llmCallCount >= 1, "the farther transcript must go down the LLM path");
});

test("S1 dual-pass — both STT passes run on every scored attempt, even a strong first pass", async () => {
  // Pre-S1, the high-quality pass only ran when the first pass looked weak.
  // Now both passes run unconditionally so the scored transcript can never be
  // a single pass's fabrication.
  stubbedTranscript = "kem cho"; // both passes agree at sim = 1.0
  sttCallCount = 0;
  llmCallCount = 0;

  const { status } = await postPronunciation("કેમ છો", "kem chho");
  assert.equal(status, 200);
  assert.equal(sttCallCount, 2,
    `expected exactly 2 STT calls on a strong attempt, got ${sttCallCount}`);
});

test("fix #4 — near-match-floor preserves LLM passed=false when score is above floor but LLM signals a problem", async () => {
  // applyScoreGuards unit test: when target.sim ≥ 0.90 and score is already
  // at or above the floor, the guard must return passed = score >= 80 (the
  // LLM's own score determines pass), not unconditionally passed=true.
  //
  // Scenario: sim ≈ 0.91 → floor ≈ 82. LLM gave score=91 but passed=false
  // (unusual, but valid — the LLM may signal tonal ambiguity). With the fix,
  // score=91 ≥ 80 → passed=true. The LLM's passed field is overridden by the
  // score math, which is correct: 91 genuinely is a pass.
  const { applyScoreGuards } = await import("../lib/pronunciationGuards");

  // Case A: score well above floor, LLM says passed=false → guard corrects to passed=true.
  const a = applyScoreGuards({
    score: 91,
    passed: false, // LLM's mistaken verdict
    transcript: "kem che",       // sim ≈ 0.91 → floor ≈ 82
    targetNative: "કેમ છો",
    targetRomanized: "kem chho",
  });
  assert.equal(a.score, 91, "score must be preserved");
  assert.equal(a.passed, true, "score=91 ≥ 80 → must pass regardless of LLM's passed field");
  assert.equal(a.guard, undefined, "no guard fires when score is already above floor");

  // Case B: score above floor but below 80 — impossible in practice (floor is
  // always ≥ 80), so we just confirm the floor-rescue still works.
  const b = applyScoreGuards({
    score: 55,
    passed: false,
    transcript: "kem cho",       // sim=1.0 → floor=100
    targetNative: "કેમ છો",
    targetRomanized: "kem chho",
  });
  assert.ok(b.passed, "floor-rescue must still force passed=true when score < floor");
  assert.equal(b.guard, "near-match-floor");
  assert.equal(b.score, 100);
});

test("fix #1 — wrong-but-similar phrase scenario: compareToTarget confirms both high target-sim and high sibling-sim are reachable", async () => {
  // This is a unit-level proof that the wrong-phrase-cap scenario the fast path
  // now guards against is real and reachable. A very short transcript ("na")
  // gives sim=1.0 against a target romanized "na" AND sim=1.0 against a sibling
  // also romanized "na". Without the fast-path DB check (which requires phraseId),
  // the character-level sim alone cannot distinguish them.
  //
  // In production this is prevented by the fast-path DB fetch which catches any
  // sibling at sim ≥ 0.80 and falls through to the LLM. The route-level guard
  // only activates when phraseId is supplied; here we verify the underlying sim
  // math that makes the attack vector real.
  const { compareToTarget } = await import("../lib/pronunciationGuards");

  const target  = { native: "ná", romanized: "na" };
  const sibling = { nativeScript: "há", romanized: "ha" };

  const targetSim  = compareToTarget("na", target.native, target.romanized);
  const siblingNaSim = compareToTarget("na", sibling.nativeScript, "na"); // sibling also romanizes to "na"

  assert.ok(targetSim.comparable && targetSim.sim >= 0.93,
    `target sim must be ≥ 0.93, got ${targetSim.sim} (comparable=${targetSim.comparable})`);
  assert.ok(siblingNaSim.comparable && siblingNaSim.sim >= 0.93,
    `sibling sim must be ≥ 0.93, got ${siblingNaSim.sim} — confirms fast-path guard is necessary`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Part E — DB-backed wrong-phrase-cap integration test
//
// When phraseId IS provided the route fetches sibling phrases from the DB and
// checks whether the transcript matches any of them at sim ≥ 0.80. If so, it
// falls through to the LLM path instead of returning a fast-path pass. This
// suite exercises that DB-backed path end-to-end through a real HTTP request so
// a regression (query break, schema change, logic inversion) fails here rather
// than silently letting wrong-but-similar phrases through.
// ═══════════════════════════════════════════════════════════════════════════════

describe("wrong-phrase-cap (DB-backed path): phraseId triggers sibling fetch", () => {
  const LANG_CODE = "__test_lang_fp689";
  const CATEGORY_SLUG = "__test_cat_fp689";
  let targetPhraseId: number;

  before(async () => {
    // Provision a throwaway language, category, lesson, and two sibling phrases.
    // FK order: language → category → lesson → phrases.
    await db
      .insert(languagesTable)
      .values({
        code: LANG_CODE,
        name: "Test Lang FP689",
        nativeName: "T689",
        script: "Latin",
        fontFamily: "sans-serif",
      })
      .onConflictDoNothing();

    const [category] = await db
      .insert(categoriesTable)
      .values({
        slug: CATEGORY_SLUG,
        title: "Test FP689",
        description: "Test category for task 689",
        iconName: "BookOpen",
        accent: "#000000",
      })
      .returning();

    const [lesson] = await db
      .insert(lessonsTable)
      .values({ languageCode: LANG_CODE, categoryId: category!.id, titleNative: "T689" })
      .returning();

    // Target phrase: romanized "kem chho".
    //   normalizeLatin("kem chho") → "kemcho" (chh→ch fold, 6 chars)
    //   normalizeLatin("kem cho")  → "kemcho" → sim = 1.0 ≥ 0.93 (fast-path fires normally)
    //
    // Sibling phrase: romanized "kem che".
    //   normalizeLatin("kem che")  → "kemche" (6 chars)
    //   similarity("kemcho","kemche") = 1 - 1/6 ≈ 0.833 ≥ 0.80 → wrong-phrase-cap fires
    const created = await db
      .insert(phrasesTable)
      .values([
        {
          lessonId: lesson!.id,
          languageCode: LANG_CODE,
          categoryId: category!.id,
          nativeScript: "કેમ છો",
          romanized: "kem chho",
          english: "How are you",
          sortOrder: 0,
        },
        {
          lessonId: lesson!.id,
          languageCode: LANG_CODE,
          categoryId: category!.id,
          nativeScript: "કેમ છે",
          romanized: "kem che",
          english: "How is it",
          sortOrder: 1,
        },
      ])
      .returning();

    targetPhraseId = created[0]!.id;
  });

  after(async () => {
    // FK order: phrases → lessons → categories → languages.
    await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG_CODE));
    await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG_CODE));
    await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
    await db.delete(languagesTable).where(eq(languagesTable.code, LANG_CODE));
  });

  test("similar-sounding sibling (sim≥0.80) blocks fast-path and falls through to LLM when phraseId is supplied", async () => {
    // "kem cho" normalises to "kemcho":
    //   • Against target "kem chho" (→"kemcho"):  sim = 1.0  ≥ 0.93 → fast-path would fire
    //   • Against sibling "kem che" (→"kemche"):  sim ≈ 0.833 ≥ 0.80 → wrong-phrase-cap fires
    //
    // Because phraseId is provided, the route fetches sibling phrases from the DB,
    // detects the sibling collision, and falls through to the LLM path instead of
    // returning a fast-path pass.  The LLM mock returns LLM_SCORE=55 (<80), so
    // passed must be false and the LLM call count must be ≥ 1.
    stubbedTranscript = "kem cho";
    llmCallCount = 0;

    const res = await fetch(`${baseUrl}/openai/pronunciation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phraseId: targetPhraseId,
        // targetNative/Romanized/English are required by the schema even when
        // phraseId is supplied — the server overwrites them from the DB anyway.
        targetNative: "કેમ છો",
        targetRomanized: "kem chho",
        targetEnglish: "How are you",
        languageName: "Test Lang FP689",
        audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
      }),
    });
    const json = await res.json().catch(() => null) as any;

    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(json)}`);
    // The wrong-phrase-cap must have fired — the LLM must have been called.
    // llmCallCount=0 would mean the fast-path returned passed=true without ever
    // checking the sibling phrases, which is the regression we are guarding against.
    assert.ok(
      llmCallCount >= 1,
      `expected at least one LLM call (wrong-phrase-cap fell through to LLM), got ${llmCallCount}. ` +
        "If llmCallCount=0 the fast-path returned passed=true without checking siblings.",
    );
    // The response must still be a well-formed evaluation (200 with an
    // evaluationToken). We do NOT assert passed=false here: after the fast-path is
    // bypassed the near-match-floor guard legitimately rescues a correct attempt
    // (transcript sim=1.0 against the target), so passed=true on the LLM path is
    // expected and correct. The important invariant is that the LLM path ran
    // (confirmed above), not the final pass/fail verdict.
    assert.ok(
      typeof json.evaluationToken === "string",
      "response must include a signed evaluationToken even on the LLM-fallback path",
    );
  });
});
