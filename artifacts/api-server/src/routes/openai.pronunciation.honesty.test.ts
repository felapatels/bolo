// S1 scoring honesty tests for POST /openai/pronunciation.
//
// The honesty layer (brief 32.1 S1) changes three things:
//  1. Dual-pass STT: both the mini and high-quality passes run on EVERY scored
//     attempt, and both transcripts are recorded on the token/attempt row.
//  2. No toward-target tie-break: when the passes disagree, sttDisagreement is
//     flagged and band computation uses the transcript FARTHER from the target.
//  3. Honesty cap: a transcript that equals the normalized target with agreeing
//     passes caps at score 92. The cap is a SCORE ceiling: since the perfect
//     threshold moved to 91 (owner ruling, Aug 2, 2026) a capped 92 bands
//     'perfect', but no transcript-scored attempt can exceed 92 until an
//     audio-aware scoring v2 exists. (The "Namasto" regression pin, by
//     construction: STT normalizing a wrong pronunciation into the target
//     transcript can never score above the cap.)
//
// Part A unit-tests chooseConservativeTranscript; Part B exercises the real
// Express route with the audio module mocked (same harness as the fast-path
// tests) and decodes the evaluation token to check the new signed fields.

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";

import { chooseConservativeTranscript } from "../lib/pronunciationGuards";
import { verifyEvaluation } from "../lib/evaluationToken";

// ─── Shared mock state ────────────────────────────────────────────────────────

let stubbedTranscript = "";
let sttQueue: string[] = [];
let sttCallCount = 0;
let llmCallCount = 0;
let llmScore = 55;

// ─── Module mocks (must be registered before ./openai is imported) ────────────

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    speechToText: async () => {
      sttCallCount++;
      if (sttQueue.length > 0) return sttQueue.shift()!;
      return stubbedTranscript;
    },
    ensureCompatibleFormat: async (buf: Buffer) => ({
      buffer: buf,
      format: "mp3" as const,
    }),
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
                      score: llmScore,
                      passed: llmScore >= 80,
                      feedback: "Nice work, keep going!",
                      tip: "Keep practicing at your own pace.",
                    }),
                  },
                },
              ],
            };
          },
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

// ─── Express test server ──────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

before(async () => {
  assert.ok(
    process.env.SESSION_SECRET,
    "SESSION_SECRET must be set (needed by signEvaluation)",
  );
  const { default: openaiRouter } = await import("./openai");
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).log = { warn: () => {}, error: () => {}, info: () => {} };
    next();
  });
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).userId = "test_honesty_user";
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

async function postPronunciation(
  targetNative: string,
  targetRomanized: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/openai/pronunciation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      targetNative,
      targetRomanized,
      targetEnglish: "test phrase",
      languageName: "Hindi",
      audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
    }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Part A — chooseConservativeTranscript unit tests
// ═══════════════════════════════════════════════════════════════════════════════

const TARGET = { targetNative: "નમસ્તે", targetRomanized: "namaste" };

test("agreeing passes: no disagreement, high-quality rendering kept", () => {
  const c = chooseConservativeTranscript({ mini: "namaste!", hq: "Namaste", ...TARGET });
  assert.equal(c.disagreement, false, "normalized-equal passes must agree");
  assert.equal(c.transcript, "Namaste", "the high-quality rendering is kept");
  assert.equal(c.bothEmpty, false);
  assert.equal(c.glitchRescue, false, "agreeing passes are not a glitch rescue");
});

test("disagreeing passes: the transcript FARTHER from the target is chosen", () => {
  // mini normalized to the target; hq heard "namasto" (one sound off).
  const c = chooseConservativeTranscript({ mini: "namaste", hq: "namasto", ...TARGET });
  assert.equal(c.disagreement, true);
  assert.equal(c.transcript, "namasto",
    "the conservative reading must never prefer the target-matching pass");
  assert.equal(c.glitchRescue, false,
    "two comparable transcripts are the anti-flattery case; the rescue must not fire");
});

test("disagreeing passes, farther transcript first: mini is chosen when it is farther", () => {
  const c = chooseConservativeTranscript({ mini: "hello world", hq: "namaste", ...TARGET });
  assert.equal(c.disagreement, true);
  assert.equal(c.transcript, "hello world");
});

