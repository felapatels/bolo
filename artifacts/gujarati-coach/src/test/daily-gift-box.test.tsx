import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// THE DAILY GIFT BOX, on the web. Twin of bolo-mobile's daily-gift-box.test.tsx,
// same cases in the same order, because the two boxes are hand-maintained twins
// and a case only one side runs is a case the other can lose quietly.
//
// The ladder, the tiers and the copy are pure and already pinned by 15 tests in
// daily-gift.test.ts. None of that is repeated. What this file covers is what
// only the SCREEN can get wrong, and every one of them is silent:
//
//  1. drawing a box on a day there is nothing to open, which invites a click
//     the server will refuse;
//  2. letting a claimed box be clicked again, which is a second grant attempt;
//  3. promising "Tomorrow: 8" at the cap, which the ladder breaks by morning;
//  4. wobbling when there is nothing to wobble. On the phone that gate is load
//     bearing (an ungated RN Animated loop hung a home suite once); here it is
//     only correctness, and it is pinned on both sides so the two cannot
//     disagree about when a box is waiting;
//  5. reduced motion losing the words along with the movement, which here is
//     the global prefers-reduced-motion rule's job and is why the OPEN frame
//     must carry every word on its own.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  gift: undefined as unknown,
  claim: vi.fn(),
  pending: false,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetDailyGift: () => ({ data: h.gift, isLoading: false, isError: false }),
  useClaimDailyGift: () => ({ mutate: h.claim, isPending: h.pending }),
  getGetDailyGiftQueryKey: () => ["daily-gift"],
  getGetTokensQueryKey: () => ["tokens"],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/haptics", () => ({ webHaptic: vi.fn() }));

// NO ENTITLEMENTS MOCK, DELIBERATELY. The card read useEntitlements for one
// boolean and that reaches Clerk's useUser, which throws outside a
// ClerkProvider: it broke every suite that renders the practice page, because
// the gift is offered where practice ENDS as well as on home. The dependency
// was removed rather than mocked. All-Access is derived from the payload's own
// `multiplier`, which this card already fetches.

vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));

// Imported after the mocks.
import { DailyGiftBox, DailyGiftCard, GIFT_TIER_SIZE } from "@/components/daily-gift";
import { GIFT_LADDER_CAP } from "@workspace/daily-gift";

function giftState(over: Record<string, unknown> = {}) {
  return {
    day: 4,
    chai: 4,
    tier: "medium",
    tomorrowChai: 5,
    claimed: false,
    claimable: true,
    streakDays: 4,
    earnedToday: true,
    localDay: "2026-09-04",
    balance: 12,
    ...over,
  };
}

beforeEach(() => {
  h.gift = giftState();
  h.claim = vi.fn();
  h.pending = false;
});

describe("the card decides whether there is a box at all", () => {
  test("draws nothing before the query answers", () => {
    h.gift = undefined;
    render(<DailyGiftCard />);
    expect(screen.queryByTestId("daily-gift-box")).toBeNull();
  });

  test("draws nothing on a day with no practice in it", () => {
    // NOT AN EMPTY STATE AND NOT A NAG. A "practise first" placeholder at the
    // top of home every morning is a worse screen than an empty one, and the
    // end-of-practice placement catches the learner the moment the day is
    // earned anyway.
    h.gift = giftState({ earnedToday: false, claimable: false });
    render(<DailyGiftCard />);
    expect(screen.queryByTestId("daily-gift-box")).toBeNull();
  });

  test("keeps an opened box up for the rest of the day", () => {
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    expect(screen.getByTestId("daily-gift-box")).toBeInTheDocument();
  });
});

