import { test } from "node:test";
import assert from "node:assert/strict";
import { usableNote } from "./reportNote";

// A note that is NOTHING BUT an email address is dropped server side.
//
// MEASURED, NOT SUSPECTED. On 2026-08-25 production held 47 phrase reports and
// 44 carried the identical string "appletester721-bolo@yahoo.com" where the
// explanation should be. Every "why" in the product's only learner-side content
// QA had been replaced by an address.
//
// THE CLIENT FIX WAS ALREADY SHIPPED AND DID NOT HOLD. 417c5d29 put
// autoComplete="new-note" on the web textarea and autoComplete="off" plus
// textContentType="none" on the mobile one, both live from 2026-08-24. Five
// more reports arrived on the evening of 2026-08-25 still carrying it. This
// test guards the server-side backstop, which is the only layer that does not
// depend on which browser or OS the report came from.

test("an email-only note is dropped", () => {
  assert.equal(usableNote("appletester721-bolo@yahoo.com"), undefined);
  assert.equal(usableNote("  appletester721-bolo@yahoo.com  "), undefined);
  assert.equal(usableNote("a@b.co"), undefined);
});

test("a real explanation containing an address is kept IN FULL", () => {
  // The whole point of stripping rather than rejecting. Somebody reporting that
  // a phrase's audio reads out an address is making a real report, and eating
  // their words would be a worse bug than the one this fixes.
  const note = "the audio says hello@example.com instead of the phrase";
  assert.equal(usableNote(note), note);
  assert.equal(usableNote("email me at x@y.com please"), "email me at x@y.com please");
});

test("ordinary notes are untouched", () => {
  assert.equal(usableNote("translation is wrong"), "translation is wrong");
  assert.equal(usableNote("  trimmed  "), "trimmed");
  // Not an address: no local part, so it is somebody typing a domain.
  assert.equal(usableNote("@yahoo.com"), "@yahoo.com");
  assert.equal(usableNote("not-an-email"), "not-an-email");
});

test("empty and absent notes come back undefined", () => {
  assert.equal(usableNote(undefined), undefined);
  assert.equal(usableNote(""), undefined);
  assert.equal(usableNote("   "), undefined);
});