// ─── Recognizer-glitch rescue (owner ruling, Aug 12, 2026) ───────────────────
//
// Fixtures are the REAL transcripts from the production nocatch sidecars of
// Aug 11-12, 2026: the mini pass drifting into Cyrillic or Perso-Arabic for a
// Gujarati phrase while the high-quality pass read the learner correctly. The
// old distance ladder ranked the wrong-script transcript farther than any
// comparable one, so the broken pass always won and a correct attempt landed
// as script_mismatch → nocatch.

const GU_BAPOR = { targetNative: "શુભ બપોર", targetRomanized: "shubh bapor" };
const GU_SALAAM = { targetNative: "સલામ", targetRomanized: "salaam" };
const GU_MALTA = { targetNative: "મળતા રહેજો", targetRomanized: "malta rahejo" };

test("glitch rescue: mini drifts to Cyrillic, hq reads the learner → the comparable pass is scored", () => {
  const c = chooseConservativeTranscript({
    mini: "Шубарбор.", // sidecar 2026-08-12T02:16:49Z
    hq: "શુભ બરનોર.",
    ...GU_BAPOR,
  });
  assert.equal(c.glitchRescue, true, "exactly one non-comparable pass is a recognizer glitch");
  assert.equal(c.transcript, "શુભ બરનોર.", "the comparable pass must be scored");
  assert.equal(c.disagreement, true, "the passes still disagreed");
  assert.equal(c.chosenEmptyWithEvidence, false);
});

test("glitch rescue: mini drifts to Perso-Arabic, hq reads the learner → the comparable pass is scored", () => {
  const c = chooseConservativeTranscript({
    mini: "ملتા રહેજો.", // sidecar 2026-08-12T02:21:44Z
    hq: "મળતા રહેજો.",
    ...GU_MALTA,
  });
  assert.equal(c.glitchRescue, true);
  assert.equal(c.transcript, "મળતા રહેજો.",
    "a correct reading must not lose to a wrong-script one");
});

test("glitch rescue, other direction: hq is the garbled pass → mini is scored", () => {
  // Same sidecar pair as સલામ (mini "سلام", hq "સલામ."), with the passes
  // swapped: the rule is about comparability, not about which recognizer.
  const c = chooseConservativeTranscript({
    mini: "સલામ.",
    hq: "سلام",
    ...GU_SALAAM,
  });
  assert.equal(c.glitchRescue, true);
  assert.equal(c.transcript, "સલામ.", "the comparable pass wins whichever recognizer produced it");
});

test("both passes non-comparable: unchanged, no rescue, still resolves as today", () => {
  const c = chooseConservativeTranscript({
    mini: "سلام",
    hq: "Шубарбор.",
    ...GU_BAPOR,
  });
  assert.equal(c.glitchRescue, false, "the rescue needs a comparable pass to rescue TO");
  assert.equal(c.disagreement, true);
  assert.equal(c.transcript, "Шубарбор.", "the tie at the non-comparable rung still keeps the hq pass");
  assert.equal(c.chosenEmptyWithEvidence, false);
});

test("both passes comparable and disagreeing: anti-flattery rule untouched by the rescue", () => {
  // Native-script disagreement, both readable against the target: the farther
  // one is still scored, exactly as before.
  const c = chooseConservativeTranscript({
    mini: "શુભ બપોર.", // exact target
    hq: "શુભ બરનોર.", // one sound off
    ...GU_BAPOR,
  });
  assert.equal(c.glitchRescue, false);
  assert.equal(c.transcript, "શુભ બરનોર.", "the farther comparable transcript is still the one scored");
  assert.equal(c.disagreement, true);
});

test("one empty pass: disagreement with chosenEmptyWithEvidence (system miss, not a score)", () => {
  const c = chooseConservativeTranscript({ mini: "", hq: "namaste", ...TARGET });
  assert.equal(c.disagreement, true);
  assert.equal(c.transcript, "", "empty sorts farthest");
  assert.equal(c.chosenEmptyWithEvidence, true);
});

