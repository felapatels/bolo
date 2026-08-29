/**
 * The hesitation notch (build 20): a long pause before speaking pulls the
 * FSRS rating one step down, never below Hard, so the phrase comes back
 * sooner while the pass still stands. Pure; runs on the Mac.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { HESITATION_MS, Rating, ratingAfterHesitation } from "./fsrsScheduler";

describe("ratingAfterHesitation", () => {
  test("the line is a second and a half of silence before the first word", () => {
    assert.equal(HESITATION_MS, 1500);
  });

  test("a pause at or past the line takes Easy to Good and Good to Hard", () => {
    assert.equal(ratingAfterHesitation(Rating.Easy, 1500), Rating.Good);
    assert.equal(ratingAfterHesitation(Rating.Good, 2200), Rating.Hard);
  });

  test("Hard and Again never go lower: a miss is already a miss", () => {
    assert.equal(ratingAfterHesitation(Rating.Hard, 4000), Rating.Hard);
    assert.equal(ratingAfterHesitation(Rating.Again, 4000), Rating.Again);
  });

  test("a short pause, or no measurement at all, changes nothing", () => {
    assert.equal(ratingAfterHesitation(Rating.Easy, 1499), Rating.Easy);
    assert.equal(ratingAfterHesitation(Rating.Good, 0), Rating.Good);
    assert.equal(ratingAfterHesitation(Rating.Easy, null), Rating.Easy);
    assert.equal(ratingAfterHesitation(Rating.Good, undefined), Rating.Good);
  });
});
