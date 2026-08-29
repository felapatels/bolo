import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripDashes } from "./spokenCopy";

// The em-dash scrub on model-written feedback (owner, 2026-08-29). A dash
// used as punctuation becomes a comma; everything else is untouched.
describe("stripDashes", () => {
  it("turns a spaced em dash into a comma", () => {
    assert.equal(stripDashes("Great job — keep going!"), "Great job, keep going!");
  });

  it("handles an unspaced em dash and an en dash the same way", () => {
    assert.equal(stripDashes("Nice work—really nice"), "Nice work, really nice");
    assert.equal(stripDashes("Nice work – really nice"), "Nice work, really nice");
  });

  it("never leaves a comma stranded against a full stop or another comma", () => {
    assert.equal(stripDashes("You nailed it —."), "You nailed it.");
    assert.equal(stripDashes("Lovely, — really"), "Lovely, really");
    assert.equal(stripDashes("— Start strong"), "Start strong");
    assert.equal(stripDashes("Keep going —"), "Keep going");
  });

  it("leaves dash-free text byte for byte", () => {
    const line = "That sounded great! You really nailed the sounds in that one.";
    assert.equal(stripDashes(line), line);
    assert.equal(stripDashes(""), "");
  });

  it("does not touch a hyphen, which is spelling rather than punctuation", () => {
    assert.equal(stripDashes("a well-rounded try"), "a well-rounded try");
  });
});
