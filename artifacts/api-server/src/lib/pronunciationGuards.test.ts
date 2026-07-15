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
  assert.equal(normalizeLatin("kem chho"), normalizeLatin("Kem cho!"));
  assert.equal(normalizeLatin("paani"), normalizeLatin("pani"));
  assert.equal(normalizeLatin("bhai"), normalizeLatin("bai"));
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

test("a higher LLM score on a near-match is kept as-is", () => {
  const r = applyScoreGuards({
    score: 97,
    passed: true,
    transcript: "kem chho",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
  });
  assert.equal(r.score, 97);
  assert.ok(r.passed);
  assert.equal(r.guard, undefined);
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

test("cross-script transcript: LLM judgement is trusted untouched", () => {
  const r = applyScoreGuards({
    score: 90,
    passed: true,
    transcript: "केम छो",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.score, 90);
  assert.ok(r.passed);
  assert.equal(r.guard, undefined);
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
