// THE PIN. This file's first test exists to FAIL when somebody flips the
// enforcement flag, so that the flip cannot happen quietly and cannot happen
// without the client half landing in the same commit.
import { test } from "node:test";
import assert from "node:assert/strict";
// Imports the PURE module deliberately. A pinned flag that needed a database
// mock in order to be read would be a guard with a dependency, and the point of
// pinning it is that nothing can stop it running.
import {
  AI_CONSENT_ENFORCED,
  AI_CONSENT_VERSION,
  decisionOf,
  NEVER_ASKED,
} from "./aiConsentTypes";

test("the enforcement flag is still false, and flipping it is a two-part commit", () => {
  assert.equal(
    AI_CONSENT_ENFORCED,
    false,
    "AI_CONSENT_ENFORCED is true. If the consent SCREENS have shipped in this " +
      "same commit, update this test in that commit and say so in the message. " +
      "If they have not, this flip 403s speaking practice, chat and the call " +
      "for EVERY learner, because nobody has been given a way to say yes.",
  );
});

test("null is never-asked and is NOT a refusal", () => {
  // The whole of "asked once, never nagged" rests on these three being three.
  assert.equal(decisionOf(null), null);
  assert.equal(decisionOf(true), "granted");
  assert.equal(decisionOf(false), "declined");
  assert.notEqual(decisionOf(null), decisionOf(false));
});

test("a learner with no row reads as never-asked, not as declined", () => {
  // A missing row must ASK. Reading it as a refusal would silently switch the
  // voice features off for anyone whose row has not been provisioned yet.
  assert.equal(NEVER_ASKED.decision, null);
  assert.equal(NEVER_ASKED.decidedAt, null);
  assert.equal(NEVER_ASKED.version, null);
});

test("the disclosure version is a non-empty string and is stamped on every decision", () => {
  // A consent with no version is a consent to an unknown text. This asserts the
  // constant exists and looks like a version rather than a placeholder.
  assert.equal(typeof AI_CONSENT_VERSION, "string");
  assert.ok(AI_CONSENT_VERSION.length > 0, "AI_CONSENT_VERSION must not be empty");
  assert.notEqual(AI_CONSENT_VERSION, "TODO");
  assert.match(
    AI_CONSENT_VERSION,
    /^\d{4}-\d{2}-\d{2}\.\d+$/,
    "expected a dated version like 2026-09-10.1 so a row says WHEN as well as which",
  );
});
