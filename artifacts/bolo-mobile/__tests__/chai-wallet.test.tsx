import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 34B: the Chai wallet sheet (components/ChaiWallet.tsx) — a genuinely
// new mobile surface (no prior test exercises the wallet). Contract pins,
// all web-parity (gujarati-coach/src/components/chai-wallet.tsx):
//   1. Verbatim copy: title, balance, item rows, button labels.
//   2. Spend presses POST the exact web payloads (station_pause /
//      express_multiplier).
//   3. The exact 409 copy set surfaces through the house notice pattern
//      (MilestoneToast); unknown failures use the generic line. Success is
//      silent. Settle (either way) refreshes the tokens query.
//   4. Express countdown renders "Express running: mm:ss left" from
//      expressMultiplierActiveUntil (wall-clock), replacing the Start button,
//      and schedules one expiry refetch at expiry+250ms.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

// The sheet header reads the top inset directly (Screen.tsx's rule), so the
// tests supply one the way the journey and tab-bar tests do: a notched phone.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@workspace/api-client-react', () => {
  class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super(`api ${status}`);
      this.status = status;
      this.data = data;
    }
  }
  return {
    ApiError,
    useGetTokens: () => mockState.tokens,
    useGetTokenHistory: () => mockState.history,
    getGetTokensQueryKey: () => ['/api/tokens'],
    getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
    getGetProgressSummaryQueryKey: () => ['/api/progress/summary'],
    useGetStreakRepair: () => mockState.repairOffer,
    useRepairStreak: (opts?: {
      mutation?: {
        onError?: (e: unknown) => void;
        onSuccess?: (r: unknown) => void;
        onSettled?: () => void;
      };
    }) => {
      mockState.repairHandlers = opts?.mutation;
      return {
        isPending: false,
        mutate: (...args: unknown[]) => mockState.repairCalls.push(args),
      };
    },
    useSpendTokens: (opts?: {
      mutation?: {
        onError?: (e: unknown) => void;
        onSettled?: () => void;
      };
    }) => {
      mockState.spendHandlers = opts?.mutation;
      return {
        isPending: false,
        mutate: (vars: unknown) => mockState.spendCalls.push(vars),
      };
    },
    useBuyFirstClass: () => ({ mutate: jest.fn(), isPending: false }),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockState.invalidateQueries }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#ffffff',
    border: '#e2e8f0',
    background: '#f8fafc',
    foreground: '#0f172a',
    mutedForeground: '#64748b',
    primary: '#0d9488',
    primaryForeground: '#ffffff',
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

// The Bazaar button navigates; outside a mounted root layout expo-router
// refuses to route, so the router itself is the mock.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockState.push }),
}));

// The wallet's language row is free-tier only, so the sheet now reads
// entitlements (the real hook throws outside its provider).
jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    isPlus: mockState.isPlus ?? false,
    isOneLanguage: mockState.isOneLanguage ?? false,
    isLoading: false,
  }),
}));

import {
  ChaiWalletSheet,
  ExpressMultiplierRow,
  LanguageInfoOverlay,
  LanguageSignpostRow,
  StationPauseRow,
  StreakRepairRow,
} from '@/components/ChaiWallet';
import { ApiError } from '@workspace/api-client-react';

// The sheet stopped selling. Every spend row it used to carry is stocked on
// the bazaar street instead, so the rows are exercised here on their own,
// mounted exactly as app/(app)/bazaar.tsx mounts them. Their refusals go to
// the caller's notice, which this harness renders as plain text, so every
// copy assertion below is the one the sheet used to satisfy.
function SpendRows() {
  const [notice, setNotice] = React.useState('');
  return (
    <>
      <StationPauseRow onNotice={setNotice} />
      <ExpressMultiplierRow onNotice={setNotice} />
      <Text>{notice}</Text>
    </>
  );
}

// Mend the line left the sheet too, so it is mounted here the way the bazaar
// mounts it: the row asks, the caller renders the notice.
function RepairRow() {
  const [notice, setNotice] = React.useState('');
  return (
    <>
      <StreakRepairRow onNotice={setNotice} />
      <Text>{notice}</Text>
    </>
  );
}

