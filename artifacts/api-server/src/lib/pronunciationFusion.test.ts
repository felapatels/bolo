/**
 * Fusing the transcript rubric with the reference comparison.
 *
 * The rules under test are about WHICH scorer gets believed and when, so they
 * are mostly about the cases where one of them is absent or the two disagree.
 * Those are the cases a naive average would get wrong.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { fuseScores } from "./pronunciationFusion";

test("a missing scorer is never treated as a zero", () => {
  // The whole reason this is branchy rather than arithmetic. Bodo has no
  // recognition and most phrases have no reference clip; either absence must
  // leave the surviving score untouched.
  assert.equal(fuseScores(88, null).score, 88);
  assert.equal(fuseScores(88, null).agreement, "transcript_only");
  assert.equal(fuseScores(null, 74).score, 74);
  assert.equal(fuseScores(null, 74).agreement, "acoustic_only");
});

test("neither scorer running is a nocatch, not a bad mark", () => {
  const r = fuseScores(null, null);
  assert.equal(r.band, "nocatch");
  assert.equal(r.transcriptScore, null);
  assert.equal(r.acousticScore, null);
});

test("agreement leaves the score alone", () => {
  const r = fuseScores(90, 85);
  assert.equal(r.score, 90);
  assert.equal(r.agreement, "agree");
  // 'perfect' starts at 91, so 90 is 'great'. The band comes from scoreBands
  // and this module must not second-guess it.
  assert.equal(r.band, "great");
});

test("a confident transcript with a poor acoustic match is pulled down and flagged", () => {
  // THE CASE THIS MODULE EXISTS FOR. Recognition snaps a near miss to the
  // nearest real word, so a dental for a retroflex reads as perfect. A poor
  // acoustic match beside a perfect transcript is the only handle there is on
  // that, so it moves the score AND says why.
  const r = fuseScores(95, 50);
  assert.equal(r.agreement, "transcript_generous");
  assert.ok(r.score < 95, "the disagreement must cost something");
  assert.ok(r.score > 50, "but the acoustic scorer does not get to win outright");
});

test("the pull-down is deliberately gentle", () => {
  // A cold, a cheap microphone and a small room all look like an acoustic
  // mismatch. Under-scoring a shy child costs more than missing one retroflex,
  // so this errs toward the generous scorer until real attempts are rated.
  const r = fuseScores(95, 50);
  assert.ok(r.score >= 75, `expected a gentle pull, got ${r.score}`);
});

test("a wrong word is not rescued by sounding nice", () => {
  // Below full credit the word itself was wrong, and how closely a wrong word
  // matches the reference is not a question worth asking.
  const r = fuseScores(40, 95);
  assert.equal(r.score, 40);
  assert.equal(r.band, "retry");
  assert.equal(r.agreement, "acoustic_generous");
});

test("a small disagreement is not treated as one", () => {
  const r = fuseScores(90, 70);
  assert.equal(r.score, 90);
  assert.equal(r.agreement, "agree");
});

test("bands always follow the fused score, never either input", () => {
  const r = fuseScores(95, 40);
  assert.ok(r.score < 95);
  assert.equal(r.band, r.score >= 91 ? "perfect" : r.score >= 80 ? "great" : r.band);
  assert.notEqual(r.band, "nocatch");
});
