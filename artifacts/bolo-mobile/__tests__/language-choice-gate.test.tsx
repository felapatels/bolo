/**
 * B1 gate removal (product decision, July 30 2026) — fresh accounts land
 * directly on home with the seeded default language (Hindi):
 *
 *  1. A fresh account (hasChosenLanguage=false) is NOT routed to
 *     /choose-language.
 *  2. Accounts that already chose a language behave identically.
 *  3. A failed account fetch still renders home without routing anywhere.
 *
 * The /choose-language screen itself remains a normal navigable route (see
 * language-choice-step.test.tsx), and the hasChosenLanguage flag + one-PATCH
 * helper are retained — only the redirect gate is gone.
 *
 * (The guided tour and its auto-launch were removed entirely in Task #906,
 * so this suite no longer asserts anything about tour behavior.)
 *
 * Exercises the real AppLayout.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockState = {
  /** null = account still loading / fetch failed (no data) */
  hasChosenLanguage: false as boolean | null,
  push: jest.fn(),
  replace: jest.fn(),
};

// ─── external module mocks ───────────────────────────────────────────────────

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  setAuthTokenGetter: jest.fn(),
  useGetAccount: () => ({
    data:
      mockState.hasChosenLanguage === null
        ? undefined
        : {
            preferences: {
              learning: {
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
  mockState.hasChosenLanguage = false;
  mockState.push = jest.fn();
  mockState.replace = jest.fn();
});

const wasRoutedToStep = () =>
  [...mockState.push.mock.calls, ...mockState.replace.mock.calls].some(
    ([href]) => String(href).includes('choose-language'),
  );

// ─── tests ───────────────────────────────────────────────────────────────────

describe('B1 gate removal — fresh accounts land on home', () => {
  test('a fresh account is NOT routed to the language step', async () => {
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
  });

  test('accounts that already chose a language behave identically', async () => {
    mockState.hasChosenLanguage = true;
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
  });

  test('a failed account fetch renders home without routing anywhere', async () => {
    mockState.hasChosenLanguage = null; // no data, isError=true
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
    expect(mockState.push).not.toHaveBeenCalled();
    expect(mockState.replace).not.toHaveBeenCalled();
  });
});
