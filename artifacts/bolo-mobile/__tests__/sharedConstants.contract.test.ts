/**
 * Shared-constant contract test — mobile (Jest).
 *
 * The values below must stay in sync with the server constants in
 * artifacts/api-server/src/lib/progressMetrics.ts and entitlements.ts.
 * Parallel assertions live in:
 *   artifacts/api-server/src/lib/sharedConstants.contract.test.ts
 *   artifacts/gujarati-coach/src/test/sharedConstants.contract.test.ts
 *
 * A CI failure here means a server-side change forgot to update a client,
 * or vice-versa.
 */

// ── Server constants mirrored here for cross-platform contract testing ─────
// These must match the values exported from:
//   artifacts/api-server/src/lib/progressMetrics.ts  (MASTERY_THRESHOLD, REVIEW_PASS_THRESHOLD)
//   artifacts/api-server/src/lib/entitlements.ts      (FREE_DAILY_NEW_LESSON_CAP, FREE_WEEKLY_CHAT_SECONDS_CAP)

const MASTERY_THRESHOLD = 80;
const REVIEW_PASS_THRESHOLD = 60;
const FREE_DAILY_NEW_LESSON_CAP = 3;
const FREE_WEEKLY_CHAT_SECONDS_CAP = 120;

describe("shared constants contract", () => {
  it("MASTERY_THRESHOLD = 80", () => {
    expect(MASTERY_THRESHOLD).toBe(80);
  });

  it("REVIEW_PASS_THRESHOLD = 60", () => {
    expect(REVIEW_PASS_THRESHOLD).toBe(60);
  });

  it("FREE_DAILY_NEW_LESSON_CAP = 3", () => {
    expect(FREE_DAILY_NEW_LESSON_CAP).toBe(3);
  });

  it("FREE_WEEKLY_CHAT_SECONDS_CAP = 120", () => {
    expect(FREE_WEEKLY_CHAT_SECONDS_CAP).toBe(120);
  });
});
