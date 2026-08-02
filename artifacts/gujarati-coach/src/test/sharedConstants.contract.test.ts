/**
 * Shared-constant contract test — web (Vitest).
 *
 * The values below must stay in sync with the server constants in
 * artifacts/api-server/src/lib/progressMetrics.ts and entitlements.ts.
 * Parallel assertions live in:
 *   artifacts/api-server/src/lib/sharedConstants.contract.test.ts
 *   artifacts/bolo-mobile/__tests__/sharedConstants.contract.test.ts
 *
 * A CI failure here means a server-side change forgot to update a client,
 * or vice-versa.
 */
import { describe, test, expect } from "vitest";
import { bandFromScore } from "@/components/ui/band-pill";

// ── Server constants mirrored here for cross-platform contract testing ─────
// These must match the values exported from:
//   artifacts/api-server/src/lib/progressMetrics.ts  (MASTERY_THRESHOLD, REVIEW_PASS_THRESHOLD)
//   artifacts/api-server/src/lib/entitlements.ts      (FREE_DAILY_NEW_LESSON_CAP, FREE_WEEKLY_CHAT_SECONDS_CAP)

const MASTERY_THRESHOLD = 80;
const REVIEW_PASS_THRESHOLD = 60;
const FREE_DAILY_NEW_LESSON_CAP = 3;
const FREE_WEEKLY_CHAT_SECONDS_CAP = 120;

// Five-band thresholds — must match artifacts/api-server/src/lib/scoreBands.ts
// (BAND_THRESHOLDS). 80/55 are FROZEN legacy behavioral boundaries; 91 was set
// by owner ruling (Aug 2, 2026); 68 is a TUNING PENDING display split.
const BAND_THRESHOLDS = { perfect: 91, great: 80, good: 68, almost: 55 };

describe("shared constants contract", () => {
  test("MASTERY_THRESHOLD = 80", () => {
    expect(MASTERY_THRESHOLD).toBe(80);
  });

  test("REVIEW_PASS_THRESHOLD = 60", () => {
    expect(REVIEW_PASS_THRESHOLD).toBe(60);
  });

  test("FREE_DAILY_NEW_LESSON_CAP = 3", () => {
    expect(FREE_DAILY_NEW_LESSON_CAP).toBe(3);
  });

  test("FREE_WEEKLY_CHAT_SECONDS_CAP = 120", () => {
    expect(FREE_WEEKLY_CHAT_SECONDS_CAP).toBe(120);
  });

  test("BAND_THRESHOLDS = { perfect: 91, great: 80, good: 68, almost: 55 }", () => {
    expect(BAND_THRESHOLDS).toEqual({ perfect: 91, great: 80, good: 68, almost: 55 });
  });

  test("client bandFromScore matches the server thresholds at every boundary", () => {
    expect(bandFromScore(BAND_THRESHOLDS.perfect)).toBe("perfect");
    expect(bandFromScore(BAND_THRESHOLDS.perfect - 1)).toBe("great");
    expect(bandFromScore(BAND_THRESHOLDS.great)).toBe("great");
    expect(bandFromScore(BAND_THRESHOLDS.great - 1)).toBe("good");
    expect(bandFromScore(BAND_THRESHOLDS.good)).toBe("good");
    expect(bandFromScore(BAND_THRESHOLDS.good - 1)).toBe("almost");
    expect(bandFromScore(BAND_THRESHOLDS.almost)).toBe("almost");
    expect(bandFromScore(BAND_THRESHOLDS.almost - 1)).toBe("retry");
  });

  test("the mastery rule in five-band terms: mastered = best attempt at least Great", () => {
    // score >= 80 (MASTERY_THRESHOLD) is exactly the perfect|great group.
    expect(BAND_THRESHOLDS.great).toBe(MASTERY_THRESHOLD);
    expect(bandFromScore(MASTERY_THRESHOLD)).toBe("great");
    expect(bandFromScore(MASTERY_THRESHOLD - 1)).toBe("good");
  });
});
