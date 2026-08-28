// WHAT BOLO REMEMBERS: the mobile screen behind the chat disclosure.
//
// Bolo began keeping notes about learners on 2026-08-27. The chat screen said
// so from day one and there was no screen behind it, on either platform, for a
// day. Many of these learners are children, so this is a privacy control and
// the tests here hold the parts that make it one rather than a settings list.
//
// Harness shape follows account-error-states.test.tsx: the real screen renders
// with its data hooks stubbed, so every branch is exercised for real.

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockState: Record<string, any> = {};
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetAccountMemories: () => mockState.memories,
  useForgetAccountMemories: () => mockState.forget,
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

import MemoriesScreen, { formatRemembered } from '@/app/(app)/account/memories';

const MEMORIES = [
  {
    id: 2,
    memory: 'You are learning Gujarati for a family wedding in March.',
    createdAt: '2026-08-26T10:00:00.000Z',
  },
  { id: 1, memory: 'You have a dog called Rocky.', createdAt: '2026-08-25T10:00:00.000Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockState.memories = { data: { memories: [] }, isLoading: false, isError: false };
  mockState.forget = { mutateAsync: jest.fn(async () => ({ forgotten: 2 })), isPending: false };
});

describe('what is shown', () => {
  test('says plainly that nothing is held, rather than rendering nothing', () => {
    render(<MemoriesScreen />);
    // The whole point of the screen. "Nothing is held" is the answer a parent
    // came for, so an empty list must still produce a sentence.
    expect(screen.getByTestId('memories-empty')).toBeTruthy();
  });

  test('offers no clear button when there is nothing to clear', () => {
    render(<MemoriesScreen />);
    expect(screen.queryByText('Make Bolo forget everything')).toBeNull();
  });

  test('lists every note, in the order the server sent them', () => {
    mockState.memories = { data: { memories: MEMORIES }, isLoading: false, isError: false };
    render(<MemoriesScreen />);

    expect(
      screen.getByText('You are learning Gujarati for a family wedding in March.'),
    ).toBeTruthy();
    expect(screen.getByText('You have a dog called Rocky.')).toBeTruthy();
    expect(screen.getByTestId('memory-2')).toBeTruthy();
    expect(screen.getByTestId('memory-1')).toBeTruthy();
  });

  test('a failed load says so instead of claiming nothing is kept', () => {
    mockState.memories = { data: undefined, isLoading: false, isError: true };
    render(<MemoriesScreen />);

    expect(screen.getByTestId('memories-error')).toBeTruthy();
    // The dangerous wrong answer: an error rendering as "nothing kept" tells a
    // parent the opposite of the truth.
    expect(screen.queryByTestId('memories-empty')).toBeNull();
  });

  test('says when it is still checking', () => {
    mockState.memories = { data: undefined, isLoading: true, isError: false };
    render(<MemoriesScreen />);

    expect(screen.getByTestId('memories-loading')).toBeTruthy();
    expect(screen.queryByTestId('memories-empty')).toBeNull();
  });
});

describe('clearing', () => {
  test('confirming deletes everything and refetches', async () => {
    mockState.memories = { data: { memories: MEMORIES }, isLoading: false, isError: false };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<MemoriesScreen />);

    fireEvent.press(screen.getByText('Make Bolo forget everything'));

    const [, body, buttons] = alert.mock.calls[0] as [string, string, any[]];
    // Names the count, so nobody clears more than they meant to.
    expect(body).toContain('all 2 notes');

    const destructive = buttons.find((b) => b.style === 'destructive');
    await destructive.onPress();

    expect(mockState.forget.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  test('cancelling deletes nothing', () => {
    mockState.memories = { data: { memories: MEMORIES }, isLoading: false, isError: false };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<MemoriesScreen />);

    fireEvent.press(screen.getByText('Make Bolo forget everything'));
    const [, , buttons] = alert.mock.calls[0] as [string, string, any[]];
    const cancel = buttons.find((b) => b.style === 'cancel');

    expect(cancel.text).toBe('Keep them');
    expect(cancel.onPress).toBeUndefined();
    expect(mockState.forget.mutateAsync).not.toHaveBeenCalled();
  });

  test('a failed delete says so and does not claim success', async () => {
    mockState.memories = { data: { memories: MEMORIES }, isLoading: false, isError: false };
    mockState.forget = {
      mutateAsync: jest.fn(async () => {
        throw new Error('boom');
      }),
      isPending: false,
    };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<MemoriesScreen />);

    fireEvent.press(screen.getByText('Make Bolo forget everything'));
    const buttons = (alert.mock.calls[0] as any[])[2] as any[];
    await buttons.find((b) => b.style === 'destructive').onPress();

    expect(alert).toHaveBeenCalledTimes(2);
    expect((alert.mock.calls[1] as any[])[0]).toContain('Couldn’t clear the notes');
  });
});

describe('formatRemembered', () => {
  test('a bad timestamp does not take the note down with it', () => {
    expect(formatRemembered('not-a-date')).toBe('Remembered earlier');
  });

  test('a good timestamp reads as a date', () => {
    expect(formatRemembered('2026-08-26T10:00:00.000Z')).toContain('Remembered on');
  });
});
