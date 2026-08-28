// THE WAY INTO "WHAT BOLO REMEMBERS", which is the half a screen on its own
// does not give you.
//
// The screen at app/(app)/account/memories is only a privacy control if a
// parent can find it. This holds the row that leads there. Worth a test rather
// than a look, because the row sits below the fold on a phone and swipe
// injection is dead on the development Mac, so nobody is going to eyeball it
// on a regular basis.
//
// Harness copied from account-error-states.test.tsx, which renders the same
// screen with its data hooks stubbed.

// Task #1089: Settings is the app's only unmasked API failure surface — the
// screen App Review saw an error on. Two things must hold forever after:
//
// 1. The copy must say WHICH kind of failure it was. A rejected session is a
//    sign-in problem; telling that learner to "check your connection" sends
//    them down the wrong path (and told us nothing about build 34).
// 2. The failure must be self-describing: the endpoint + status (+ Clerk's
//    auth reason) are printed on screen AND reported to Sentry, and every
//    non-2xx response anywhere in the app leaves a breadcrumb.
//
// Harness shape follows subscription.test.tsx: the real screen renders with
// its data hooks stubbed, so the error branches are exercised for real.

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';

const mockState: Record<string, any> = {};

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: jest.fn() }),
}));

// The shared API client is replaced wholesale, so the breadcrumb installer's
// registration point has to be part of the factory too.
jest.mock('@workspace/api-client-react', () => ({
  useGetAccount: () => mockState.account,
  getGetAccountQueryKey: () => ['account'],
  useUpdateAccountProfile: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateAccountPreferences: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteAccount: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // Added 2026-08-25 with the Guideline 1.2 block control: Account now renders
  // BlockedLearnersList, which reads this. An empty list makes the section
  // render nothing, which is what these error-state tests want on screen.
  useListBlockedUsers: () => ({ data: [], isLoading: false }),
  useUnblockUser: () => ({ mutateAsync: jest.fn(), isPending: false }),
  setFailedResponseObserver: jest.fn(),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ activeLanguage: 'gu', languages: [] }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useThemePref: () => ({ themePref: 'system', setThemePref: jest.fn() }),
  useThemePrefValue: () => 'system',
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return { FunFactLoader: () => <View testID="loader" /> };
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

// Imported after the mocks are declared.
import AccountScreen from '@/app/(app)/account/index';

const ACCOUNT = {
  profile: { id: 'user_1', email: 'learner@example.com', displayName: 'Asha', avatarUrl: null },
  preferences: {
    notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
    learning: { activeLanguage: 'gu', dailyGoal: 10, theme: 'system' },
  },
  subscription: { tier: 'free', status: 'free' },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockState.account = { data: ACCOUNT, isLoading: false, isError: false, error: null };
});

describe('the way in to what Bolo remembers', () => {
  test('settings carries a row for it', () => {
    render(<AccountScreen />);
    expect(screen.getByText('What Bolo remembers')).toBeTruthy();
  });

  test('the row leads to the screen that lists and clears the notes', () => {
    render(<AccountScreen />);

    fireEvent.press(screen.getByText('What Bolo remembers'));

    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/account/memories');
  });
});
