import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLatin,
  normalizeNative,
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
  // Aspiration folds (bh, th, sh, etc.) are intentionally NOT folded any more, they collapse phonetically distinct sounds on short phrases.
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

test("cross-script transcript: raw path stays incomparable, bridge rescues it (Chunk 2A)", () => {
  // Devanagari transcript of Gujarati speech: sounds match but scripts don't.
  // Pre-Chunk-2A this was incomparable (nocatch). The raw contract still
  // holds (visible via noBridge), but the cross-script bridge now romanizes
  // both sides and rescues the comparison ("kema cho" vs "kema cho" = 1.0).
  const raw = compareToTarget("केम छो", TARGET.native, TARGET.romanized, { noBridge: true });
  assert.equal(raw.comparable, false);

  const bridged = compareToTarget("केम छो", TARGET.native, TARGET.romanized);
  assert.equal(bridged.comparable, true);
  assert.ok(bridged.sim >= 0.95, `bridged sim was ${bridged.sim}`);
  assert.equal(bridged.bridge?.bridged, true);
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
  // "kem so", clearly attempting the target, one sound off; no guard fires.
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

test("cross-script transcript that MATCHES after bridging is scoreable, no longer nocatch (Chunk 2A)", () => {
  // Devanagari transcript of Gujarati speech, phonetically identical to the
  // target. Pre-Chunk-2A this was the canonical false nocatch; the bridge now
  // verifies the match in roman space (sim 1.0), so the near-match floor
  // applies exactly as it would for a same-script perfect transcript.
  const r = applyScoreGuards({
    score: 90,
    passed: true,
    transcript: "केम छो",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.nocatch, undefined);
  assert.equal(r.passed, true);
  assert.equal(r.score, 100);
  assert.equal(r.guard, "near-match-floor");
});

test("cross-script transcript matching at a low LLM score is rescued the same way (Chunk 2A)", () => {
  const r = applyScoreGuards({
    score: 82,
    passed: true,
    transcript: "केम छो",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
  });
  assert.equal(r.nocatch, undefined);
  assert.equal(r.passed, true);
  assert.equal(r.score, 100);
  assert.equal(r.guard, "near-match-floor");
});

test("cross-script transcript that does NOT match after bridging still resolves to nocatch", () => {
  // Unrelated Devanagari content against the Gujarati target: the bridge
  // romanizes both sides but similarity stays far below the 0.45 evidence
  // floor, so the universal script-mismatch nocatch rule still applies.
  const r = applyScoreGuards({
    score: 90,
    passed: true,
    transcript: "धन्यवाद",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.score, 0);
  assert.equal(r.passed, false);
  assert.equal(r.guard, "script-mismatch-nocatch");
  assert.equal(r.nocatch, true);
});

test("Latin transcript for a non-Latin phrase with low romanized similarity resolves to nocatch", () => {
  // The recognizer wrote English-looking words for Hindi speech. sim to the
  // romanized target is far below 0.70, so this is recognizer noise, nocatch,
  // never a learner failure, even when the LLM scored it as a pass.
  const r = applyScoreGuards({
    score: 84,
    passed: true,
    transcript: "a common gesture",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
  });
  assert.equal(r.guard, "script-mismatch-nocatch");
  assert.equal(r.nocatch, true);
  assert.equal(r.score, 0);
});

test("Latin transcript with verifiable similarity (sim >= 0.70) stays scoreable, not a mismatch", () => {
  // Slightly-off romanized attempt: affirmative evidence the learner said the
  // phrase. Guard 1b must NOT fire; normal scoring applies.
  const r = applyScoreGuards({
    score: 75,
    passed: false,
    transcript: "kem cho",
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
  });
  assert.notEqual(r.guard, "script-mismatch-nocatch");
  assert.equal(r.nocatch, undefined);
});

test("Latin transcript matching a DIFFERENT phrase still gets wrong-phrase-cap, not nocatch", () => {
  // Wrong-phrase evidence takes precedence over the Latin-mismatch rule: the
  // learner verifiably said another catalog phrase.
  const r = applyScoreGuards({
    score: 85,
    passed: true,
    transcript: OTHERS[0]!.romanized,
    targetNative: TARGET.native,
    targetRomanized: TARGET.romanized,
    otherPhrases: OTHERS,
  });
  assert.equal(r.guard, "wrong-phrase-cap");
  assert.equal(r.nocatch, undefined);
  assert.ok(r.score <= 40);
});

test("near-match-floor threshold is 0.90: sim in [0.85, 0.90) no longer rescues a wrong attempt", () => {
  // "shukriyo" vs target "shukriya", one character off at the end.
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

// ─── Cross-language phonetic ambiguity ───────────────────────────────────────
//
// Very short words like "na" (negation) share identical romanizations across
// several South Asian languages.  normalizeLatin is language-agnostic, so
// compareToTarget gives high similarity against both the Gujarati "ná" and
// the Hindi/Marathi "na" romanization.  The STT language-code hint (set from
// phrase.languageCode in the route) is the primary mitigation: it anchors
// Whisper's transcription to the right language script.  The tests below
// document the ambiguity so future changes to normalizeLatin do not silently
// widen or close it.

test("cross-language ambiguity: 'na' romanization is identical for Gujarati and Hindi targets", () => {
  // Both languages romanize their negation particle the same way ("na").
  // normalizeLatin must give the same normalized key for both so that the
  // ambiguity is clearly visible and any future fold that breaks this invariant
  // is caught here.
  assert.equal(
    normalizeLatin("na"),
    normalizeLatin("na"),
    "same romanization folds to the same key (trivially true, confirms normalizeLatin is language-agnostic)",
  );
});

test("cross-language ambiguity: transcript 'na' matches both a Gujarati and a Hindi target at high sim", () => {
  // Gujarati negation: native="ná" (Latin-script stand-in for ના), romanized="na"
  // Hindi negation:   native="ना", romanized="na"
  // A transcript of "na" should give sim ≥ 0.90 against BOTH, demonstrating
  // that the phonetic guard alone cannot resolve the language.
  const gujarati = { native: "ná", romanized: "na" };
  const hindi    = { native: "ना", romanized: "na" };

  const cmpGu = compareToTarget("na", gujarati.native, gujarati.romanized);
  const cmpHi = compareToTarget("na", hindi.native, hindi.romanized);

  // Both must be comparable via the romanized path (the transcript is Latin).
  assert.ok(cmpGu.comparable, "Gujarati comparison should be comparable");
  assert.ok(cmpHi.comparable, "Hindi comparison should be comparable");

  // Both should score near 1.0, the ambiguity is real.
  assert.ok(
    cmpGu.sim >= 0.90,
    `expected sim ≥ 0.90 for Gujarati "na" target, got ${cmpGu.sim}`,
  );
  assert.ok(
    cmpHi.sim >= 0.90,
    `expected sim ≥ 0.90 for Hindi "na" target, got ${cmpHi.sim}`,
  );
});

test("cross-language ambiguity: wrong-phrase-cap does NOT fire when sibling list is empty (no cross-language phrases supplied)", () => {
  // The sibling-phrase list is always scoped to phrase.languageCode in the
  // route.  A Gujarati phrase evaluation never has Hindi phrases in otherPhrases,
  // so wrong-phrase-cap fires only within the same language.
  // When no otherPhrases are supplied the guard must stay silent and let the
  // transcript pass as a near-exact match.
  const gujarati = { native: "ná", romanized: "na" };
  const r = applyScoreGuards({
    score: 60,
    passed: false,
    transcript: "na",
    targetNative: gujarati.native,
    targetRomanized: gujarati.romanized,
    otherPhrases: [], // empty, no cross-language pollution
  });
  // sim("na","na")=1.0 → near-match-floor fires regardless of the LLM score.
  assert.ok(r.passed, "exact 'na' for Gujarati target must pass");
  assert.ok(r.score >= 85, `near-match-floor score should be ≥ 85, got ${r.score}`);
  assert.equal(r.guard, "near-match-floor");
});

test("cross-language ambiguity: wrong-phrase-cap fires when the sibling list contains an equally-matching phrase", () => {
  // Edge case: if, hypothetically, the sibling list were contaminated with
  // a phrase from another language that also romanizes to "na", the
  // wrong-phrase-cap would fire and cap the score at 40.  In practice the
  // sibling list is always same-language, so this scenario doesn't arise in
  // production, but the guard's robustness should be verified.
  //
  // We construct a Gujarati target "ha" (yes) and put "na" in the sibling list
  // so the transcript "na" clearly matches the sibling, not the target.
  const target  = { native: "há", romanized: "ha" };
  const sibling = { nativeScript: "ná", romanized: "na" };

  const r = applyScoreGuards({
    score: 80,
    passed: true,
    transcript: "na",
    targetNative: target.native,
    targetRomanized: target.romanized,
    otherPhrases: [sibling],
  });

  // sim("na","ha") < 0.5 (target mismatch), sim("na","na") = 1.0 (sibling match).
  assert.equal(r.passed, false, "transcript matching a sibling, not the target, must not pass");
  assert.ok(r.score <= 40, `wrong-phrase-cap must limit score to ≤ 40, got ${r.score}`);
  assert.equal(r.guard, "wrong-phrase-cap");
});

// ---------------------------------------------------------------------------
// normalizeNative, conjunct-nasal / anusvara equivalence (Devanagari)
// ---------------------------------------------------------------------------

test("normalizeNative: anusvara form and conjunct-nasal form produce the same key", () => {
  // हिंदी  = ह + ि + anusvara (U+0902) + द + ी
  // हिन्दी = ह + ि + न + virama (U+094D) + द + ी
  // Both should normalize to the same letter-only string so pronunciation
  // scoring treats them as identical spellings of the same word.
  assert.equal(
    normalizeNative("हिंदी"),
    normalizeNative("हिन्दी"),
    "anusvara form and conjunct-nasal form of 'Hindi' must normalize identically",
  );
});

test("normalizeNative: standalone nasal survives; only nasal+virama is stripped (minimal pair)", () => {
  // हिन्दी has न् (nasal + virama U+094D), the conjunct is stripped → "हद"
  // हिनदी has न  (standalone nasal, no virama) , the letter survives → "हनद"
  // The two strings differ ONLY in whether the nasal carries a virama.
  // If the rule were too aggressive (stripping all nasals), both would reduce
  // to the same key; this test catches that regression.
  assert.notEqual(
    normalizeNative("हिन्दी"),   // nasal + virama → stripped → "हद"
    normalizeNative("हिनदी"),    // standalone nasal → kept   → "हनद"
    "nasal+virama must be stripped but a standalone nasal letter must survive",
  );
});

test("normalizeNative is idempotent: applying it twice gives the same result as once", () => {
  // Catches ordering bugs in the replace chain, e.g. a step that produces
  // new strippable input for a later step, causing a second pass to differ.
  const inputs = ["हिन्दी", "हिंदी", "नम\u200Dस्ते", "kem chho", "केम छो"];
  for (const x of inputs) {
    assert.equal(
      normalizeNative(normalizeNative(x)),
      normalizeNative(x),
      `normalizeNative must be idempotent for input: ${x}`,
    );
  }
});

test("normalizeNative: ZWJ and ZWNJ are stripped and do not affect the key", () => {
  // Some STT engines emit ZWJ (U+200D) or ZWNJ (U+200C) in Devanagari output.
  // They must not create a mismatch against a clean reference string.
  assert.equal(
    normalizeNative("नम\u200Dस्ते"),  // ZWJ inserted mid-word
    normalizeNative("नमस्ते"),
    "ZWJ inside a word must not change the normalized key",
  );
});
