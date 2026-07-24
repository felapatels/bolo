import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLatin,
  compareToTarget,
  isEffectivelyEmpty,
  applyScoreGuards,
} from "./pronunciationGuards";

// The guardrails are the deterministic backstop around the LLM score, so these
// cases mirror the real failure modes: exact/close transcripts of the target,
// wrong-word transcripts, empty/garbled audio, and cross-script transcripts
// where no deterministic verdict is possible.

const TARGET = { native: "કેમ છો", romanized: "kem chho" };
const OTHERS = [
  { nativeScript: "આવજો", romanized: "aavjo" },
  { nativeScript: "પાણી", romanized: "paani" },
];

test("normalizeLatin folds romanization variants to one key", () => {
  // chh→ch: "kem chho" and "kem cho" should normalize identically.
  assert.equal(normalizeLatin("kem chho"), normalizeLatin("Kem cho!"));
  // Repeated-letter collapse: "paani" → "pani".
  assert.equal(normalizeLatin("paani"), normalizeLatin("pani"));
  // w→v fold: "waat" and "vaat" should normalize identically.
  assert.equal(normalizeLatin("waat"), normalizeLatin("vaat"));
  // ee→i fold: "beet" and "bit" normalize identically.
  assert.equal(normalizeLatin("beet"), normalizeLatin("bit"));
  // Aspiration folds (bh, th, sh, etc.) are intentionally NOT folded any more —
  // they collapse phonetically distinct sounds on short phrases.
  assert.notEqual(normalizeLatin("bhai"), normalizeLatin("bai"));
  assert.notEqual(normalizeLatin("thal"), normalizeLatin("tal"));
  assert.notEqual(normalizeLatin("sham"), normalizeLatin("sam"));
});

test("isEffectivelyEmpty: silence and punctuation-only garble", () => {
  assert.ok(isEffectivelyEmpty(""));
  assert.ok(isEffectivelyEmpty(" ... !! "));
  assert.ok(!isEffectivelyEmpty("kem"));
  assert.ok(!isEffectivelyEmpty("કેમ"));
});

test("exact Latin transcript compares near 1.0", () => {
  const cmp = compareToTarget("kem cho", TARGET.native, TARGET.romanized);
  assert.ok(cmp.comparable);
  assert.ok(cmp.sim >= 0.95, `sim was ${cmp.sim}`);
});

test("native-script transcript compares against the native target", () => {
  const cmp = compareToTarget("કેમ છો", TARGET.native, TARGET.romanized);
  assert.ok(cmp.comparable);
  assert.ok(cmp.sim >= 0.95);
});

test("cross-script transcript is not comparable (guards stay out)", () => {
  // Devanagari transcript of Gujarati speech: sounds may match but scripts don't.
  const cmp = compareToTarget("केम छो", TARGET.native, TARGET.romanized);
  assert.equal(cmp.comparable, false);
});

