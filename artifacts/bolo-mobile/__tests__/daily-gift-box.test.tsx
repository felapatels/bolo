import React from 'react';
import { Animated } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// THE DAILY GIFT BOX, on the phone.
//
// The ladder, the tiers and the copy are pure and already pinned by 15 tests in
// gujarati-coach's daily-gift.test.ts. None of that is repeated. What this file
// covers is the five things only the SCREEN can get wrong, and every one of
// them is silent:
//
//  1. drawing a box on a day there is nothing to open, which invites a tap that
//     the server will refuse;
//  2. letting a claimed box be tapped again, which is a second grant attempt on
//     every render;
//  3. promising "Tomorrow: 8" at the cap, which the ladder breaks by morning;
//  4. running the wobble when there is nothing to wobble. RN Animated is REAL
//     under jest and an ungated loop on the home screen hung a suite once
//     already (see AttentionPulse's own comment). The gate is the fix and this
//     is the test that holds it;
//  5. reduced motion losing the words along with the movement.
// ---------------------------------------------------------------------------

const h: Record<string, any> = {};

// SPREAD THE SHARED BASE FIRST, so this file's own stubs win and so the NEXT
// hook the card grows costs this file nothing. This mock used to name its four
// exports by hand, which is why adding `useGetTokens` broke all fifteen tests
// here at import time with "useGetTokens is not a function": the same bill
// CLAUDE.md records as costing thirty-two suites three lines each, and the
// trigger it names for building the base. See __tests__/helpers/apiClientMock.
jest.mock('@workspace/api-client-react', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...require('./helpers/apiClientMock').baseApiClientMock(),
  useGetDailyGift: () => ({ data: h.gift, isLoading: false, isError: false }),
  useClaimDailyGift: () => ({ mutate: h.claim, isPending: h.pending }),
  useGetTokens: () => ({ data: { balance: h.balance }, isLoading: false }),
  getGetDailyGiftQueryKey: () => ['daily-gift'],
  getGetTokensQueryKey: () => ['tokens'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => h.reduceMotion,
}));

jest.mock('@/lib/haptics', () => ({ hapticMedium: jest.fn() }));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
}));

// THE ENTITLEMENTS CONTEXT, mocked here and NOT given a provider, because the
// gift card reads `isPlus` to decide between a distance meter and a shop door.
// One file's mock rather than a provider in every home suite: this is the same
// bill CLAUDE.md records as costing mobile ninety-six lines across thirty-two
// files when two hooks landed, and the cheapest time to keep it to one file is
// the first time it arrives.
jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: false, isLoading: false, dailyNewLessons: 3 }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Imported after the mocks.
import { DailyGiftCard } from '@/components/DailyGiftCard';
import { DailyGiftBox, GIFT_LID_LIFT } from '@/components/DailyGiftBox';
import { GIFT_LADDER_CAP } from '@workspace/daily-gift';

function giftState(over: Record<string, unknown> = {}) {
  return {
    day: 4,
    chai: 4,
    tier: 'medium',
    tomorrowChai: 5,
    claimed: false,
    claimable: true,
    streakDays: 4,
    earnedToday: true,
    localDay: '2026-09-04',
    balance: 12,
    ...over,
  };
}

beforeEach(() => {
  h.gift = giftState();
  h.claim = jest.fn();
  h.pending = false;
  h.reduceMotion = false;
});

describe('the card decides whether there is a box at all', () => {
  it('draws nothing before the query answers', () => {
    h.gift = undefined;
    render(<DailyGiftCard />);
    expect(screen.queryByTestId('daily-gift-box')).toBeNull();
  });

  it('draws nothing on a day with no practice in it', () => {
    // NOT AN EMPTY STATE AND NOT A NAG. A "practise first" placeholder at the
    // top of home every morning is a worse screen than an empty one, and the
    // end-of-practice placement catches the learner the moment the day is
    // earned anyway.
    h.gift = giftState({ earnedToday: false, claimable: false });
    render(<DailyGiftCard />);
    expect(screen.queryByTestId('daily-gift-box')).toBeNull();
  });

  it('keeps an opened box up for the rest of the day', () => {
    // The number it names for tomorrow is the reason to come back, so the box
    // does not vanish the moment it is opened.
    h.gift = giftState({ claimed: true, claimable: false, earnedToday: true });
    render(<DailyGiftCard />);
    expect(screen.getByTestId('daily-gift-box')).toBeOnTheScreen();
  });
});

describe('the closed box', () => {
  it('offers the distance the Chai is for, not a second copy of the day', () => {
    // INVERTED 2026-09-08 with the owner's redesign. This asserted "Day 4" and
    // "Tap to open" as ROW text. Both moved: the day is now written ON the box
    // itself ("write directly on it, Day 4 Gift"), and the row carries the one
    // thing that gives the Chai a reason. His framing: "a spin with nothing to
    // spend it on is a number going up on its own."
    render(<DailyGiftCard />);
    expect(screen.getByTestId('daily-gift-box-remain')).toBeOnTheScreen();
    expect(screen.getByTestId('daily-gift-box-count')).toBeOnTheScreen();
    // And the amount is still not printed on the unopened box: it is what the
    // tap BUYS, and naming it first is the near-miss shape by another route.
    expect(screen.queryByText('4 Chai')).toBeNull();
  });

  it('claims when tapped, because the tap IS the grant', () => {
    render(<DailyGiftCard />);
    fireEvent.press(screen.getByTestId('daily-gift-box'));
    expect(h.claim).toHaveBeenCalledTimes(1);
  });

  it('cannot be tapped twice: a claimed box is disabled', () => {
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    fireEvent.press(screen.getByTestId('daily-gift-box'));
    expect(h.claim).not.toHaveBeenCalled();
  });
});