test("both passes empty: bothEmpty, no disagreement", () => {
  const c = chooseConservativeTranscript({ mini: "", hq: "...", ...TARGET });
  assert.equal(c.bothEmpty, true);
  assert.equal(c.disagreement, false);
  assert.equal(c.transcript, "");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Part B — Route integration tests
// ═══════════════════════════════════════════════════════════════════════════════

test("honesty cap: transcript equals target with agreeing passes → score 92, band 'perfect' at the 91 threshold (Namasto pin)", async () => {
  stubbedTranscript = "namaste"; // both passes agree at sim = 1.0
  sttQueue = [];
  sttCallCount = 0;
  llmCallCount = 0;

  const { status, json } = await postPronunciation("નમસ્તે", "namaste");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.score, 92, `target-equal transcript must cap at 92, got ${json.score}`);
  assert.equal(json.band, "perfect", `capped 92 must band 'perfect' at the 91 threshold, got ${json.band}`);
  assert.equal(json.passed, true);
  assert.equal(sttCallCount, 2, "both STT passes must run on every scored attempt");
  // Capped copy owns the uncertainty: it must not claim flawlessness.
  assert.ok(!/perfect|flawless/i.test(json.feedback),
    `capped feedback must not claim flawlessness, got: ${json.feedback}`);
});

test("disagreement: band computation uses the farther transcript and flags the token", async () => {
  // The actual Namasto shape: the mini pass normalizes the attempt into the
  // target ("namaste") while the high-quality pass hears what was said
  // ("namasto"). The farther transcript must be the one scored.
  sttQueue = ["namaste", "namasto"];
  sttCallCount = 0;
  llmCallCount = 0;
  llmScore = 85;

  const { status, json } = await postPronunciation("નમસ્તે", "namaste");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.transcript, "namasto", "the farther transcript must be scored");
  assert.ok(llmCallCount >= 1, "sim below 0.93 must go down the LLM path");

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.sttDisagreement, true, "token must carry the disagreement flag");
  assert.equal(claims!.sttTranscriptMini, "namaste");
  assert.equal(claims!.sttTranscriptHq, "namasto");
});

test("non-matching transcripts band normally through the existing ladder", async () => {
  // Both passes agree on a partial attempt; no disagreement. The LLM mock
  // returns 55, which bands 'almost' (55-67). The global cap (92) does not
  // change this outcome since 55 < 92.
  stubbedTranscript = "nama";
  sttQueue = [];
  llmCallCount = 0;
  llmScore = 55;

  const { status, json } = await postPronunciation("નમસ્તે", "namaste");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.score, 55, "score below the cap passes through unchanged");
  assert.equal(json.band, "almost", `expected band 'almost' for score 55, got ${json.band}`);
  assert.equal(json.passed, false);

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.sttDisagreement, false);
  assert.equal(claims!.sttTranscriptMini, "nama");
  assert.equal(claims!.sttTranscriptHq, "nama");
});

test("global honesty cap: near-match (sim < 1.0) with high LLM score → score capped at 92", async () => {
  // S1 amendment: the cap is now unconditional on all scored paths. A
  // near-miss that the LLM rates at 95 cannot keep that score; it is capped
  // to 92. Previously honestyCapApplies required sim = 1.0 exactly, leaving a
  // residual gap where a near-match could keep an above-cap LLM score. That
  // gap is closed here. The band derives from the capped score ('perfect' at
  // the 91 threshold per the Aug 2, 2026 owner ruling).
  //
  // "namast" against target "namaste": sim ≈ 0.86 (one char short), goes
  // through the LLM path. The near-match-floor sim threshold is 0.90, which
  // "namast" does not clear, so the guard does not rescue it. LLM returns 95.
  // Global cap fires: score = 92, band = bandFromScore(92) = 'perfect'.
  stubbedTranscript = "namast";
  sttQueue = [];
  llmCallCount = 0;
  llmScore = 95;

  const { status, json } = await postPronunciation("નમસ્તે", "namaste");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.ok(llmCallCount >= 1, "near-miss must go through the LLM path");
  assert.equal(json.score, 92, `near-match with LLM score 95 must be capped at 92, got ${json.score}`);
  assert.equal(json.band, "perfect", `capped 92 must band 'perfect' at the 91 threshold, got ${json.band}`);
  assert.ok(json.score <= 92, "no transcript-scored attempt may exceed the cap until scoring v2");
});

test("token carries both transcripts and the disagreement flag on the capped fast path", async () => {
  stubbedTranscript = "namaste";
  sttQueue = [];

  const { status, json } = await postPronunciation("નમસ્તે", "namaste");

  assert.equal(status, 200);
  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.sttTranscriptMini, "namaste");
  assert.equal(claims!.sttTranscriptHq, "namaste");
  assert.equal(claims!.sttDisagreement, false);
  assert.equal(claims!.score, 92, "the signed score must be the capped score");
  assert.equal(claims!.band, "perfect");
});