// The signpost and its explainer, wired the way the bazaar wires them: the
// row asks, the caller opens the overlay.
function LanguageRow() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LanguageSignpostRow onInfo={() => setOpen(true)} />
      {open ? <LanguageInfoOverlay onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function tokensQuery(data: unknown) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  mockState.push = jest.fn();
  mockState.isPlus = false;
  mockState.isOneLanguage = false;
  mockState.spendCalls = [];
  mockState.spendHandlers = undefined;
  mockState.repairCalls = [];
  mockState.repairHandlers = undefined;
  // Default: no break to mend, so the row is absent from every other test.
  mockState.repairOffer = tokensQuery({
    eligible: false,
    missedDay: null,
    restoresStreakDays: 0,
    cost: 25,
    balance: 12,
  });
  mockState.invalidateQueries = jest.fn();
  mockState.tokens = tokensQuery({
    balance: 12,
    stationPausesEquipped: 1,
    expressMultiplierActiveUntil: null,
  });
  // Default: a learner who has never earned or spent, so the empty state is
  // what the other sheet tests see.
  mockState.history = tokensQuery({ entries: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Chai wallet sheet content', () => {
  it('renders the verbatim web copy with server token state', () => {
    render(
      <>
        <ChaiWalletSheet visible onClose={jest.fn()} />
        <SpendRows />
      </>,
    );

    expect(screen.getByText('Chai Wallet')).toBeOnTheScreen();
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('12');
    expect(screen.getByText('Station Pause')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Equip it before you need it. The next day you miss is already covered, so your streak is safe.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('1 of 2 equipped')).toBeOnTheScreen();
    expect(screen.getByText('Equip · 10')).toBeOnTheScreen();
    expect(screen.getByText('Express Multiplier')).toBeOnTheScreen();
    expect(screen.getByText('Double XP for 20 minutes.')).toBeOnTheScreen();
    expect(screen.getByText('Start · 10')).toBeOnTheScreen();
    // No multiplier running: the countdown line is absent.
    expect(screen.queryByTestId('wallet-express-countdown')).toBeNull();
  });

  // Build 36 item 3: the balance badge used to set the terracotta kulhad on a
  // 52pt disc filled with the indigo primary — the only plated Chai glyph
  // anywhere. Every other Chai surface (home stat cell, stall band, receipts,
  // journey payouts, web) renders it bare, so the plate is gone and the glyph
  // carries the header on its own size.
  it('renders the balance glyph bare — no coloured disc behind it', () => {
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

    // The glyph is decorative (accessibility-hidden), which RNTL skips by
    // default.
    const glyph = screen.getByTestId('wallet-balance-glyph', {
      includeHiddenElements: true,
    });
    const glyphStyle = StyleSheet.flatten(glyph.props.style);
    expect(glyphStyle.width).toBe(40);
    expect(glyphStyle.height).toBe(40);

    // Nothing paints a plate under it: the glyph sits straight in the balance
    // row, which carries no background of its own.
    const parentStyle = StyleSheet.flatten(glyph.parent?.props.style) ?? {};
    expect(parentStyle.backgroundColor).toBeUndefined();
    expect(parentStyle.borderRadius).toBeUndefined();
  });

  it('shows a dash while token state has not loaded', () => {
    mockState.tokens = tokensQuery(undefined);
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('-');
  });
});

describe('spending', () => {
  it('posts the exact web payloads for both items', () => {
    render(<SpendRows />);

    fireEvent.press(screen.getByTestId('wallet-equip-pause'));
    fireEvent.press(screen.getByTestId('wallet-start-express'));

    expect(mockState.spendCalls).toEqual([
      { data: { item: 'station_pause' } },
      { data: { item: 'express_multiplier' } },
    ]);
  });

  it.each([
    [
      'insufficient_tokens',
      { error: 'insufficient_tokens', balance: 3, cost: 10 },
      'Not enough Chai yet. You have 3, this costs 10. Keep riding to earn more.',
    ],
    [
      'pause_max_equipped',
      { error: 'pause_max_equipped' },
      'You already have 2 pauses equipped. That is the maximum.',
    ],
    [
      'multiplier_active',
      { error: 'multiplier_active' },
      'An Express Multiplier is already running.',
    ],
  ])('surfaces the exact 409 copy for %s', (_key, data, message) => {
    render(<SpendRows />);
    act(() => {
      mockState.spendHandlers.onError(new (ApiError as any)(409, data));
    });
    expect(screen.getByText(message)).toBeOnTheScreen();
  });

  it('uses the generic line for non-409 failures', () => {
    render(<SpendRows />);
    act(() => {
      mockState.spendHandlers.onError(new Error('network down'));
    });
    expect(
      screen.getByText('That spend did not go through. Try again in a moment.'),
    ).toBeOnTheScreen();
  });

  it('settle refreshes the tokens query (success and rejection alike)', () => {
    render(<SpendRows />);
    act(() => {
      mockState.spendHandlers.onSettled();
    });
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/tokens'],
    });
  });
});

