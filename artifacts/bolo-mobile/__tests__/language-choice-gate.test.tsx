/**
 * B1 parity — the first-time language-choice gate in the signed-in layout:
 *
 *  1. A fresh account (hasChosenLanguage=false, no session skip) is routed to
 *     the full-screen /choose-language step, and the guided tour is HELD.
 *  2. "Skip for now" is session-scoped: with the in-memory flag set, no
 *     routing happens and the tour fires; after a simulated restart (flag
 *     reset) a fresh render routes again.
 *  3. Existing (grandfathered) accounts never see the step; the tour fires.
 *  4. If the account fetch fails, the gate fails open to home.
 *
 * Exercises the real AppLayout bootstrappers + real TourContext + real
 * lib/language-step module.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import {
  markLanguageStepSkipped,
  resetLanguageStepSkipForTests,
} from '@/lib/language-step';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockState = {
  /** null = account still loading / fetch failed (no data) */
  hasChosenLanguage: false as boolean | null,
  hasCompletedTour: false,
  push: jest.fn(),
  replace: jest.fn(),
};

// ─── external module mocks ───────────────────────────────────────────────────

jest.mock('@workspace/api-client-react', () => ({
  setAuthTokenGetter: jest.fn(),
  useGetAccount: () => ({
    data:
      mockState.hasChosenLanguage === null
        ? undefined
        : {
            preferences: {
              learning: {
                hasCompletedTour: mockState.hasCompletedTour,
                hasChosenLanguage: mockState.hasChosenLanguage,
              },
            },
          },
    isError: mockState.hasChosenLanguage === null,
  }),
  useUpdateAccountPreferences: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
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
    useRouter: () => ({
      push: mockState.push,
      replace: mockState.replace,
      back: jest.fn(),
    }),
    usePathname: () => '/',
  };
});

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

// GuidedTour probe: renders testID="tour-overlay" only while the tour is open.
jest.mock('@/components/GuidedTour', () => {
  const React = require('react');
  const { View } = require('react-native');
  const { useTour } = require('@/contexts/TourContext');
  return {
    GuidedTour: () => {
      const { isOpen } = useTour();
      return isOpen ? React.createElement(View, { testID: 'tour-overlay' }) : null;
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

import AppLayout from '../app/(app)/_layout';

// ─── test lifecycle ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetLanguageStepSkipForTests();
  mockState.hasChosenLanguage = false;
  mockState.hasCompletedTour = false;
  mockState.push = jest.fn();
  mockState.replace = jest.fn();
});

const wasRoutedToStep = () =>
  [...mockState.push.mock.calls, ...mockState.replace.mock.calls].some(
    ([href]) => String(href).includes('choose-language'),
  );

// ─── tests ───────────────────────────────────────────────────────────────────

describe('LanguageChoiceBootstrapper', () => {
  test('routes a fresh account to the language step and holds the tour', async () => {
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(true);
    // Tour is held while the step is pending, even though hasCompletedTour=false.
    expect(screen.queryByTestId('tour-overlay')).toBeNull();
  });

  test('a session skip suppresses the step and releases the tour', async () => {
    markLanguageStepSkipped();
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
    // Step resolved (skipped) → tour fires normally.
    expect(screen.getByTestId('tour-overlay')).toBeTruthy();
  });

  test('skip is session-scoped: after a simulated restart the step returns', async () => {
    markLanguageStepSkipped();
    const first = render(<AppLayout />);
    await act(async () => {});
    expect(wasRoutedToStep()).toBe(false);
    first.unmount();

    // Simulated app restart: the in-memory flag clears.
    resetLanguageStepSkipForTests();
    render(<AppLayout />);
    await act(async () => {});
    expect(wasRoutedToStep()).toBe(true);
  });

  test('grandfathered accounts (hasChosenLanguage=true) bypass the step', async () => {
    mockState.hasChosenLanguage = true;
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
    expect(screen.getByTestId('tour-overlay')).toBeTruthy();
  });

  test('fails open to home when the account fetch fails', async () => {
    mockState.hasChosenLanguage = null; // no data, isError=true
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
  });
});
