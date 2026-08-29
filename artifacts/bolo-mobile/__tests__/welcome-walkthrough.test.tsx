/**
 * THE FIRST-RUN WALKTHROUGH, build 19 (the Play testers' ask). Pins:
 *
 *  1. firstRunHref: an account that owes the walkthrough goes to the cards,
 *     a finished account (or an older server that omits the flag) nowhere.
 *     Step one, the language PICKER (the modal with search and colours),
 *     opens from the welcome screen over card one for an account that has
 *     not chosen, once per visit.
 *  2. The cards: four of them, Next advances, the last button is "Let's go".
 *  3. Leaving, by finishing or by Skip, writes hasCompletedTour ONCE, marks
 *     the session, lands on home, and reports which exit and which card.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  WALKTHROUGH_STEPS,
  firstRunHref,
  hasDismissedWalkthrough,
  resetWalkthroughForTests,
} from '@/lib/walkthrough';

const mockState = {
  mutate: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  track: jest.fn(),
  /** null = still loading. */
  hasChosenLanguage: true as boolean | null,
};

jest.mock('@workspace/api-client-react', () => ({
  useUpdateAccountPreferences: () => ({ mutate: mockState.mutate }),
  getGetAccountQueryKey: () => ['account'],
  useGetAccount: () => ({
    data:
      mockState.hasChosenLanguage === null
        ? undefined
        : { preferences: { learning: { hasChosenLanguage: mockState.hasChosenLanguage } } },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => undefined),
    setQueryData: jest.fn(),
  }),
}));

// ONE router object, like the real hook returns: the welcome screen's focus
// callback lists it as a dependency, and a fresh object per render would
// re-run the callback (and reset the card) on every press.
const mockRouter = {
  replace: (...args: unknown[]) => mockState.replace(...args),
  push: (...args: unknown[]) => mockState.push(...args),
  back: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  // The cards reset to the first one on FOCUS; running the callback once on
  // mount is the closest a test renderer gets to a focus.
  useFocusEffect: (cb: () => void) => {
    const R = require('react');
    R.useEffect(cb, [cb]);
  },
}));

jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockState.track(...args),
  ANALYTICS_EVENTS: { WALKTHROUGH_FINISHED: 'walkthrough_finished' },
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: ({ pose }: { pose: string }) => <View testID={`mascot-${pose}`} /> };
});

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

import WelcomeScreen from '../app/(app)/welcome';

beforeEach(() => {
  resetWalkthroughForTests();
  mockState.mutate = jest.fn();
  mockState.replace = jest.fn();
  mockState.push = jest.fn();
  mockState.track = jest.fn();
  mockState.hasChosenLanguage = true;
});

describe('firstRunHref', () => {
  it('sends any account that owes the walkthrough to the cards, chosen language or not', () => {
    expect(firstRunHref({ hasCompletedTour: false, hasChosenLanguage: false })).toBe('/(app)/welcome');
    expect(firstRunHref({ hasCompletedTour: false, hasChosenLanguage: true })).toBe('/(app)/welcome');
  });

  it('sends a finished account nowhere', () => {
    expect(firstRunHref({ hasCompletedTour: true, hasChosenLanguage: true })).toBeNull();
    expect(firstRunHref({ hasCompletedTour: true, hasChosenLanguage: false })).toBeNull();
  });

  it('reads an OMITTED flag as done, never as owed', () => {
    // Nagging every learner on every launch is the failure to fear here.
    expect(firstRunHref({ hasChosenLanguage: false })).toBeNull();
  });
});

describe('step one, the language picker', () => {
  it('opens the modal picker over card one for an account that has not chosen', () => {
    mockState.hasChosenLanguage = false;
    render(<WelcomeScreen />);
    expect(mockState.push).toHaveBeenCalledWith('/(app)/language');
    expect(mockState.push).toHaveBeenCalledTimes(1);
    // The cards are underneath, on card one.
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[0]!.title);
  });

  it('never opens it for an account that already chose', () => {
    mockState.hasChosenLanguage = true;
    render(<WelcomeScreen />);
    expect(mockState.push).not.toHaveBeenCalled();
  });

  it('waits for the account rather than guessing', () => {
    mockState.hasChosenLanguage = null;
    render(<WelcomeScreen />);
    expect(mockState.push).not.toHaveBeenCalled();
  });
});

describe('the cards', () => {
  it('has four, each with a pose, a title and a body, and one says Bolo learns you', () => {
    expect(WALKTHROUGH_STEPS).toHaveLength(4);
    // Owner, 2026-08-29: the walkthrough must say Bolo learns from you and
    // gets more accurate and personal as you go.
    expect(WALKTHROUGH_STEPS.map((s) => s.title)).toContain('Bolo learns you');
    expect(WALKTHROUGH_STEPS.find((s) => s.key === 'learns')!.body).toMatch(/more accurate/);
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.pose).toBeTruthy();
    }
  });

  it('opens on the first card and Next walks to the last, where the button becomes Let\'s go', () => {
    render(<WelcomeScreen />);
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[0]!.title);
    expect(screen.getByTestId(`mascot-${WALKTHROUGH_STEPS[0]!.pose}`)).toBeTruthy();
    expect(screen.getAllByTestId('walkthrough-dot')).toHaveLength(3);

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[1]!.title);

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[2]!.title);

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[3]!.title);
    expect(screen.getByText("Let's go")).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
    // Nothing written yet: walking the cards is not finishing them.
    expect(mockState.mutate).not.toHaveBeenCalled();
    expect(mockState.replace).not.toHaveBeenCalled();
  });

  it('Let\'s go retires the walkthrough for the account and lands on home', () => {
    render(<WelcomeScreen />);
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByText("Let's go"));

    expect(mockState.mutate).toHaveBeenCalledTimes(1);
    expect(mockState.mutate.mock.calls[0]![0]).toEqual({ data: { hasCompletedTour: true } });
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/(tabs)');
    expect(hasDismissedWalkthrough()).toBe(true);
    expect(mockState.track).toHaveBeenCalledWith('walkthrough_finished', { reason: 'done', step: 3 });
  });

  it('Skip does the same from any card, and says which one', () => {
    render(<WelcomeScreen />);
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(screen.getByTestId('walkthrough-skip'));

    expect(mockState.mutate).toHaveBeenCalledTimes(1);
    expect(mockState.mutate.mock.calls[0]![0]).toEqual({ data: { hasCompletedTour: true } });
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/(tabs)');
    expect(hasDismissedWalkthrough()).toBe(true);
    expect(mockState.track).toHaveBeenCalledWith('walkthrough_finished', { reason: 'skipped', step: 1 });
  });
});