describe('express countdown', () => {
  it('renders mm:ss from the wall clock and replaces the Start button', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    mockState.tokens = tokensQuery({
      balance: 12,
      stationPausesEquipped: 0,
      // 90 seconds from "now" → 01:30.
      expressMultiplierActiveUntil: '2026-08-03T12:01:30.000Z',
    });

    render(<SpendRows />);

    expect(screen.getByTestId('wallet-express-countdown')).toHaveTextContent(
      'Express running: 01:30 left',
    );
    expect(screen.queryByTestId('wallet-start-express')).toBeNull();
  });

  it('schedules one tokens refetch just past expiry', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    mockState.tokens = tokensQuery({
      balance: 12,
      stationPausesEquipped: 0,
      expressMultiplierActiveUntil: '2026-08-03T12:00:05.000Z',
    });

    render(<SpendRows />);
    expect(mockState.invalidateQueries).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5_250);
    });
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/tokens'],
    });
  });

  // Build 37: the Bazaar row's worded "Browse" link became a real button,
  // matching the other rows; it still closes the sheet on the way out.
  it('opens the wardrobe from a real Browse button', () => {
    const onClose = jest.fn();
    render(<ChaiWalletSheet visible onClose={onClose} />);

    const browse = screen.getByTestId('wallet-open-wardrobe');
    // INVERTED build 22 (the owner's wallet mockup): the button reads
    // "Browse Bazaar", the street's own name.
    expect(browse).toHaveTextContent('Browse Bazaar');
    // Bolo is female; the row copy must not call her a boy.
    expect(
      screen.getByText('Fits, boosts and streak savers.'),
    ).toBeOnTheScreen();

    fireEvent.press(browse);
    expect(onClose).toHaveBeenCalled();
    expect(mockState.push).toHaveBeenCalledWith('/(app)/bazaar');
  });

  // Build 37: Chai also buys stops beyond Hindi — but only a free learner
  // needs telling, so the row is free-tier only and explains itself in place.
  it('offers the language row to free learners and explains it', () => {
    render(<LanguageRow />);

    expect(screen.getByTestId('wallet-language-row')).toBeOnTheScreen();
    expect(screen.queryByTestId('wallet-language-info-dialog')).toBeNull();

    fireEvent.press(screen.getByTestId('wallet-language-info'));
    expect(
      screen.getByText('Unlock a language with Chai'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'You can use Chai to unlock additional non-Hindi stops. Open the journey for a locked language and spend your Chai on a stop to ride it.',
      ),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('wallet-language-info-close'));
    expect(screen.queryByTestId('wallet-language-info-dialog')).toBeNull();
  });

  it('hides the language row once a plan is paid for', () => {
    mockState.isPlus = true;
    render(<LanguageRow />);

    expect(screen.queryByTestId('wallet-language-row')).toBeNull();
  });

  // The sheet is a balance and a door. Everything it used to sell is stocked
  // on the bazaar street, and selling the same thing on two surfaces is how
  // the two drift apart, so the strip is pinned rather than left to habit.
  it('sells nothing itself: no spend rows in the sheet', () => {
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

    expect(screen.getByTestId('wallet-balance-band')).toBeOnTheScreen();
    expect(screen.getByTestId('wallet-open-wardrobe')).toBeOnTheScreen();
    expect(screen.queryByTestId('wallet-equip-pause')).toBeNull();
    expect(screen.queryByTestId('wallet-start-express')).toBeNull();
    expect(screen.queryByTestId('wallet-first-class-row')).toBeNull();
    expect(screen.queryByTestId('wallet-language-row')).toBeNull();
  });
});

