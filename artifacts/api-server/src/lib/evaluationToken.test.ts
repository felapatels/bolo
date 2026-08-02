import { test } from "node:test";
import assert from "node:assert/strict";

// The signing key is read lazily per call, so setting a fallback here (before
// the module functions run) is safe even though the import is hoisted.
process.env.SESSION_SECRET ||= "evaluation-token-test-secret";

import {
  HONESTY_SCORE_CAP,
  signEvaluation,
  verifyEvaluation,
  type EvaluationClaims,
} from "./evaluationToken";

function baseClaims(overrides: Partial<EvaluationClaims>): EvaluationClaims {
  return {
    userId: "user_evaluation_token_pin_test",
    phraseId: 1,
    languageCode: "hi",
    nativeScript: "नमस्ते",
    romanized: "namaste",
    english: "hello",
    transcript: "namaste",
    score: 0,
    passed: true,
    feedback: "test",
    ...overrides,
  };
}

// #998 pin 1: the honesty cap is enforced at VERIFY time, not only at signing.
// A token signed by a pre-cap binary (score 100 / band 'perfect') stays valid
// for the TTL across a deploy; replaying it must yield the capped claims, so
// no consumer (/attempts, test-out) can ever write an above-cap score.
test("verify-time honesty clamp: replayed above-cap token verifies to 92/'great'", () => {
  assert.equal(HONESTY_SCORE_CAP, 92);
  const token = signEvaluation(
    baseClaims({ score: 100, band: "perfect", xpAwarded: 15 }),
  );
  const claims = verifyEvaluation(token);
  assert.ok(claims, "token must verify");
  assert.equal(claims.score, HONESTY_SCORE_CAP);
  assert.equal(claims.band, "great");
});

// #998 pin 2: nocatch passes through untouched. A system miss is not a
// pronunciation claim; the clamp must never rewrite its band or score.
test("verify-time honesty clamp: nocatch band passes through untouched", () => {
  const token = signEvaluation(
    baseClaims({ score: 100, band: "nocatch", passed: false, xpAwarded: 0 }),
  );
  const claims = verifyEvaluation(token);
  assert.ok(claims, "token must verify");
  assert.equal(claims.band, "nocatch");
  assert.equal(claims.score, 100);
});

// #998 pin 3: audioJudged tokens are exempt. The scoring v2 promotion gate
// certifies above-cap scores only after an audio judge heard the clip; the
// clamp exists because transcript-only scoring cannot hear accent.
test("verify-time honesty clamp: audioJudged token keeps above-cap score verbatim", () => {
  const token = signEvaluation(
    baseClaims({ score: 97, band: "perfect", audioJudged: true, xpAwarded: 15 }),
  );
  const claims = verifyEvaluation(token);
  assert.ok(claims, "token must verify");
  assert.equal(claims.score, 97);
  assert.equal(claims.band, "perfect");
  assert.equal(claims.audioJudged, true);
});
