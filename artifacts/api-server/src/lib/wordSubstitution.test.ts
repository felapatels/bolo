import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyScoreGuards, hasWordSubstitution } from "./pronunciationGuards.js";

// ---------------------------------------------------------------------------
// Reported from the app: "I obviously said Kaise Hu instead of Kaise Hain, it
// heard me correctly, and I still got Perfect."
//
// Every other guard here compares WHOLE STRINGS, and normalizeLatin strips
// spaces. On "kaise hain?" the wrong ending drags similarity to 0.67 and the
// partial-match cap fires. On the real phrase "namaste, aap kaise hain?" the
// same error only reaches 0.83, no guard fires, and the LLM's 96 stands.
//
// So the protection switched off exactly where the phrase was long enough to
// hide the mistake, and in Indic languages the ending IS the grammar.
// ---------------------------------------------------------------------------

const guard = (transcript: string, target: string, score = 96) =>
  applyScoreGuards({
    score,
    passed: true,
    transcript,
    targetNative: target,
    targetRomanized: target,
  });

describe("the reported case", () => {
  test("a wrong verb ending fails on the LONG phrase it used to hide in", () => {
    const g = guard("namaste, aap kaise hu", "namaste, aap kaise hain?");
    assert.equal(g.guard, "word-substitution-cap");
    assert.equal(g.passed, false);
    assert.ok(g.score <= 72, `expected a capped score, got ${g.score}`);
  });

  test("and still fails on the short phrase, as it always did", () => {
    const g = guard("kaise hu", "kaise hain?");
    assert.equal(g.passed, false);
  });

  test("the correct answer is untouched", () => {
    const g = guard("namaste, aap kaise hain", "namaste, aap kaise hain?");
    assert.equal(g.passed, true);
    // An exact phonetic match is floored UP to 100 by the pre-existing
    // near-match rescue, which is why this asserts "not lowered" rather than a
    // fixed number. What matters here is that the new guard did not fire.
    assert.ok(g.score >= 96, `a correct answer was lowered to ${g.score}`);
    assert.notEqual(g.guard, "word-substitution-cap");
  });
});

describe("what counts as a substituted word", () => {
  test("clearly different words are caught", () => {
    // Measured: hu/hain .25, ho/hain .25, hu/hai .33, hu/ho .50
    assert.equal(hasWordSubstitution("aap kaise hu", "aap kaise hain"), true);
    assert.equal(hasWordSubstitution("aap kaise ho", "aap kaise hain"), true);
    assert.equal(hasWordSubstitution("main theek hai", "main theek hu"), true);
  });

  test("the SAME word spelled another way is NOT caught", () => {
    // This is the false-positive risk, and the reason the floor is 0.55 rather
    // than something tidier: hu/hoon .67 and kaise/kaisay .67 are one word
    // romanized two ways, and failing those would punish correct speech.
    assert.equal(hasWordSubstitution("main theek hu", "main theek hoon"), false);
    assert.equal(hasWordSubstitution("kem cho", "kem chho"), false);
    assert.equal(hasWordSubstitution("aap kaisay hain", "aap kaise hain"), false);
    assert.equal(hasWordSubstitution("ap theek hain", "aap thik hain"), false);
  });

  test("a recognizer that drops or invents a word is NOT the learner's fault", () => {
    // Unequal word counts are recognizer noise; the nocatch and script-mismatch
    // paths own those. Only equal shapes can be compared pairwise at all.
    assert.equal(hasWordSubstitution("kaise hain", "aap kaise hain"), false);
    assert.equal(hasWordSubstitution("aap ji kaise hain", "aap kaise hain"), false);
  });

  test("native-script transcripts are left alone", () => {
    // The guard needs word boundaries the romanized side has and the native
    // targets do not tokenize the same way.
    assert.equal(hasWordSubstitution("आप कैसे हैं", "aap kaise hain"), false);
  });
});

describe("what it deliberately does NOT catch", () => {
  test("vowel-level agreement errors still pass", () => {
    // mera/meri .75 and kaise/kaisa .80 sit ABOVE the variant floor, so no
    // token threshold can separate them from correct romanization variance.
    // Stated here rather than hidden: this guard catches substituted WORDS,
    // not every grammatical slip.
    assert.equal(hasWordSubstitution("mera naam", "meri naam"), false);
  });
});

describe("precedence against the other guards", () => {
  test("wrong-phrase-cap still wins, because it is the stronger signal", () => {
    // Saying a DIFFERENT catalog phrase outright earns a harder cap (<= 40)
    // than saying one wrong word (72). An earlier version of this guard fired
    // first and quietly weakened that penalty.
    const g = applyScoreGuards({
      score: 80,
      passed: true,
      transcript: "na",
      targetNative: "há",
      targetRomanized: "ha",
      otherPhrases: [{ nativeScript: "ná", romanized: "na" }],
    });
    assert.equal(g.guard, "wrong-phrase-cap");
    assert.ok(g.score <= 40);
  });

  test("a substituted word is not rescued by the near-match floor", () => {
    // The near-match branch returns a PASS early on whole-string similarity,
    // which is exactly what a wrong ending on a long phrase hides behind.
    const g = applyScoreGuards({
      score: 70,
      passed: false,
      transcript: "namaste, kaise hu",
      targetNative: "namaste, kaise ho?",
      targetRomanized: "namaste, kaise ho?",
    });
    assert.notEqual(g.guard, "near-match-floor");
    assert.equal(g.passed, false);
  });
});

describe("it only ever lowers a passing score", () => {
  test("an already-failing attempt is not touched by it", () => {
    const g = guard("aap kaise hu", "aap kaise hain", 40);
    assert.notEqual(g.guard, "word-substitution-cap");
  });
});