// Streak repair, web-parity (gujarati-coach chai-wallet.test.tsx). The row is
// a conditional offer, not a permanent shelf item: on a day nothing is broken
// there must be nothing to see, because a greyed "mend your streak" button on
// an unbroken streak is a small daily reproach.
describe('streak repair row', () => {
  const eligible = {
    data: {
      eligible: true,
      missedDay: '2026-08-04', // a Tuesday
      restoresStreakDays: 9,
      cost: 25,
      balance: 40,
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  };

  it('shows nothing at all when there is no break to mend', () => {
    render(<RepairRow />);

    expect(screen.queryByTestId('wallet-streak-repair')).toBeNull();
    expect(screen.queryByText('Mend the line')).toBeNull();
  });

  it('names the day, the streak it restores, and the server price', () => {
    mockState.repairOffer = eligible;
    render(<RepairRow />);

    expect(screen.getByTestId('wallet-streak-repair')).toBeOnTheScreen();
    expect(screen.getByText('Mend the line')).toBeOnTheScreen();
    // Warm, never shaming: the day is named, the learner is not blamed.
    expect(
      screen.getByText(
        'Tuesday got away from you. Cover it and your 9-day streak rides on.',
      ),
    ).toBeOnTheScreen();
    // Price comes from the payload, never from a client constant.
    expect(screen.getByText('Mend · 25')).toBeOnTheScreen();
  });

  it('mends with an empty request — the client never names the day', () => {
    mockState.repairOffer = eligible;
    render(<RepairRow />);

    fireEvent.press(screen.getByTestId('wallet-repair-streak'));
    expect(mockState.repairCalls).toHaveLength(1);
    // No arguments: the server picks the day it is willing to sell.
    expect(mockState.repairCalls[0]).toEqual([]);
  });

  it('surfaces the 409 refusals in the Chai copy register, never a paywall', () => {
    mockState.repairOffer = eligible;
    render(<RepairRow />);

    act(() => {
      mockState.repairHandlers?.onError?.(
        new ApiError(409, {
          error: 'insufficient_tokens',
          balance: 3,
          cost: 25,
        }),
      );
    });
    expect(
      screen.getByText(
        'Not enough Chai to mend. You have 3, mending costs 25. Keep practicing to earn more.',
      ),
    ).toBeOnTheScreen();
  });

  it('confirms the mend and refreshes token, offer, and progress state', () => {
    mockState.repairOffer = eligible;
    render(<RepairRow />);

    act(() => {
      mockState.repairHandlers?.onSuccess?.({
        balance: 15,
        repairedDay: '2026-08-04',
        restoredStreakDays: 9,
        charged: true,
        cost: 25,
      });
      mockState.repairHandlers?.onSettled?.();
    });

    expect(
      screen.getByText('Tuesday is covered. Your 9-day streak rides on.'),
    ).toBeOnTheScreen();
    // The streak is derived server-side, so the surfaces showing it re-ask.
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/tokens'],
    });
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/tokens/streak-repair'],
    });
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/progress/summary'],
    });
  });
});

// Chai history. The label is the server's word for the row: the raw ledger
// reason never reaches a client, so there is nothing to translate here and
// nothing that can drift from web.
describe('Chai history', () => {
  it('lists the movements the server labelled, signed', () => {
    mockState.history = tokensQuery({
      entries: [
        {
          id: 3,
          delta: -25,
          label: 'First Class',
          createdAt: '2026-08-15T10:00:00.000Z',
        },
        {
          id: 2,
          delta: 5,
          label: 'Streak day',
          createdAt: '2026-08-14T10:00:00.000Z',
        },
      ],
    });
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

    expect(screen.getByTestId('wallet-history-list')).toBeOnTheScreen();
    expect(screen.getByText('Streak day')).toBeOnTheScreen();
    expect(screen.getByText('First Class')).toBeOnTheScreen();
    // An earn reads +N; a spend keeps its own minus sign.
    expect(screen.getByText('+5')).toBeOnTheScreen();
    expect(screen.getByText('-25')).toBeOnTheScreen();
    expect(screen.getAllByTestId('wallet-history-entry')).toHaveLength(2);
    // The empty frame is gone once there is anything to show.
    expect(screen.queryByTestId('wallet-history-placeholder')).toBeNull();
  });

  it('THE EMPTY STATE IS A LIST, not a row that looks tappable', () => {
    // It used to borrow the SPEND row's shape, an icon tile beside a title and
    // a body, which is the silhouette of every buyable item above it. The
    // owner read it as a button that would not respond. Same frame and heading
    // as the populated list now, with one muted row. 2026-08-19.
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

    expect(screen.getByTestId('wallet-history-placeholder')).toBeOnTheScreen();
    expect(screen.getByText('Chai history')).toBeOnTheScreen();
    expect(
      screen.getByText('Cups you earn and buy will appear here.'),
    ).toBeOnTheScreen();
    // It is not a promise of a feature any more, so the marker is gone.
    expect(screen.queryByText('SOON')).toBeNull();
    expect(screen.queryByTestId('wallet-history-list')).toBeNull();
  });

  // A wallet that flashes a skeleton or an apology where its history goes is
  // worse than one that shows the rest of itself and stays quiet.
  it('renders nothing while loading, and nothing on failure', () => {
    mockState.history = {
      ...tokensQuery(undefined),
      isLoading: true,
    };
    const loading = render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    expect(screen.queryByTestId('wallet-history-list')).toBeNull();
    expect(screen.queryByTestId('wallet-history-placeholder')).toBeNull();
    // The rest of the sheet is untouched.
    expect(screen.getByTestId('wallet-balance-band')).toBeOnTheScreen();
    loading.unmount();

    mockState.history = { ...tokensQuery(undefined), isError: true };
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    expect(screen.queryByTestId('wallet-history-list')).toBeNull();
    expect(screen.queryByTestId('wallet-history-placeholder')).toBeNull();
    expect(screen.getByTestId('wallet-balance-band')).toBeOnTheScreen();
  });
});