test("one empty pass resolves as a system miss (nocatch), never a score", async () => {
  // The mini pass hears nothing while the high-quality pass hears the target.
  // The passes could not corroborate each other; the conservative resolution
  // is band 'nocatch' with no-fault copy, and the token records both passes.
  sttQueue = ["", "namaste"];
  sttCallCount = 0;
  llmCallCount = 0;

  const { status, json } = await postPronunciation("નમસ્તે", "namaste");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.band, "nocatch");
  assert.equal(json.score, 0);
  assert.equal(json.passed, false);
  assert.equal(llmCallCount, 0, "an uncorroborated attempt must not reach the LLM");

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.sttDisagreement, true);
  assert.equal(claims!.sttTranscriptMini, "");
  assert.equal(claims!.sttTranscriptHq, "namaste");
});

test("recognizer drift to a foreign script: nocatch withholds the transcript from the learner, the token keeps it", async () => {
  // Field report (Aug 10, 2026): a Gujarati attempt came back transcribed in
  // Russian Cyrillic. The transcribe model treats the `language` option as a
  // soft hint and can drift on short clips, so the script-mismatch guard
  // correctly resolved it to nocatch — but the card still printed
  // We heard: "вучит крашна" beside copy saying the listener glitched.
  // The drifted text must not reach the client; the evidence must survive on
  // the signed token (and from there the attempt row and the diagnostics).
  const drifted = "вучит крашна";
  stubbedTranscript = drifted; // both passes agree on the drifted reading
  sttQueue = [];
  sttCallCount = 0;
  llmCallCount = 0;

  const { status, json } = await postPronunciation("જય શ્રી કૃષ્ણ", "jay shri krishna");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.band, "nocatch", "a script the target can't be compared against is a system miss");
  assert.equal(json.score, 0);
  assert.equal(json.xpAwarded, 0);
  assert.equal(
    json.transcript,
    "",
    'the "We heard" line must not quote a script the learner never spoke',
  );
  assert.equal(json.transcriptRomanized, "");

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.transcript, drifted, "the drifted transcript is evidence and must survive on the token");
  assert.equal(claims!.sttTranscriptMini, drifted);
  assert.equal(claims!.sttTranscriptHq, drifted);
});

test("recognizer glitch on ONE pass: the attempt is scored from the comparable pass, not nocatched", async () => {
  // Field evidence (production sidecars, Aug 11-12, 2026): the mini pass wrote
  // Gujarati speech in Cyrillic while the high-quality pass returned the target
  // exactly. Before the owner's Aug 12 ruling the wrong-script transcript
  // sorted farthest and the correct attempt died as nocatch.
  sttQueue = ["Шубарбор.", "શુભ બપોર."];
  sttCallCount = 0;
  llmCallCount = 0;

  const { status, json } = await postPronunciation("શુભ બપોર", "shubh bapor");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.notEqual(json.band, "nocatch", "a correctly read attempt must not be a system miss");
  assert.equal(json.transcript, "શુભ બપોર.", "the comparable pass is the one scored");
  assert.ok(json.score >= 80, `expected a scored attempt, got score ${json.score}`);
  assert.equal(sttCallCount, 2, "both passes still run");

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.sttGlitchRescue, true, "the rescue must be identifiable afterwards");
  assert.equal(claims!.sttDisagreement, true, "the passes did disagree; that record is unchanged");
  assert.equal(claims!.sttTranscriptMini, "Шубарбор.", "the glitched pass stays on the token as evidence");
  assert.equal(claims!.sttTranscriptHq, "શુભ બપોર.");
});

test("both passes drift to unverifiable scripts: still a nocatch, unchanged", async () => {
  // The rescue needs something comparable to rescue to. Two broken passes are
  // exactly what the script-mismatch nocatch exists for.
  sttQueue = ["Шубарбор.", "سلام"];
  sttCallCount = 0;
  llmCallCount = 0;

  const { status, json } = await postPronunciation("શુભ બપોર", "shubh bapor");

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.band, "nocatch");
  assert.equal(json.score, 0);
  assert.equal(json.transcript, "", "an unverifiable script is never quoted back to the learner");

  const claims = verifyEvaluation(json.evaluationToken);
  assert.ok(claims, "evaluation token must verify");
  assert.equal(claims!.sttGlitchRescue, false, "no rescue fired");
  assert.equal(claims!.nocatchCause, "script_mismatch");
});
