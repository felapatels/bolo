// The keys that open the contribution page's lesson phrase modes.
//
// WHAT THESE PIN. The review mode plays contributors' voices back out, so the
// key is the only thing between a guessed URL and somebody's recordings. Every
// way a key must FAIL is asserted beside the one way it must pass, because a
// check that has only ever been seen rejecting junk would also pass if it
// rejected everything, and one only ever seen accepting would pass if it
// accepted everything.
//
// PURE. The functions read SESSION_SECRET when called, not when imported, so
// setting it inside each case is enough and nothing touches a database.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  CONTRIBUTION_LINK_DAYS,
  checkContributionKey,
  mintContributionKey,
} from "./contributionLinks";

const DAY = 86_400_000;
// 2026-09-15 13:45 UTC: mid-day on purpose, so the day pinning is exercised.
const NOW = Date.UTC(2026, 8, 15, 13, 45, 0);

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "a-test-signing-secret-that-is-long-enough";
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

function mint(mode: "record" | "review", language: string, now = NOW) {
  const minted = mintContributionKey(mode, language, now);
  assert.ok(minted, "a key must mint while SESSION_SECRET is set");
  return minted;
}

test("a minted key opens its own mode and language", () => {
  const { key } = mint("record", "brx");
  assert.equal(checkContributionKey("record", "brx", key, NOW), "ok");
  const review = mint("review", "mni");
  assert.equal(checkContributionKey("review", "mni", review.key, NOW), "ok");
});

test("a record key does not open review, and a review key does not open record", () => {
  // The two halves are separated so a speaker's link cannot approve their own
  // clips and a reviewer's link cannot add clips to the queue they judge.
  const record = mint("record", "brx").key;
  const review = mint("review", "brx").key;
  assert.equal(checkContributionKey("review", "brx", record, NOW), "invalid");
  assert.equal(checkContributionKey("record", "brx", review, NOW), "invalid");
});

test("a key for one language opens no other", () => {
  const { key } = mint("review", "brx");
  assert.equal(checkContributionKey("review", "mni", key, NOW), "invalid");
  assert.equal(checkContributionKey("review", "brx ", key, NOW), "invalid");
});

test("changing any character of the signature or the expiry breaks the key", () => {
  const { key } = mint("record", "brx");
  const [exp, sig] = key.split(".") as [string, string];
  const flip = (s: string, i: number) =>
    s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
  assert.equal(checkContributionKey("record", "brx", `${exp}.${flip(sig, 0)}`, NOW), "invalid");
  assert.equal(checkContributionKey("record", "brx", `${exp}.${flip(sig, sig.length - 1)}`, NOW), "invalid");
  // A later expiry is exactly what somebody holding a lapsed link would try.
  const later = (parseInt(exp, 36) + 365 * 86_400).toString(36);
  assert.equal(checkContributionKey("record", "brx", `${later}.${sig}`, NOW), "invalid");
});

test("a key runs at least the promised number of days, then says expired", () => {
  const { key, expiresAt } = mint("review", "brx");
  assert.ok(
    expiresAt.getTime() - NOW >= CONTRIBUTION_LINK_DAYS * DAY,
    `expires ${expiresAt.toISOString()}, under ${CONTRIBUTION_LINK_DAYS} days from mint`,
  );
  assert.equal(checkContributionKey("review", "brx", key, expiresAt.getTime() - 1000), "ok");
  assert.equal(checkContributionKey("review", "brx", key, expiresAt.getTime()), "expired");
  assert.equal(checkContributionKey("review", "brx", key, expiresAt.getTime() + 90 * DAY), "expired");
});

test("expired is only ever said about a genuine key", () => {
  // A forged key with a past date must not learn that its format was right.
  const { key, expiresAt } = mint("record", "brx");
  const forged = key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");
  assert.equal(checkContributionKey("record", "brx", forged, expiresAt.getTime() + DAY), "invalid");
});

test("every key minted on one UTC day is the same string, and the next day's differs", () => {
  // The Nest re-renders every thirty seconds; a link that changed while the
  // owner was copying it would look broken.
  const morning = mint("record", "brx", Date.UTC(2026, 8, 15, 0, 0, 1)).key;
  const evening = mint("record", "brx", Date.UTC(2026, 8, 15, 23, 59, 59)).key;
  const tomorrow = mint("record", "brx", Date.UTC(2026, 8, 16, 0, 0, 1)).key;
  assert.equal(morning, evening);
  assert.notEqual(morning, tomorrow);
});

test("without SESSION_SECRET nothing mints and nothing opens", () => {
  const { key } = mint("record", "brx");
  delete process.env.SESSION_SECRET;
  assert.equal(mintContributionKey("record", "brx", NOW), null);
  assert.equal(checkContributionKey("record", "brx", key, NOW), "invalid");
  process.env.SESSION_SECRET = "";
  assert.equal(mintContributionKey("record", "brx", NOW), null);
  assert.equal(checkContributionKey("record", "brx", key, NOW), "invalid");
});

test("rotating the secret retires every outstanding link", () => {
  const { key } = mint("review", "brx");
  process.env.SESSION_SECRET = "a-different-secret-after-rotation";
  assert.equal(checkContributionKey("review", "brx", key, NOW), "invalid");
});

test("junk is invalid, not an exception", () => {
  for (const junk of [undefined, null, 42, {}, "", ".", "abc", "abc.", ".abc", "x".repeat(65), "tm8v1s.short", "TM8V1S.AAAAAAAAAAAAAAAAAAAAAA"]) {
    assert.equal(checkContributionKey("record", "brx", junk, NOW), "invalid", `for ${JSON.stringify(junk)}`);
  }
});
