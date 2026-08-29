/**
 * THE SESSION CHAI PILL (build 21, owner off the flashback's header, two
 * corrections in one breath): "this is the wrong icon for chai" and "if i
 * click on that chai up top it should open my chai wallet slideout".
 *
 * Two pins. The pill draws the kulhad (ChaiGlyph) and no teacup emoji, like
 * every other Chai surface (the glyph census in chai-stall.test.tsx counts
 * it too). And pressing it opens the same ChaiWalletSheet home opens; the
 * pill owns that sheet, so the practice, review and game screens that host
 * the pill get a wallet without each mounting one.
 *
 * The wallet sheet reads the same queries home does, so this borrows the
 * home suites' mock shape for the api client.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChaiPill } from '@/components/SessionStats';
import { STALL_ASSETS } from '@/components/ChaiStall';

const HIDDEN = { includeHiddenElements: true } as const;

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return { useRouter: () => router, router };
});

// The sheet pads its header by the device's top inset; there is no provider
// under test, so hand it a Dynamic Island's numbers.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    isPlus: false,
    isOneLanguage: false,
    plan: 'free',
    chosenLanguage: null,
    features: {},
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticNotify: jest.fn(),
  hapticSelection: jest.fn(),
}));

const settled = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: jest.fn(),
});

jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {},
  useGetTokens: () => settled({ balance: 25 }),
  useGetTokenHistory: () => settled({ entries: [] }),
  useGetStreakRepair: () => settled(null),
  useRepairStreak: () => ({ mutate: jest.fn(), isPending: false }),
  useSpendTokens: () => ({ mutate: jest.fn(), isPending: false }),
  useBuyFirstClass: () => ({ mutate: jest.fn(), isPending: false }),
  useGetProgressSummary: () =>
    settled({ attemptsToday: 3, currentStreakDays: 3, xp: 120, phrasesMastered: 8 }),
  getGetProgressSummaryQueryKey: () => ['progress', 'summary'],
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
  getGetTokensQueryKey: () => ['tokens'],
}));

describe('the session Chai pill', () => {
  it('draws the kulhad, never a teacup', () => {
    render(<ChaiPill />);
    const glyph = screen.getByTestId('session-chai-glyph', HIDDEN);
    expect(glyph.props.source).toBe(STALL_ASSETS.kulhad);
    expect(screen.queryByText('🍵')).toBeNull();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('Chai')).toBeTruthy();
  });

  it('opens the Chai wallet when pressed', () => {
    render(<ChaiPill />);
    expect(screen.queryByText('Chai Wallet')).toBeNull();
    fireEvent.press(screen.getByTestId('session-chai'));
    expect(screen.getByText('Chai Wallet')).toBeTruthy();
  });
});
