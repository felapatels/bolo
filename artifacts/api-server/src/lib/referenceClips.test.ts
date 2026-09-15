// When a native lesson phrase clip counts, and as what.
//
// These states decide which recording a learner will one day be judged
// against, so every rule is pinned in the direction that matters: what must
// NOT count as approved. The owner's reason for the second speaker was that "a
// wrong reference would mark learners wrong for saying it right".
//
// Names here are placeholders on purpose. No real contributor is named in
// code, tests or copy.
//
// PURE: rows are plain objects, and nothing opens a database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHRASE_MODE_ZONE_SLUGS,
  clipState,
  isClipVerdict,
  phraseProgress,
  reviewerSeesClip,
  sameSpeaker,
  type ClipFacts,
  type VerdictFacts,
} from "./referenceClips";

const TEXT = "खराब बा?";
const clip = (over: Partial<ClipFacts> = {}): ClipFacts => ({
  contributor: "SpeakerOne",
  isPractice: false,
  promptText: TEXT,
  ...over,
});
const verdict = (reviewer: string, v: "approved" | "rejected", over: Partial<VerdictFacts> = {}): VerdictFacts => ({
  reviewer,
  verdict: v,
  isPractice: false,
  ...over,
});

test("a real, current clip nobody has judged needs a check", () => {
  assert.equal(clipState(clip(), [], TEXT), "needs_check");
});

test("one real approval approves it", () => {
  assert.equal(clipState(clip(), [verdict("ReviewerTwo", "approved")], TEXT), "approved");
});

test("ONE objection outweighs any number of approvals", () => {
  const verdicts = [
    verdict("ReviewerTwo", "approved"),
    verdict("ReviewerThree", "approved"),
    verdict("ReviewerFour", "rejected"),
  ];
  assert.equal(clipState(clip(), verdicts, TEXT), "not_right");
});

test("practice and test-name recordings never count, whatever the verdicts", () => {
  const approvals = [verdict("ReviewerTwo", "approved")];
  assert.equal(clipState(clip({ isPractice: true }), approvals, TEXT), "not_counted");
  // The page stores names through safeName, so "Test Aakesh" arrives as
  // "Test_Aakesh". Both spellings, and the rest of the test list.
  for (const name of ["Test_Aakesh", "Test Aakesh", "testing123", "PROBE_CLAUDE", "smoke", "!Test"]) {
    assert.equal(clipState(clip({ contributor: name }), approvals, TEXT), "not_counted", name);
  }
});

test("a clip of words the app no longer teaches is stale, even if approved", () => {
  const approvals = [verdict("ReviewerTwo", "approved")];
  assert.equal(clipState(clip({ promptText: "जों" }), approvals, TEXT), "stale");
});

test("a spacing or case difference is not an edit", () => {
  // normalizePhraseText is the database's own idea of the same phrase; the
  // seed data carries at least one Bodo phrase with a trailing space.
  assert.equal(clipState(clip({ promptText: `  ${TEXT}  ` }), [], TEXT), "needs_check");
  assert.equal(clipState(clip({ promptText: "Hello  There" }), [], "hello there"), "needs_check");
});

test("a test reviewer's verdict changes nothing, in either direction", () => {
  // A walkthrough of the review page must neither approve a real clip nor
  // block one.
  assert.equal(clipState(clip(), [verdict("Test_Owner", "approved")], TEXT), "needs_check");
  assert.equal(
    clipState(clip(), [verdict("ReviewerTwo", "approved"), verdict("Test_Owner", "rejected")], TEXT),
    "approved",
  );
});

test("a practice verdict changes nothing", () => {
  assert.equal(clipState(clip(), [verdict("ReviewerTwo", "approved", { isPractice: true })], TEXT), "needs_check");
});

test("the speaker cannot approve their own clip, under any spelling of their name", () => {
  // The route refuses this; the rule ignores it anyway, so rows from any
  // other door cannot make a speaker their own second speaker.
  for (const self of ["SpeakerOne", "speakerone", " SpeakerOne ", "!SpeakerOne"]) {
    assert.equal(clipState(clip(), [verdict(self, "approved")], TEXT), "needs_check", self);
  }
  assert.equal(clipState(clip({ contributor: "First_Name" }), [verdict("first name", "approved")], TEXT), "needs_check");
});

test("sameSpeaker folds the page's safeName and nothing more", () => {
  assert.equal(sameSpeaker("First Name", "first_name"), true);
  assert.equal(sameSpeaker("First  Name", "First_Name"), true);
  assert.equal(sameSpeaker("SpeakerOne", "SpeakerTwo"), false);
  assert.equal(sameSpeaker("Speaker", "SpeakerOne"), false);
});

test("a phrase is approved by any approved take, and otherwise waits or needs a retake", () => {
  assert.equal(phraseProgress(["not_right", "approved"]), "approved");
  assert.equal(phraseProgress(["not_right", "needs_check"]), "needs_check");
  assert.equal(phraseProgress(["not_right"]), "not_right");
  assert.equal(phraseProgress(["stale", "not_counted"]), "none");
  assert.equal(phraseProgress([]), "none");
});

test("the review queue holds only clips worth a reviewer's time", () => {
  assert.equal(reviewerSeesClip(clip(), "ReviewerTwo", TEXT), true);
  assert.equal(reviewerSeesClip(clip({ isPractice: true }), "ReviewerTwo", TEXT), false);
  assert.equal(reviewerSeesClip(clip({ promptText: "जों" }), "ReviewerTwo", TEXT), false);
  assert.equal(reviewerSeesClip(clip(), "SpeakerOne", TEXT), false, "never their own recording");
  assert.equal(reviewerSeesClip(clip(), " speakerone ", TEXT), false, "nor under a respelling of it");
});

test("a test recording reaches only a reviewer who is also testing", () => {
  const testClip = clip({ contributor: "Test_Owner" });
  assert.equal(reviewerSeesClip(testClip, "ReviewerTwo", TEXT), false);
  assert.equal(reviewerSeesClip(testClip, "Test_Reviewer", TEXT), true);
  // And a tester still sees real clips, so both halves can be walked through.
  assert.equal(reviewerSeesClip(clip(), "Test_Reviewer", TEXT), true);
});

test("verdict words are exactly the two the table stores", () => {
  assert.equal(isClipVerdict("approved"), true);
  assert.equal(isClipVerdict("rejected"), true);
  for (const other of ["Approved", "ok", "", null, undefined, 1]) {
    assert.equal(isClipVerdict(other), false, String(other));
  }
});

test("only zone 1 is open, and it is the greetings category", () => {
  // Pinned so opening zone 2 is a decision somebody makes, with the client
  // twins' slug table in view, rather than a number that drifts.
  assert.equal(PHRASE_MODE_ZONE_SLUGS[1], "greetings");
  assert.deepEqual(Object.keys(PHRASE_MODE_ZONE_SLUGS), ["1"]);
});
