// The primer's wiring: that a NO never reaches the OS, and a YES does.
//
// This is the whole point of the component. iOS gives one permission dialog per
// install and a denial is close to permanent, so the test that matters is that
// requestNotificationPermission is NOT called when the learner declines.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockState: any = {
  permission: { granted: false, canAskAgain: true },
  hasChosenLanguage: true,
  stored: null as string | null,
};
const mockRequest = jest.fn(async () => ({ granted: true, canAskAgain: false }));
const mockSync = jest.fn(async () => true);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => mockState.stored),
  setItem: jest.fn(async (_k: string, v: string) => {
    mockState.stored = v;
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetAccount: () => ({
    data: { preferences: { learning: { hasChosenLanguage: mockState.hasChosenLanguage } } },
  }),
}));

// LAZY WRAPPERS, not the jest.fn itself. jest.mock factories are hoisted above
// the const declarations, and so is the component import that triggers them, so
// `requestNotificationPermission: mockRequest` captured the binding before it
// was initialised. An arrow that CALLS it is evaluated later and sees the real
// mock. The closure-style mocks below never had this problem, which is exactly
// why two tests failed and five passed.
jest.mock('@/lib/reminders', () => ({
  remindersSupported: true,
  getNotificationPermission: async () => mockState.permission,
  requestNotificationPermission: () => mockRequest(),
}));

jest.mock('@/lib/push', () => ({ syncPushToken: () => mockSync() }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));
jest.mock('@/contexts/ThemeContext', () => ({ useThemePrefValue: () => 'system' }));
jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: () => <View testID="mascot" /> };
});

import { NotificationPrimer } from '@/components/NotificationPrimer';

beforeEach(() => {
  mockRequest.mockClear();
  mockSync.mockClear();
  mockState.permission = { granted: false, canAskAgain: true };
  mockState.hasChosenLanguage = true;
  mockState.stored = null;
});

describe('NotificationPrimer', () => {
  it('asks in our own words on first login', async () => {
    render(<NotificationPrimer />);
    await screen.findByTestId('notification-primer');
    // The OS has NOT been asked yet. That is the entire design.
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('"Not now" never reaches the OS, so the one dialog stays unspent', async () => {
    render(<NotificationPrimer />);
    fireEvent.press(await screen.findByTestId('notification-primer-dismiss'));

    expect(mockRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('notification-primer')).toBeNull());
  });

  it('"Yes" fires the OS prompt and registers the token', async () => {
    render(<NotificationPrimer />);
    fireEvent.press(await screen.findByTestId('notification-primer-allow'));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    // A grant with no push_tokens row is the state production was already in.
    await waitFor(() => expect(mockSync).toHaveBeenCalled());
  });

  it('does not appear before the first-run language step is done', async () => {
    mockState.hasChosenLanguage = false;
    render(<NotificationPrimer />);
    await waitFor(() => expect(screen.queryByTestId('notification-primer')).toBeNull());
  });

  it('does not appear when permission is already granted, but does sync the token', async () => {
    mockState.permission = { granted: true, canAskAgain: false };
    render(<NotificationPrimer />);
    await waitFor(() => expect(mockSync).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-primer')).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does not appear once the OS refuses to re-prompt', async () => {
    mockState.permission = { granted: false, canAskAgain: false };
    render(<NotificationPrimer />);
    await waitFor(() => expect(screen.queryByTestId('notification-primer')).toBeNull());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('counts the show even when declined, so it does not re-ask next launch', async () => {
    render(<NotificationPrimer />);
    fireEvent.press(await screen.findByTestId('notification-primer-dismiss'));
    await waitFor(() => expect(mockState.stored).toBeTruthy());
    expect(JSON.parse(mockState.stored as string).timesShown).toBe(1);
  });
});
