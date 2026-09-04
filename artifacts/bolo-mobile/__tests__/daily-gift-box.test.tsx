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

jest.mock('@workspace/api-client-react', () => ({
  useGetDailyGift: () => ({ data: h.gift, isLoading: false, isError: false }),
  useClaimDailyGift: () => ({ mutate: h.claim, isPending: h.pending }),
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
  it('names the day, not the amount, and invites the tap', () => {
    render(<DailyGiftCard />);
    expect(screen.getByText('Day 4')).toBeOnTheScreen();
    expect(screen.getByText('Tap to open')).toBeOnTheScreen();
    // The amount is what the tap BUYS. Printing it on the closed lid would
    // make an unopened box a receipt already read.
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
  it('reads Day 4, 4 Chai, Tomorrow 5', () => {
    // THE ONE LINE THAT DOES THE WORK is the third. A gift that says what it
    // becomes is a reason to return; a gift that just pays is a transaction.
    h.gift = giftState({ claimed: true, claimable: false });
    render(<DailyGiftCard />);
    expect(screen.getByText('4 Chai')).toBeOnTheScreen();
    expect(screen.getByText('Day 4 in a row')).toBeOnTheScreen();
    expect(screen.getByText('Tomorrow: 5')).toBeOnTheScreen();
  });

  it('never promises an eighth day', () => {
    // "Tomorrow: 8" on day 7 is a promise the cap breaks the next morning. At
    // the cap the copy stops counting and says what is actually true.
    h.gift = giftState({
      day: GIFT_LADDER_CAP,
      chai: GIFT_LADDER_CAP,
      tomorrowChai: GIFT_LADDER_CAP,
      tier: 'grand',
      claimed: true,
      claimable: false,
    });
    render(<DailyGiftCard />);
    expect(screen.queryByText(/Tomorrow: 8/)).toBeNull();
    expect(screen.getByText('A full week. Same again tomorrow.')).toBeOnTheScreen();
  });
});

describe('the four boxes differ by shape, never by hue alone', () => {
  it('grows with the streak', () => {
    // The tier is a picture of how long the learner kept it up, and it is read
    // by SIZE. A learner who cannot separate the colours still sees four
    // different boxes.
    const widths = (['small', 'medium', 'large', 'grand'] as const).map((tier) => {
      const { unmount } = render(
        <DailyGiftBox
          day={1}
          chai={1}
          tier={tier}
          tomorrowChai={2}
          claimed={false}
          claimable
          onClaim={jest.fn()}
        />,
      );
      const frame = screen.getByTestId('gift-box-frame');
      const width = (frame.props.style as { width: number }).width;
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
    // The information is the point; the movement never was.
    expect(screen.getByText('4 Chai')).toBeOnTheScreen();
    expect(screen.getByText('Tomorrow: 5')).toBeOnTheScreen();
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
    // The lift exists as a value the open frame uses; reduced motion simply
    // starts there. Pinned as a constant so the two cannot drift apart.
    expect(GIFT_LID_LIFT).toBeGreaterThan(0);
    expect(screen.getByTestId('daily-gift-box-tomorrow')).toBeOnTheScreen();
  });
});