describe('the opened box', () => {
  it('shows the amount, and no longer promises tomorrow', () => {
    // INVERTED 2026-09-08. Two tests lived here, "reads Day 4, 4 Chai,
    // Tomorrow 5" and "never promises an eighth day", and BOTH pinned a line
    // the owner cut: "get rid of tomorrow 5 to 25". They are replaced rather
    // than deleted, because the thing worth keeping is the assertion that the
    // box does not make a promise about tomorrow AT ALL, which is now true by
    // absence instead of by careful wording at the cap.
    h.gift = giftState({ claimed: true, claimable: false, chai: 4 });
    render(<DailyGiftCard />);
    expect(screen.getByTestId('daily-gift-box-sum')).toBeOnTheScreen();
    expect(screen.queryByTestId('daily-gift-box-tomorrow')).toBeNull();
    expect(screen.queryByText(/Tomorrow/)).toBeNull();
  });
  it('grows with the streak', () => {
    // The tier is a picture of how long the learner kept it up, and it is read
    // by SIZE. A learner who cannot separate the colours still sees four
    // different boxes.
    //
    // RESTORED 2026-09-08 after being swallowed by a careless replacement of
    // the two tests either side of it. It reads the svg's own width now rather
    // than a wrapper's style, because the redesign draws the box as one svg
    // sized to its art. The guard itself is unchanged and it is the owner's
    // accessibility requirement, not a nicety.
    const widths = (['small', 'medium', 'large', 'grand'] as const).map((tier) => {
      const { unmount } = render(
        <DailyGiftBox
          day={1}
          chai={1}
          tier={tier}
          claimed={false}
          claimable
          onClaim={jest.fn()}
        />,
      );
      const frame = screen.getByTestId('gift-box-frame');
      const width = Number(frame.props.width);
      unmount();
      return width;
    });
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    }
  });
});

describe('the wobble is gated, which is the part that costs a suite when it is not', () => {
  it('does not start a loop when there is no box to wobble', () => {
    const loop = jest.spyOn(Animated, 'loop');
    h.gift = giftState({ earnedToday: false, claimable: false });
    render(<DailyGiftCard />);
    expect(loop).not.toHaveBeenCalled();
    loop.mockRestore();
  });

  it('does not start a loop for a box that is already open', () => {
    const loop = jest.spyOn(Animated, 'loop');
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    expect(loop).not.toHaveBeenCalled();
    loop.mockRestore();
  });

  it('runs only while there is an unclaimed box in front of the learner', () => {
    const loop = jest.spyOn(Animated, 'loop');
    render(<DailyGiftCard />);
    expect(loop).toHaveBeenCalledTimes(1);
    loop.mockRestore();
  });

  it('stops when the box leaves the screen', () => {
    // Torn down on unmount, or a home screen that navigates away leaves a
    // timer ticking against a tree that is gone.
    const stop = jest.fn();
    const loop = jest
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() } as never);
    const { unmount } = render(<DailyGiftCard />);
    act(() => unmount());
    expect(stop).toHaveBeenCalled();
    loop.mockRestore();
  });
});

describe('reduced motion', () => {
  it('just opens: no wobble, and not one word fewer', () => {
    h.reduceMotion = true;
    h.gift = giftState({ claimed: true, claimable: false });
    const loop = jest.spyOn(Animated, 'loop');
    render(<DailyGiftCard />);
    expect(loop).not.toHaveBeenCalled();
    // The information is the point; the movement never was. The tomorrow line
    // is gone on the owner's instruction, so what is pinned now is that the
    // OPENED state still says what was drawn without any motion to say it.
    expect(screen.getByTestId('daily-gift-box-sum')).toBeOnTheScreen();
    expect(screen.getByTestId('daily-gift-box-remain')).toBeOnTheScreen();
    loop.mockRestore();
  });

  it('lands the lid on its open frame rather than animating it there', () => {
    h.reduceMotion = true;
    render(
      <DailyGiftBox
        day={4}
        chai={4}
        tier="medium"
        tomorrowChai={5}
        claimed
        claimable={false}
        onClaim={jest.fn()}
        reduceMotion
      />,
    );
    // INVERTED 2026-09-08. There is no lid to land: the opened state REPLACES
    // the box with the fare panel rather than opening it in place, which is the
    // owner's "expand if needed after clicking the gift box". The constant
    // survives as the panel's entry rise, and what is pinned is that reduced
    // motion still reaches the opened content with no animation at all.
    expect(GIFT_LID_LIFT).toBeGreaterThan(0);
    expect(screen.getByTestId('daily-gift-box-sum')).toBeOnTheScreen();
  });
});
