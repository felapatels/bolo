import { describe, it, expect } from "vitest";
import {
  GIFT_DAY_ONE_CHAI,
  GIFT_LADDER_CAP,
  dailyGiftFor,
  giftChaiForStreakDay,
  giftClosedCopy,
  giftOpenedCopy,
  giftRefId,
  giftTierForStreakDay,
} from "@workspace/daily-gift";

// THE DAILY GIFT'S PURE HALF, and it lives here for the same reason the letter
// stop's does: this is the only suite in the repo that runs on a Mac without a
// database. The package is consumed by all three artifacts, so a rule that
// broke here would break the server's grant AND both clients' copy at once.
//
// WHAT IS ACTUALLY AT RISK. The ladder is four lines of arithmetic and none of
// these tests exists because the arithmetic is hard. They exist because every
// one of them is a RULING that a later session could reasonably talk itself out
// of: that day 1 still pays what the silent grant paid, that the ladder does
// not double, that the box never promises a number the ladder will not honour,
// and that yesterday's unopened box is gone rather than stacked.

describe("the ladder", () => {
  it("pays day 1 exactly what the silent grant already paid", () => {
    // THE ONE THING THAT MAKES THIS SAFE TO SHIP. The app has paid 1 Chai a day
    // for showing up since long before the gift existed, and a learner whose
    // streak is broken must not come back to LESS than they had. It must equal
    // the server's TOKEN_EARN_STREAK_DAY; the server asserts that direction,
    // because that constant belongs to the ledger and not to this package.
    expect(giftChaiForStreakDay(1)).toBe(GIFT_DAY_ONE_CHAI);
    expect(GIFT_DAY_ONE_CHAI).toBe(1);
  });

  it("climbs one a day to a week and then holds", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(giftChaiForStreakDay)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(giftChaiForStreakDay(GIFT_LADDER_CAP)).toBe(GIFT_LADDER_CAP);
  });

  it("never doubles, which is the whole reason it is linear", () => {
    // Doubling makes day 14 worth 8,192 Chai and breaks the economy in a
    // fortnight, against sinks priced at 10 to 50. Day 14, day 100 and day 365
    // are all a week's worth.
    expect(giftChaiForStreakDay(14)).toBe(7);
    expect(giftChaiForStreakDay(100)).toBe(7);
    expect(giftChaiForStreakDay(365)).toBe(7);
  });

  it("treats a caller's nonsense as day 1 rather than as a negative grant", () => {
    // A streak of 0 is a real state (nothing practised yet), and the box is
    // what today's practice is worth. The rest are caller bugs, and a caller
    // bug must never reach grantTokens as a negative or fractional amount.
    expect(giftChaiForStreakDay(0)).toBe(1);
    expect(giftChaiForStreakDay(-5)).toBe(1);
    expect(giftChaiForStreakDay(2.9)).toBe(2);
    expect(giftChaiForStreakDay(Number.NaN)).toBe(1);
    expect(giftChaiForStreakDay(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("the four boxes", () => {
  it("draws small, medium, large and the gold ribbon", () => {
    expect([1, 2].map(giftTierForStreakDay)).toEqual(["small", "small"]);
    expect([3, 4].map(giftTierForStreakDay)).toEqual(["medium", "medium"]);
    expect([5, 6].map(giftTierForStreakDay)).toEqual(["large", "large"]);
    expect(giftTierForStreakDay(7)).toBe("grand");
  });

  it("keeps the grand box for every day past the cap, not just day 7", () => {
    // A learner on day 30 has not fallen back to a small box, which is what a
    // naive lookup table indexed by day would do.
    expect(giftTierForStreakDay(30)).toBe("grand");
  });
});

describe("today's box", () => {
  const base = { streakDays: 4, claimedDayKey: null, todayKey: "2026-09-04" };

  it("names tomorrow's number, which is the mechanic", () => {
    // A gift that says what it becomes is a reason to return; a gift that just
    // pays is a transaction. This is the one line that does the work.
    const gift = dailyGiftFor(base);
    expect(gift.day).toBe(4);
    expect(gift.chai).toBe(4);
    expect(gift.tomorrowChai).toBe(5);
    expect(gift.tier).toBe("medium");
  });

  it("never promises a number the ladder will not honour", () => {
    // "Tomorrow: 8" on day 7 is a promise the cap breaks the next morning, and
    // a gift that lies about what it becomes is worse than one that says
    // nothing. This is the assertion that catches a naive `day + 1`.
    const atCap = dailyGiftFor({ ...base, streakDays: 7 });
    expect(atCap.tomorrowChai).toBe(7);
    const pastCap = dailyGiftFor({ ...base, streakDays: 40 });
    expect(pastCap.tomorrowChai).toBe(7);
  });

  it("reads claimed off the ledger's day key, never off a flag", () => {
    // No device state that can disagree with the ledger, and no way for a
    // reinstall to hand somebody a second box.
    const fresh = dailyGiftFor({ ...base, claimedDayKey: null });
    expect(fresh.claimed).toBe(false);
    expect(fresh.claimable).toBe(true);

    const done = dailyGiftFor({ ...base, claimedDayKey: "2026-09-04" });
    expect(done.claimed).toBe(true);
    expect(done.claimable).toBe(false);
  });

  it("does not stack: yesterday's unopened box is gone, not waiting", () => {
    // ONE BOX, TODAY'S NUMBER, NO BACKLOG. A pile of unopened gifts is a chore.
    // The forfeit is the other half of "the tap is the grant", and it is only
    // fair because the box is offered where practice ENDS as well as on Home.
    const gift = dailyGiftFor({ ...base, claimedDayKey: "2026-09-03" });
    expect(gift.claimed).toBe(false);
    expect(gift.claimable).toBe(true);
    // And it is TODAY's box that is claimable, at today's number, not
    // yesterday's carried forward.
    expect(gift.chai).toBe(4);
  });

  it("resets to day 1 after a break, because it rides the practice streak", () => {
    // Nothing here tracks a ladder of its own, which is exactly why streak
    // repair mends it: paying Chai to restore a streak that left the gift at
    // day 1 would read as a cheat.
    const afterBreak = dailyGiftFor({ ...base, streakDays: 1 });
    expect(afterBreak.chai).toBe(1);
    expect(afterBreak.tier).toBe("small");
    expect(afterBreak.tomorrowChai).toBe(2);
  });
});

describe("the ledger key", () => {
  it("is the local day, unchanged, which is what stops a second tap paying", () => {
    // A NAME FOR AN EXISTING RULE, not a new one: learning.ts already passes
    // localDayKey(now, timezone) as the refId of the earn_streak_day grant, and
    // the ledger's unique index on it is what makes the tap idempotent.
    expect(giftRefId("2026-09-04")).toBe("2026-09-04");
  });
});

describe("the copy", () => {
  it("says the day on the closed box and the amount only once it is open", () => {
    const gift = dailyGiftFor({
      streakDays: 4,
      claimedDayKey: null,
      todayKey: "2026-09-04",
    });
    expect(giftClosedCopy(gift)).toEqual({ title: "Day 4", body: "Tap to open" });
    expect(giftOpenedCopy(gift)).toEqual({
      title: "Day 4",
      amount: "4 Chai",
      tomorrow: "Tomorrow: 5",
    });
  });

  it("stops counting at the cap and says why", () => {
    // "Tomorrow: 7" after "7 Chai" reads as a ladder that has stalled. A week
    // is the habit, and the number was never the point past it.
    const gift = dailyGiftFor({
      streakDays: 9,
      claimedDayKey: null,
      todayKey: "2026-09-04",
    });
    expect(giftOpenedCopy(gift).amount).toBe("7 Chai");
    expect(giftOpenedCopy(gift).tomorrow).toBe("A full week. Same again tomorrow.");
  });

  it("carries no em dash anywhere, on either box", () => {
    // Every string in the product, and these are strings a learner reads.
    for (const day of [1, 4, 7, 30]) {
      const gift = dailyGiftFor({
        streakDays: day,
        claimedDayKey: null,
        todayKey: "2026-09-04",
      });
      const strings = [
        ...Object.values(giftClosedCopy(gift)),
        ...Object.values(giftOpenedCopy(gift)),
      ];
      for (const s of strings) expect(s).not.toContain("—");
    }
  });
});