describe("the closed box", () => {
  test("offers the distance the Chai is for, not a second copy of the day", () => {
    // INVERTED 2026-09-08 with the owner's redesign. This asserted "Day 4" and
    // "Tap to open" as ROW text. Both moved: the day is now written ON the box
    // itself ("write directly on it, Day 4 Gift"), and the row carries the one
    // thing that gives the Chai a reason. His framing: "a spin with nothing to
    // spend it on is a number going up on its own."
    render(<DailyGiftCard />);
    expect(screen.getByTestId("daily-gift-box-remain")).toBeInTheDocument();
    expect(screen.getByTestId("daily-gift-box-count")).toBeInTheDocument();
    // And the amount is still not printed on the unopened box: it is what the
    // click BUYS, and naming it first is the near-miss shape by another route.
    expect(screen.queryByText("4 Chai")).toBeNull();
  });

  test("claims when clicked, because the click IS the grant", () => {
    render(<DailyGiftCard />);
    fireEvent.click(screen.getByTestId("daily-gift-box"));
    expect(h.claim).toHaveBeenCalledTimes(1);
  });

  test("cannot be clicked twice: an opened box is not a button at all", () => {
    // INVERTED 2026-09-08. It used to be one button in both states, disabled
    // once claimed. The opened state is now a panel with its own actions, so
    // there is no second grant to guard against: the thing that was disabled
    // no longer exists. Pinned as the stronger property, because a control
    // that is absent cannot be re-enabled by an accident of styling.
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    const box = screen.getByTestId("daily-gift-box");
    expect(box.tagName).not.toBe("BUTTON");
    fireEvent.click(box);
    expect(h.claim).not.toHaveBeenCalled();
  });
});

describe("the opened box", () => {
  test("shows the amount, and no longer promises tomorrow", () => {
    // INVERTED 2026-09-08. Two tests lived here, "reads Day 4, 4 Chai,
    // Tomorrow 5" and "never promises an eighth day", and BOTH pinned a line
    // the owner cut: "get rid of tomorrow 5 to 25". They are replaced rather
    // than deleted, because the thing worth keeping is that the box does not
    // make a promise about tomorrow AT ALL, which is now true by absence
    // instead of by careful wording at the cap.
    h.gift = giftState({ claimed: true, claimable: false, chai: 4 });
    render(<DailyGiftCard />);
    expect(screen.getByTestId("daily-gift-box-sum")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-gift-box-tomorrow")).toBeNull();
    expect(screen.queryByText(/Tomorrow/)).toBeNull();
  });

  test("the opened panel replaces the box rather than opening it in place", () => {
    // INVERTED 2026-09-08. There is no lid to lift: the opened state is the
    // fare panel, which is the owner's "expand if needed after clicking the
    // gift box". What is pinned now is that opening reaches the fare content
    // and leaves no half-open box behind it.
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    expect(screen.queryByTestId("gift-box-lid")).toBeNull();
    expect(screen.getByTestId("daily-gift-box-sum")).toBeInTheDocument();
  });
});

describe("the four boxes differ by shape, never by hue alone", () => {
  test("grow with the streak", () => {
    // The tier is a picture of how long the learner kept it up, and it is read
    // by SIZE. A learner who cannot separate the colours still sees four
    // different boxes. The mobile twin pins the same ordering.
    const widths = (["small", "medium", "large", "grand"] as const).map((tier) => {
      const { unmount } = render(
        <DailyGiftBox
          day={1}
          chai={1}
          tier={tier}
          tomorrowChai={2}
          claimed={false}
          claimable
          onClaim={vi.fn()}
        />,
      );
      const frame = screen.getByTestId("gift-box-frame");
      // The art is ONE svg sized to itself now, rather than a wrapper div with
      // a style width, so the tier is read off the svg's own attribute. The
      // guard is unchanged and it is the owner's colour-blind requirement: the
      // four boxes must be tellable apart by SIZE, never by hue.
      const width = Number.parseInt(frame.getAttribute("width") ?? "", 10);
      unmount();
      return width;
    });
    expect(widths).toEqual([
      GIFT_TIER_SIZE.small,
      GIFT_TIER_SIZE.medium,
      GIFT_TIER_SIZE.large,
      GIFT_TIER_SIZE.grand,
    ]);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    }
  });
});

describe("the wobble is gated", () => {
  test("wobbles while there is an unclaimed box in front of the learner", () => {
    render(<DailyGiftCard />);
    expect(
      screen.getByTestId("daily-gift-box").querySelector(".animate-gift-wobble"),
    ).not.toBeNull();
  });

  test("stops the moment the box is opened", () => {
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    expect(
      screen.getByTestId("daily-gift-box").querySelector(".animate-gift-wobble"),
    ).toBeNull();
  });

  test("does not wobble a box that cannot be opened", () => {
    // Mid-claim, the box is neither closed-and-waiting nor open. It must not
    // keep nudging for a tap that is already in flight.
    h.pending = true;
    render(<DailyGiftCard />);
    expect(
      screen.getByTestId("daily-gift-box").querySelector(".animate-gift-wobble"),
    ).toBeNull();
  });
});
