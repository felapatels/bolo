import React from 'react';
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
    getGetTokensQueryKey: () => ['/api/tokens'],
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

import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { ApiError } from '@workspace/api-client-react';

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
  mockState.spendCalls = [];
  mockState.spendHandlers = undefined;
  mockState.invalidateQueries = jest.fn();
  mockState.tokens = tokensQuery({
    balance: 12,
    stationPausesEquipped: 1,
    expressMultiplierActiveUntil: null,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Chai wallet sheet content', () => {
  it('renders the verbatim web copy with server token state', () => {
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

    expect(screen.getByText('Chai Wallet')).toBeOnTheScreen();
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('12');
    expect(screen.getByText('Station Pause')).toBeOnTheScreen();
    expect(
      screen.getByText('Covers a missed day so your streak rides on.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('1 of 2 equipped')).toBeOnTheScreen();
    expect(screen.getByText('Equip · 5')).toBeOnTheScreen();
    expect(screen.getByText('Express Multiplier')).toBeOnTheScreen();
    expect(screen.getByText('Double XP for 20 minutes.')).toBeOnTheScreen();
    expect(screen.getByText('Start · 10')).toBeOnTheScreen();
    // No multiplier running: the countdown line is absent.
    expect(screen.queryByTestId('wallet-express-countdown')).toBeNull();
  });

  it('shows a dash while token state has not loaded', () => {
    mockState.tokens = tokensQuery(undefined);
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('-');
  });
});

describe('spending', () => {
  it('posts the exact web payloads for both items', () => {
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

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
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    act(() => {
      mockState.spendHandlers.onError(new (ApiError as any)(409, data));
    });
    expect(screen.getByText(message)).toBeOnTheScreen();
  });

  it('uses the generic line for non-409 failures', () => {
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    act(() => {
      mockState.spendHandlers.onError(new Error('network down'));
    });
    expect(
      screen.getByText('That spend did not go through. Try again in a moment.'),
    ).toBeOnTheScreen();
  });

  it('settle refreshes the tokens query (success and rejection alike)', () => {
    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
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

    render(<ChaiWalletSheet visible onClose={jest.fn()} />);

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

    render(<ChaiWalletSheet visible onClose={jest.fn()} />);
    expect(mockState.invalidateQueries).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5_250);
    });
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/tokens'],
    });
  });
});
