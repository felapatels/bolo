/**
 * Shared-constant contract test.
 *
 * Any change to these four values on the server MUST update the matching
 * assertions in:
 *   artifacts/gujarati-coach/src/test/sharedConstants.contract.test.ts
 *   artifacts/bolo-mobile/__tests__/sharedConstants.contract.test.ts
 *
 * If this test turns red, a client will display incorrect limits, grade bands,
 * or mastery criteria. Fix the constant AND update both client suites.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MASTERY_THRESHOLD, REVIEW_PASS_THRESHOLD } from "./progressMetrics.js";
import { FREE_DAILY_NEW_LESSON_CAP, FREE_WEEKLY_CHAT_SECONDS_CAP } from "./entitlements.js";

test("MASTERY_THRESHOLD = 80", () => {
  assert.strictEqual(MASTERY_THRESHOLD, 80);
});

test("REVIEW_PASS_THRESHOLD = 60", () => {
  assert.strictEqual(REVIEW_PASS_THRESHOLD, 60);
});

test("FREE_DAILY_NEW_LESSON_CAP = 3", () => {
  assert.strictEqual(FREE_DAILY_NEW_LESSON_CAP, 3);
});

test("FREE_WEEKLY_CHAT_SECONDS_CAP = 120", () => {
  assert.strictEqual(FREE_WEEKLY_CHAT_SECONDS_CAP, 120);
});
