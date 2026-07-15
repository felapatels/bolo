import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { FriendRequest } from '@workspace/api-client-react';

// The bottom-tab "Friends" badge is driven by useListIncomingFriendRequests.
// A regression here (badge missing, or lingering after requests clear) would
// ship silently, so cover the layout's badge logic directly. This complements
// friends.test.tsx, which exercises the Friends screen itself.
//
// Prefixed with `mock` so jest's hoisted mock factory is allowed to reference it.
const mockState = {
  incoming: undefined as unknown,
};

jest.mock('@workspace/api-client-react', () => ({
  useListIncomingFriendRequests: () => mockState.incoming,
}));

// Keep the font registry from pulling in every @expo-google-fonts package
// (which reaches the native bridge on import). _layout.tsx only needs the names.
jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

// Expo Router's <Tabs> needs a full navigation context we don't want to stand
// up here. Replace it with a lightweight stand-in that surfaces each screen's
// resolved tabBarBadge so we can assert on it. This still exercises the real
// TabsLayout badge computation.
jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: { tabBarBadge?: string | number; title?: string };
  }) => {
    const badge = options?.tabBarBadge;
    return React.createElement(
      View,
      null,
      React.createElement(
        Text,
        { accessibilityLabel: `tab-${name}` },
        options?.title ?? name,
      ),
      badge != null
        ? React.createElement(
            Text,
            { accessibilityLabel: `${name}-badge` },
            String(badge),
          )
        : null,
    );
  };
  return { __esModule: true, Tabs };
});

// Imported after the mocks are declared.
import TabsLayout from '../app/(app)/(tabs)/_layout';

function requestsOfLength(n: number): FriendRequest[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    user: {
      id: `u${i + 1}`,
      displayName: `Learner ${i + 1}`,
      email: `learner${i + 1}@example.com`,
    },
  }));
}

beforeEach(() => {
  mockState.incoming = { data: [] as FriendRequest[] };
});

describe('Registered tabs', () => {
  test('all four tabs are present, including Chat', () => {
    render(<TabsLayout />);
    expect(screen.getByLabelText('tab-index')).toHaveTextContent('Home');
    expect(screen.getByLabelText('tab-chat')).toHaveTextContent('Chat');
    expect(screen.getByLabelText('tab-friends')).toHaveTextContent('Friends');
    expect(screen.getByLabelText('tab-progress')).toHaveTextContent('Progress');
  });
});

describe('Friends tab badge', () => {
  test('shows no badge when there are no incoming requests', () => {
    mockState.incoming = { data: [] };
    render(<TabsLayout />);

    expect(screen.queryByLabelText('friends-badge')).toBeNull();
  });

  test('shows no badge while the request list is still loading (undefined data)', () => {
    mockState.incoming = { data: undefined };
    render(<TabsLayout />);

    expect(screen.queryByLabelText('friends-badge')).toBeNull();
  });

  test('shows the exact count when there are pending requests', () => {
    mockState.incoming = { data: requestsOfLength(3) };
    render(<TabsLayout />);

    const badge = screen.getByLabelText('friends-badge');
    expect(badge).toHaveTextContent('3');
  });

  test('caps the badge at 9+ once past nine requests', () => {
    mockState.incoming = { data: requestsOfLength(12) };
    render(<TabsLayout />);

    const badge = screen.getByLabelText('friends-badge');
    expect(badge).toHaveTextContent('9+');
  });

  test('clears the badge when the request list becomes empty', () => {
    mockState.incoming = { data: requestsOfLength(2) };
    const { rerender } = render(<TabsLayout />);
    expect(screen.getByLabelText('friends-badge')).toHaveTextContent('2');

    mockState.incoming = { data: [] };
    rerender(<TabsLayout />);
    expect(screen.queryByLabelText('friends-badge')).toBeNull();
  });
});
