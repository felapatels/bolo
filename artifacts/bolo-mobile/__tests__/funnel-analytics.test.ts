jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn() }));
import { ORGANIC, parseAcquisition } from "@/lib/acquisition";
import { lessonTypeFor, stationNewlyCompleted } from "@/lib/lessonAnalytics";

// The funnel set's pure halves (owner analytics audit, 2026-09-16). Web twin:
// gujarati-coach/src/test/funnel-analytics.test.ts, same cases.

describe("parseAcquisition", () => {
  test("no URL, or a URL with nothing in it, is organic", () => {
    expect(parseAcquisition(null)).toEqual(ORGANIC);
    expect(parseAcquisition("https://bolo-india.app/")).toEqual(ORGANIC);
  });

  test("utm_* parameters are kept", () => {
    expect(
      parseAcquisition("https://bolo-india.app/?utm_source=tiktok&utm_medium=social&utm_campaign=first%20time"),
    ).toEqual({
      acquisition_source: "tiktok",
      acquisition_medium: "social",
      acquisition_campaign: "first time",
      referral_code: "none",
    });
  });

  test("a /join/<code> link is a referral, unless a campaign already named the source", () => {
    expect(parseAcquisition("https://bolo-india.app/join/ABC123")).toMatchObject({
      acquisition_source: "referral",
      acquisition_medium: "referral",
      referral_code: "ABC123",
    });
    expect(parseAcquisition("https://bolo-india.app/join/ABC123?utm_source=whatsapp")).toMatchObject({
      acquisition_source: "whatsapp",
      referral_code: "ABC123",
    });
  });
});

describe("station analytics", () => {
  const stop = (mastered: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ id: i + 1, bestScore: i < mastered ? 90 : 40 }));

  test("fires when this session carries the stop over the server's line", () => {
    // 15 phrases: the server completes at 12 (12 / 15 = 0.8), not ceil(12.000001) = 13.
    expect(stationNewlyCompleted(stop(11, 15), new Set([15]))).toBe(true);
    expect(stationNewlyCompleted(stop(10, 15), new Set([15]))).toBe(false);
  });

  test("a stop that was already complete does not fire again on review", () => {
    expect(stationNewlyCompleted(stop(12, 15), new Set([13, 14, 15]))).toBe(false);
    expect(stationNewlyCompleted([], new Set())).toBe(false);
  });

  test("lesson types", () => {
    expect(lessonTypeFor({ isGroup: true, isTestout: true, isSentences: false })).toBe("testout");
    expect(lessonTypeFor({ isGroup: true, isTestout: false, isSentences: false })).toBe("station");
    expect(lessonTypeFor({ isGroup: false, isTestout: false, isSentences: true })).toBe("sentences");
    expect(lessonTypeFor({ isGroup: false, isTestout: false, isSentences: false })).toBe("topic");
  });
});
