/**
 * Shared-constant contract test, web (Vitest).
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
import fs from "node:fs";
import path from "node:path";
import { bandFromScore } from "@/components/ui/band-pill";
import { REFERRAL_REWARD_CHAI } from "@workspace/referral-link";

// ── Server constants mirrored here for cross-platform contract testing ─────
// These must match the values exported from:
//   artifacts/api-server/src/lib/progressMetrics.ts  (MASTERY_THRESHOLD, REVIEW_PASS_THRESHOLD)
//   artifacts/api-server/src/lib/entitlements.ts      (FREE_WEEKLY_CHAT_SECONDS_CAP)
// The topic phrase ceiling deliberately has NO mirror here: it varies by tier
// and is read off the server's category listing, never hardcoded in a client.

const MASTERY_THRESHOLD = 80;
const REVIEW_PASS_THRESHOLD = 60;
const FREE_WEEKLY_CHAT_SECONDS_CAP = 120;

// Five-band thresholds, must match artifacts/api-server/src/lib/scoreBands.ts
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

  // Task #1049: home and settings both advertise "You both get N Chai". N is
  // REFERRAL_REWARD_CHAI from @workspace/referral-link, and this test is the
  // only thing standing between that copy and a promise the ledger will not
  // pay. It reads the SERVER file rather than mirroring the number as a
  // literal, so moving the server constants without moving the shared one
  // fails here instead of shipping.
  test("REFERRAL_REWARD_CHAI equals the server's referral reward constants", () => {
    const root = path.resolve(__dirname, "../../../..");
    const source = fs.readFileSync(
      path.join(root, "artifacts/api-server/src/lib/tokenEconomy.ts"),
      "utf8",
    );
    const read = (name: string) => {
      const match = source.match(
        new RegExp(`export const ${name}\\s*=\\s*(\\d+)`),
      );
      if (!match) throw new Error(`${name} not found in tokenEconomy.ts`);
      return Number(match[1]);
    };

    // Both sides are paid the same amount, which is what "You both get N" says.
    expect(read("REFERRAL_REWARD_REFERRER_CHAI")).toBe(REFERRAL_REWARD_CHAI);
    expect(read("REFERRAL_REWARD_REFEREE_CHAI")).toBe(REFERRAL_REWARD_CHAI);
  });

  test("the mastery rule in five-band terms: mastered = best attempt at least Great", () => {
    // score >= 80 (MASTERY_THRESHOLD) is exactly the perfect|great group.
    expect(BAND_THRESHOLDS.great).toBe(MASTERY_THRESHOLD);
    expect(bandFromScore(MASTERY_THRESHOLD)).toBe("great");
    expect(bandFromScore(MASTERY_THRESHOLD - 1)).toBe("good");
  });
});
