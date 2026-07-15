/**
 * Verifies the three critical correctness properties of TourBootstrapper:
 *
 *  1. Tour auto-opens for first-time users (hasCompletedTour === false).
 *  2. Tour stays closed for returning users (hasCompletedTour === true).
 *  3. Completing or skipping the tour persists the flag via
 *     useUpdateAccountPreferences({ data: { hasCompletedTour: true } }).
 *
 * TourProvider + TourBootstrapper are exercised through the real
 * implementations in TourContext.tsx / _layout.tsx. GuidedTour is replaced by
 * a lightweight probe component that exposes skip/next buttons and renders
 * testID="tour-overlay" only when the tour is open — this is what the tests
 * query to assert open/closed state.
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react-native';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockState = {
  /** null = account data still loading (no data returned yet) */
  hasCompletedTour: false as boolean | null,
  mutateAsync: jest.fn<Promise<void>, [unknown]>(),
};

// ─── external module mocks ───────────────────────────────────────────────────

jest.mock('@workspace/api-client-react', () => ({
  setAuthTokenGetter: jest.fn(),
  useGetAccount: () => ({
    data:
      mockState.hasCompletedTour === null
        ? undefined
        : {
            preferences: {
              learning: { hasCompletedTour: mockState.hasCompletedTour },
            },
          },
  }),
  useUpdateAccountPreferences: () => ({
    mutateAsync: mockState.mutateAsync,
  }),
}));

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Redirect: () => null,
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, null, children),
      { Screen: () => null },
    ),
  };
});

// Pass-through wrappers — we care about TourProvider / TourBootstrapper, not
// the inner providers.
jest.mock('@/contexts/EntitlementsContext', () => ({
  EntitlementsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/contexts/PurchasesContext', () => ({
  PurchasesProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/contexts/LanguageContext', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/ReminderScheduler', () => ({
  ReminderScheduler: () => null,
}));

// GuidedTour probe: reads from the real TourContext so we observe what
// TourBootstrapper actually did to the shared context state.
jest.mock('@/components/GuidedTour', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  // Import the real TourContext — NOT mocked.
  const { useTour } = require('@/contexts/TourContext');
  return {
    GuidedTour: () => {
      const { isOpen, skip, goNext } = useTour();
      if (!isOpen) return null;
      return React.createElement(
        View,
        { testID: 'tour-overlay' },
        React.createElement(
          TouchableOpacity,
          { testID: 'skip-tour', onPress: skip },
          React.createElement(Text, null, 'Skip'),
        ),
        React.createElement(
          TouchableOpacity,
          { testID: 'next-tour', onPress: goNext },
          React.createElement(Text, null, 'Next'),
        ),
      );
    },
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
  }),
}));

// Imported after all mocks are declared so jest's module registry sees the
// mocked versions of every dependency.
import AppLayout from '../app/(app)/_layout';

// ─── test lifecycle ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.hasCompletedTour = false;
  mockState.mutateAsync = jest.fn().mockResolvedValue(undefined);
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('TourBootstrapper', () => {
  test('opens the tour when the account reports hasCompletedTour: false', async () => {
    mockState.hasCompletedTour = false;
    render(<AppLayout />);

    // Let effects settle (useEffect in TourBootstrapper fires after render).
    await act(async () => {});

    expect(screen.getByTestId('tour-overlay')).toBeTruthy();
  });

  test('does not open the tour when the account reports hasCompletedTour: true', async () => {
    mockState.hasCompletedTour = true;
    render(<AppLayout />);

    await act(async () => {});

    expect(screen.queryByTestId('tour-overlay')).toBeNull();
  });

  test('does not open the tour while account data is still loading', async () => {
    // null → useGetAccount returns { data: undefined }
    mockState.hasCompletedTour = null;
    render(<AppLayout />);

    await act(async () => {});

    expect(screen.queryByTestId('tour-overlay')).toBeNull();
  });

  test('calls useUpdateAccountPreferences with hasCompletedTour: true when the tour is skipped', async () => {
    mockState.hasCompletedTour = false;
    render(<AppLayout />);
    await act(async () => {});

    // Tour must be open before we can skip it.
    expect(screen.getByTestId('tour-overlay')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('skip-tour'));
    });

    expect(mockState.mutateAsync).toHaveBeenCalledWith({
      data: { hasCompletedTour: true },
    });
  });

  test('calls useUpdateAccountPreferences with hasCompletedTour: true when the tour is completed via Next', async () => {
    mockState.hasCompletedTour = false;
    render(<AppLayout />);
    await act(async () => {});

    expect(screen.getByTestId('tour-overlay')).toBeTruthy();

    // TourContext has 2 steps; tapping Next twice reaches the end and triggers
    // closeAndNotify → onDone → mutateAsync.
    await act(async () => {
      fireEvent.press(screen.getByTestId('next-tour'));
    });
    // Second Next: on the final step, goNext schedules closeAndNotify via
    // setTimeout — flush it with an additional act.
    await act(async () => {
      fireEvent.press(screen.getByTestId('next-tour'));
    });
    await act(async () => {
      // Flush the setTimeout(closeAndNotify, 0) queued by goNext.
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockState.mutateAsync).toHaveBeenCalledWith({
      data: { hasCompletedTour: true },
    });
  });
});
