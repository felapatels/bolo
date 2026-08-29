/**
 * THE FIRST-RUN GATE, as of build 19.
 *
 * HISTORY, because this file has said the opposite twice. The B1 gate routed
 * every fresh account to /choose-language. The July 30 2026 product decision
 * removed it: fresh accounts landed on home with Hindi seeded, and this file
 * pinned that. Build 19 brought a gate BACK in a new shape, at the Play
 * testers' ask for a short skippable walkthrough with the language chooser
 * as step one: an account whose hasCompletedTour is false is routed once, to
 * the chooser (asked to continue to the cards) or straight to the cards if
 * it already chose. Skipping lands on home with Hindi, so the July 30
 * behaviour is the skip path rather than gone. Every assertion below that
 * used to say "NOT routed" was inverted for that reason.
 *
 * Still true from the old suite: a failed account fetch renders home and
 * routes nowhere (the gate fails open), and a finished account is left alone.
 *
 * Exercises the real AppLayout.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockState = {
  /** null = account still loading / fetch failed (no data) */
  hasChosenLanguage: false as boolean | null,
  hasCompletedTour: false as boolean,
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
                hasCompletedTour: mockState.hasCompletedTour,
              },
            },
          },
    isError: mockState.hasChosenLanguage === null,
  }),
  useUpdateAccountPreferences: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
  }),
  // The authed layout resolves Bolo's equipped outfit from the wallet query;
  // inert here, this suite is about routing.
  useGetTokens: () => ({ data: undefined }),
  // The wallet sheet reads the streak-repair offer; no break to mend here.
  useGetStreakRepair: () => ({ data: { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useRepairStreak: () => ({ isPending: false, mutate: jest.fn() }),
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
  getGetTokensQueryKey: () => ['/api/tokens'],
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

// Stubbed for the same reason as the scheduler above: this suite is about the
// language-choice gate, and the layout mounts both. Added 2026-08-26 with the
// notification primer, whose permission read hit this file's expo-notifications
// gap and surfaced a missing try/catch in the component itself.
jest.mock('@/components/NotificationPrimer', () => ({
  NotificationPrimer: () => null,
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
  }),
}));

// lib/walkthrough.ts reports the exit to PostHog; inert here.
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  ANALYTICS_EVENTS: { WALKTHROUGH_FINISHED: 'walkthrough_finished' },
}));

import AppLayout from '../app/(app)/_layout';
import { markWalkthroughDismissed, resetWalkthroughForTests } from '@/lib/walkthrough';

// ─── test lifecycle ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetWalkthroughForTests();
  mockState.hasChosenLanguage = false;
  mockState.hasCompletedTour = false;
  mockState.push = jest.fn();
  mockState.replace = jest.fn();
});

/** Every href the layout navigated to, as a string, whichever Href shape. */
const routedTo = (): string[] =>
  [...mockState.push.mock.calls, ...mockState.replace.mock.calls].map(([href]) =>
    typeof href === 'string'
      ? href
      : `${(href as { pathname: string }).pathname}?${new URLSearchParams(
          (href as { params?: Record<string, string> }).params ?? {},
        ).toString()}`,
  );

const wasRoutedToStep = () => routedTo().some((h) => h.includes('choose-language'));
const wasRoutedToCards = () => routedTo().some((h) => h.includes('welcome'));

// ─── tests ───────────────────────────────────────────────────────────────────

describe('the first-run gate (build 19): once, to the walkthrough', () => {
  test('a fresh account IS routed to the language step, asked to continue to the cards', async () => {
    // Inverted in build 19: this used to pin "NOT routed" (July 30 2026).
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(true);
    expect(routedTo()).toEqual(['/(app)/choose-language?next=welcome']);
  });

  test('an account that already chose a language goes straight to the cards', async () => {
    // Inverted in build 19: this used to pin "behave identically" (not routed).
    mockState.hasChosenLanguage = true;
    render(<AppLayout />);
    await act(async () => {});

    expect(wasRoutedToStep()).toBe(false);
    expect(wasRoutedToCards()).toBe(true);
  });

  test('a finished account is left alone, whatever its language state', async () => {
    mockState.hasCompletedTour = true;
    render(<AppLayout />);
    await act(async () => {});

    expect(mockState.push).not.toHaveBeenCalled();
    expect(mockState.replace).not.toHaveBeenCalled();
  });

  test('an account that dismissed the walkthrough this session is not sent back', async () => {
    // The PATCH may still be in flight; the session marker holds the door.
    markWalkthroughDismissed();
    render(<AppLayout />);
    await act(async () => {});

    expect(mockState.push).not.toHaveBeenCalled();
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
