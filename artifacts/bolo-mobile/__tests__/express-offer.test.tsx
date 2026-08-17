import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// The Express Multiplier offer moment (components/ExpressOfferMoment.tsx), the
// mobile twin of web's ExpressOfferMoment. The feature shipped on web with no
// test of its own, so these are the first pins on either platform:
//   1. Offer renders only when the balance covers the cost.
//   2. Short and unknown balances render nothing (never an upsell).
//   3. A running multiplier shows the 2x chip on 'result' and nothing at all
//      on 'celebration'.
//   4. Start posts the exact web payload { item: 'express_multiplier' }.
//   5. Dismissal is a launch-lifetime guard: a fresh mount stays hidden.
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

// The offer imports its spend contract, its 409 copy and its price from the
// wallet, which owns them. All four are stubbed here so these tests drive the
// running/not-running branch directly rather than re-testing wall-clock
// derivation and the spend wrapper (both already pinned by
// chai-wallet.test.tsx) through the whole wallet module graph.
jest.mock('@/components/ChaiWallet', () => ({
  EXPRESS_MULTIPLIER_COST: 10,
  useExpressCountdown: (activeUntil: string | null | undefined) =>
    activeUntil && new Date(activeUntil).getTime() > Date.now()
      ? '19:59'
      : null,
  spendErrorMessage: (error: unknown) =>
    `spend refused: ${String(error)}`,
  useSpendWithNotice: (onNotice: (message: string) => void) => {
    mockState.onNotice = onNotice;
    return {
      isPending: false,
      mutate: (vars: unknown) => mockState.spendCalls.push(vars),
    };
  },
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

import {
  ExpressOfferMoment,
  __resetExpressOfferForTests,
} from '@/components/ExpressOfferMoment';

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

function tokens(
  balance: number | undefined,
  expressMultiplierActiveUntil: string | null = null,
) {
  return tokensQuery(
    balance === undefined
      ? undefined
      : { balance, stationPausesEquipped: 0, expressMultiplierActiveUntil },
  );
}

beforeEach(() => {
  __resetExpressOfferForTests();
  mockState.spendCalls = [];
  mockState.spendHandlers = undefined;
  mockState.invalidateQueries = jest.fn();
  mockState.tokens = tokens(40);
});

test('a balance at or above the cost sees the offer', () => {
  mockState.tokens = tokens(10);
  render(<ExpressOfferMoment surface="result" onNotice={jest.fn()} />);

  expect(screen.getByTestId('express-offer')).toBeTruthy();
  expect(
    screen.getByText('Double your XP for the next 20 minutes? 10 Chai.'),
  ).toBeTruthy();
  expect(screen.getByTestId('express-offer-start')).toBeTruthy();
});

test('a balance below the cost sees nothing at all', () => {
  mockState.tokens = tokens(9);
  render(<ExpressOfferMoment surface="result" onNotice={jest.fn()} />);

  expect(screen.queryByTestId('express-offer')).toBeNull();
  expect(screen.queryByTestId('express-2x-indicator')).toBeNull();
});

test('an unknown balance (query still loading) sees nothing', () => {
  mockState.tokens = tokens(undefined);
  render(<ExpressOfferMoment surface="result" onNotice={jest.fn()} />);

  expect(screen.queryByTestId('express-offer')).toBeNull();
});

test('a running multiplier replaces the offer with the 2x chip on the result surface', () => {
  mockState.tokens = tokens(40, new Date(Date.now() + 600_000).toISOString());
  render(<ExpressOfferMoment surface="result" onNotice={jest.fn()} />);

  expect(screen.getByTestId('express-2x-indicator')).toBeTruthy();
  expect(screen.queryByTestId('express-offer')).toBeNull();
});

test('a running multiplier shows nothing on the celebration surface', () => {
  mockState.tokens = tokens(40, new Date(Date.now() + 600_000).toISOString());
  render(<ExpressOfferMoment surface="celebration" onNotice={jest.fn()} />);

  expect(screen.queryByTestId('express-2x-indicator')).toBeNull();
  expect(screen.queryByTestId('express-offer')).toBeNull();
});

test('Start posts the exact web spend payload', () => {
  render(<ExpressOfferMoment surface="result" onNotice={jest.fn()} />);

  fireEvent.press(screen.getByTestId('express-offer-start'));

  expect(mockState.spendCalls).toEqual([
    { data: { item: 'express_multiplier' } },
  ]);
});

test('one dismissal hides the offer for the rest of the launch', () => {
  const first = render(
    <ExpressOfferMoment surface="result" onNotice={jest.fn()} />,
  );
  fireEvent.press(screen.getByTestId('express-offer-dismiss'));
  expect(screen.queryByTestId('express-offer')).toBeNull();
  first.unmount();

  // A fresh mount reads the same launch-lifetime guard.
  const second = render(
    <ExpressOfferMoment surface="result" onNotice={jest.fn()} />,
  );
  expect(screen.queryByTestId('express-offer')).toBeNull();
  second.unmount();

  // Only the reset (an app restart, in production) brings it back.
  __resetExpressOfferForTests();
  render(<ExpressOfferMoment surface="result" onNotice={jest.fn()} />);
  expect(screen.getByTestId('express-offer')).toBeTruthy();
});
