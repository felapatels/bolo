/**
 * best-band-regression.test.ts
 * Pins the existing best-score guarantee: given two attempt inputs for the
 * same phrase (score 90 then score 40), buildPhraseStats returns bestScore: 90.
 *
 * This is a pure unit test of the progressMetrics logic. No database needed.
 * The guarantee is inherent in buildPhraseStats' MAX(score) reduction logic.
 * No code change is expected; the test is a regression anchor so a future
 * refactor cannot accidentally flip the logic to use last-score or average.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { buildPhraseStats } from "../lib/progressMetrics.js";

const PHRASE_ID = 999999901;

describe("buildPhraseStats best-score guarantee", () => {
  it("returns bestScore of 90 after attempts of 90 then 40", () => {
    const stats = buildPhraseStats([
      { phraseId: PHRASE_ID, score: 90 },
      { phraseId: PHRASE_ID, score: 40 },
    ]);
    const phraseStat = stats.get(PHRASE_ID);
    assert.ok(phraseStat !== undefined, "Phrase stat must exist");
    assert.strictEqual(
      phraseStat!.bestScore,
      90,
      "Best score must be 90 (the higher of the two attempts) -- lower attempts must never downgrade",
    );
    assert.ok(
      phraseStat!.attemptCount >= 2,
      "Attempt count must be at least 2",
    );
  });

  it("returns bestScore of 40 when only one attempt of 40 exists", () => {
    const stats = buildPhraseStats([{ phraseId: PHRASE_ID, score: 40 }]);
    const phraseStat = stats.get(PHRASE_ID);
    assert.ok(phraseStat !== undefined);
    assert.strictEqual(phraseStat!.bestScore, 40);
  });

  it("handles multiple phrases independently", () => {
    const stats = buildPhraseStats([
      { phraseId: 1, score: 80 },
      { phraseId: 2, score: 50 },
      { phraseId: 1, score: 30 }, // lower attempt on phrase 1
      { phraseId: 2, score: 90 }, // higher attempt on phrase 2
    ]);
    assert.strictEqual(stats.get(1)!.bestScore, 80, "Phrase 1 best should be 80");
    assert.strictEqual(stats.get(2)!.bestScore, 90, "Phrase 2 best should be 90");
  });
});
