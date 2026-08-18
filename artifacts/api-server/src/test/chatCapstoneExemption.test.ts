import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { capstoneExemptFromWeeklyCap } from "../lib/chatLimits.js";

// ---------------------------------------------------------------------------
// A zone capstone does not spend the free weekly chat budget, because the
// capstone is part of the journey rather than free chat: charging it to the
// same two minutes meant a free learner could be locked out of finishing their
// own zone, or could finish it and find the week's conversation spent.
//
// The BOUND is what these tests are really for. The exemption has to end, or a
// scenarioId on every request turns a capped free plan into unlimited chat.
// ---------------------------------------------------------------------------

describe("capstone exemption from the weekly chat cap", () => {
  test("an unstamped capstone turn is exempt", () => {
    assert.equal(capstoneExemptFromWeeklyCap(true, false), true);
  });

  test("the exemption ENDS at the stamp", () => {
    // Once the zone is completed the capstone has been had. Further turns in
    // that scene are ordinary chat and are capped like any other.
    assert.equal(capstoneExemptFromWeeklyCap(true, true), false);
  });

  test("ordinary chat is never exempt, stamped or not", () => {
    assert.equal(capstoneExemptFromWeeklyCap(false, false), false);
    assert.equal(capstoneExemptFromWeeklyCap(false, true), false);
  });
});