test("near-exact match can never fail, even if the LLM lowballs it", () => {
  const r = applyScoreGuards({
    score: 55,
    passed: false,
    transcript: "kem cho",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.ok(r.passed);
  assert.ok(r.score >= 85);
  assert.equal(r.guard, "near-match-floor");
});

test("a higher LLM score on a near-match above the sim-derived floor is kept as-is", () => {
  // sim("kem chho", "kem chho") normalises to 1.0, so simToScore(1.0, 0.90) = 100.
  // The guard only fires when score < floor. At score=100 the guard is not needed.
  // Use a slightly imperfect transcript so sim < 1.0 and the LLM score is above the floor.
  const r = applyScoreGuards({
    score: 91,
    passed: true,
    transcript: "kem che",        // sim ≈ 0.91 → floor ≈ 82
    targetNative: TARGET.native,   // "કેમ છો"
    targetRomanized: TARGET.romanized, // "kem chho"
  });
  assert.equal(r.score, 91);
  assert.ok(r.passed);
  assert.equal(r.guard, undefined);
});

test("a perfect sim=1.0 near-match raises an under-scored LLM result to 100", () => {
  // When the transcript is phonetically identical (sim=1.0), the earned floor is 100.
  // An LLM score of 97 is below that floor and must be raised.
  const r = applyScoreGuards({
    score: 97,
    passed: true,
    transcript: "kem chho",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
  });
  assert.equal(r.score, 100);
  assert.ok(r.passed);
  assert.equal(r.guard, "near-match-floor");
});

test("transcript matching a different known phrase can never pass", () => {
  const r = applyScoreGuards({
    score: 85,
    passed: true,
    transcript: "aavjo",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.passed, false);
  assert.ok(r.score <= 40);
  assert.equal(r.guard, "wrong-phrase-cap");
});

test("wildly divergent transcript can't pass outright", () => {
  const r = applyScoreGuards({
    score: 88,
    passed: true,
    transcript: "hello there my friend",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.passed, false);
  assert.ok(r.score < 80);
});

test("mid-band close attempt: LLM score stands", () => {
  // "kem so" — clearly attempting the target, one sound off; no guard fires.
  const r = applyScoreGuards({
    score: 72,
    passed: false,
    transcript: "kem so",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.score, 72);
  assert.equal(r.passed, false);
  assert.equal(r.guard, undefined);
});

test("cross-script transcript: LLM score is trusted but capped at 85", () => {
  // Devanagari transcript of Gujarati speech: sounds may line up but we can't
  // verify similarity, so we cap at 85 to prevent unverifiable perfect scores.
  const r = applyScoreGuards({
    score: 90,
    passed: true,
    transcript: "केम छो",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.score, 85);
  assert.ok(r.passed);
  assert.equal(r.guard, "cross-script-cap");
});

test("cross-script transcript below the cap passes through unchanged", () => {
  const r = applyScoreGuards({
    score: 82,
    passed: true,
    transcript: "केम छो",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
  });
  assert.equal(r.score, 82);
  assert.ok(r.passed);
  assert.equal(r.guard, undefined);
});

test("near-match-floor threshold is 0.90: sim in [0.85, 0.90) no longer rescues a wrong attempt", () => {
  // "shukriyo" vs target "shukriya" — one character off at the end.
  // normalizeLatin: no folds apply, both 8 chars, levenshtein=1 → sim = 0.875.
  // Under the old 0.85 threshold this would have been floored to 85/passed.
  // Under the new 0.90 threshold the LLM score of 70 stands (no guard fires).
  const target = { native: "शुक्रिया", romanized: "shukriya" };
  const r = applyScoreGuards({
    score: 70,
    passed: false,
    transcript: "shukriyo",
    targetNative: target.native,
    targetRomanized: target.romanized,
  });
  assert.equal(r.passed, false, "sim=0.875 should not rescue a below-threshold LLM score");
  assert.equal(r.score, 70, "score should be unchanged when no guard fires");
  assert.equal(r.guard, undefined);
});

test("near-match-floor still fires at sim ≥ 0.90 (exact match)", () => {
  // Confirm the floor still works for genuinely near-exact attempts.
  const target = { native: "शुक्रिया", romanized: "shukriya" };
  const r = applyScoreGuards({
    score: 55,
    passed: false,
    transcript: "shukriya",
    targetNative: target.native,
    targetRomanized: target.romanized,
  });
  assert.ok(r.passed, "exact match must still be rescued by near-match-floor");
  assert.ok(r.score >= 85);
  assert.equal(r.guard, "near-match-floor");
});

test("short 1-2 syllable words: exact short word floors high, wrong short word caps low", () => {
  const short = { native: "પાણી", romanized: "paani" };
  const good = applyScoreGuards({
    score: 60,
    passed: false,
    transcript: "pani",
    targetNative: short.native,
    targetRomanized: short.romanized,
  });
  assert.ok(good.passed);
  assert.ok(good.score >= 85);

  const wrong = applyScoreGuards({
    score: 82,
    passed: true,
    transcript: "kem cho",
    targetNative: short.native,
    targetRomanized: short.romanized,
    otherPhrases: [{ nativeScript: "કેમ છો", romanized: "kem chho" }],
  });
  assert.equal(wrong.passed, false);
  assert.ok(wrong.score <= 40);
});
