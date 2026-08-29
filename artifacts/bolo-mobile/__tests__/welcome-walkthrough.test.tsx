/**
 * THE FIRST-RUN WALKTHROUGH, build 19 (the Play testers' ask). Pins:
 *
 *  1. firstRunHref: a fresh account goes to the chooser with ?next=welcome,
 *     an account that already chose goes straight to the cards, a finished
 *     account (or an older server that omits the flag) goes nowhere.
 *  2. The cards: three of them, Next advances, the last button is "Let's go".
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
  track: jest.fn(),
};

jest.mock('@workspace/api-client-react', () => ({
  useUpdateAccountPreferences: () => ({ mutate: mockState.mutate }),
  getGetAccountQueryKey: () => ['account'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => undefined),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockState.replace, push: jest.fn(), back: jest.fn() }),
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
  mockState.track = jest.fn();
});

describe('firstRunHref', () => {
  it('sends a fresh account to the chooser, asking it to continue to the cards', () => {
    expect(firstRunHref({ hasCompletedTour: false, hasChosenLanguage: false })).toEqual({
      pathname: '/(app)/choose-language',
      params: { next: 'welcome' },
    });
  });

  it('sends an account that already chose a language straight to the cards', () => {
    expect(firstRunHref({ hasCompletedTour: false, hasChosenLanguage: true })).toBe(
      '/(app)/welcome',
    );
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

describe('the cards', () => {
  it('has three, each with a pose, a title and a body', () => {
    expect(WALKTHROUGH_STEPS).toHaveLength(3);
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
    expect(screen.getAllByTestId('walkthrough-dot')).toHaveLength(2);

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[1]!.title);

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByTestId('walkthrough-title').props.children).toBe(WALKTHROUGH_STEPS[2]!.title);
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
    fireEvent.press(screen.getByText("Let's go"));

    expect(mockState.mutate).toHaveBeenCalledTimes(1);
    expect(mockState.mutate.mock.calls[0]![0]).toEqual({ data: { hasCompletedTour: true } });
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/(tabs)');
    expect(hasDismissedWalkthrough()).toBe(true);
    expect(mockState.track).toHaveBeenCalledWith('walkthrough_finished', { reason: 'done', step: 2 });
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
