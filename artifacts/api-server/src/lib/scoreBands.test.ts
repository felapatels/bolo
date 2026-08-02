/**
 * Five-band derivation unit tests (Task: five-band scoring display).
 *
 * Pins every threshold edge of bandFromScore, the credit-group helpers that
 * freeze legacy behavior (XP, Elo, FSRS, streaks, test-out), and the
 * normalizeBand legacy-to-five-band read-time mapping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BAND_LADDER,
  BAND_THRESHOLDS,
  bandFromScore,
  isFullCreditBand,
  isHalfCreditBand,
  isPassingBand,
  normalizeBand,
} from "./scoreBands.js";

test("BAND_LADDER lists the five scored bands top to bottom", () => {
  assert.deepStrictEqual(
    [...BAND_LADDER],
    ["perfect", "great", "good", "almost", "retry"],
  );
});

test("bandFromScore boundary edges at every threshold", () => {
  // perfect edge (91, owner ruling Aug 2, 2026)
  assert.strictEqual(bandFromScore(100), "perfect");
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.perfect), "perfect");
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.perfect - 1), "great");
  // great edge (80 — FROZEN legacy 'nailed' boundary)
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.great), "great");
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.great - 1), "good");
  // good edge (68)
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.good), "good");
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.good - 1), "almost");
  // almost edge (55 — FROZEN legacy 'close' boundary)
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.almost), "almost");
  assert.strictEqual(bandFromScore(BAND_THRESHOLDS.almost - 1), "retry");
  assert.strictEqual(bandFromScore(0), "retry");
});

test("credit groups freeze the legacy 80/55 behavioral boundaries", () => {
  // full credit == legacy 'nailed' (score >= 80)
  assert.ok(isFullCreditBand("perfect"));
  assert.ok(isFullCreditBand("great"));
  assert.ok(!isFullCreditBand("good"));
  assert.ok(!isFullCreditBand("almost"));
  assert.ok(!isFullCreditBand("retry"));
  assert.ok(!isFullCreditBand("nocatch"));
  // half credit == legacy 'close' (55-79)
  assert.ok(!isHalfCreditBand("perfect"));
  assert.ok(!isHalfCreditBand("great"));
  assert.ok(isHalfCreditBand("good"));
  assert.ok(isHalfCreditBand("almost"));
  assert.ok(!isHalfCreditBand("retry"));
  assert.ok(!isHalfCreditBand("nocatch"));
  // passing == legacy nailed|close
  assert.ok(isPassingBand("perfect"));
  assert.ok(isPassingBand("great"));
  assert.ok(isPassingBand("good"));
  assert.ok(isPassingBand("almost"));
  assert.ok(!isPassingBand("retry"));
  assert.ok(!isPassingBand("nocatch"));
  // Every score's derived band lands in the same credit group as the legacy
  // three-band derivation at that score.
  for (let score = 0; score <= 100; score++) {
    const band = bandFromScore(score);
    assert.strictEqual(isFullCreditBand(band), score >= 80, `score ${score}`);
    assert.strictEqual(
      isHalfCreditBand(band),
      score >= 55 && score < 80,
      `score ${score}`,
    );
  }
});

test("normalizeBand maps legacy stored bands from the score, exactly", () => {
  // Legacy names re-derive from the score (exact: legacy bands came from the
  // same score field with the same frozen 80/55 edges).
  assert.strictEqual(normalizeBand("nailed", 95), "perfect");
  assert.strictEqual(normalizeBand("nailed", 85), "great");
  assert.strictEqual(normalizeBand("close", 70), "good");
  assert.strictEqual(normalizeBand("close", 60), "almost");
  assert.strictEqual(normalizeBand("retry", 40), "retry");
  // New names pass through untouched.
  assert.strictEqual(normalizeBand("perfect", 95), "perfect");
  assert.strictEqual(normalizeBand("great", 85), "great");
  assert.strictEqual(normalizeBand("good", 70), "good");
  assert.strictEqual(normalizeBand("almost", 60), "almost");
  // nocatch is a separate system outcome, never re-derived from score.
  assert.strictEqual(normalizeBand("nocatch", 95), "nocatch");
});
