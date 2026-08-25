/**
 * HomeSocialStrip (mobile) — component unit tests.
 *
 * Pins four contracts:
 *   1. Empty state   — no friends → invite affordance + share button
 *   2. Loading state — component stays absent
 *   3. Populated state — rank rows visible, "See all" pressable
 *   4. Self outside top 4 — rank-5+ learner sees their own row appended
 */

// The component builds a referral link from EXPO_PUBLIC_DOMAIN at module load.
process.env.EXPO_PUBLIC_DOMAIN = 'bolo.example.com';

import React from 'react';
import { Share } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type {
  FeedEntry,
  LeaderboardEntry,
} from '@workspace/api-client-react';

// ── mutable mock state ────────────────────────────────────────────────────────

const mockState: {
  leaderboardData: LeaderboardEntry[];
  leaderboardLoading: boolean;
  leaderboardError: boolean;
  referralCode: string | undefined;
  feedData: FeedEntry[];
  pushFn: jest.Mock;
} = {
  leaderboardData: [],
  leaderboardLoading: false,
  leaderboardError: false,
  referralCode: 'K7XM2P',
  feedData: [],
  pushFn: jest.fn(),
};

// ── module mocks ──────────────────────────────────────────────────────────────

jest.mock('@workspace/api-client-react', () => ({
  useGetFriendsLeaderboard: () => ({
    data: mockState.leaderboardData,
    isLoading: mockState.leaderboardLoading,
    isError: mockState.leaderboardError,
  }),
  useGetReferral: () => ({
    data: mockState.referralCode ? { code: mockState.referralCode } : undefined,
    isLoading: false,
    isError: false,
  }),
  // The card now also shows the single most recent friend moment above the
  // rank rows. These tests are about the ranks, so the feed stays empty and
  // the line stays absent.
  useGetFriendsFeed: () => ({
    data: mockState.feedData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  getGetFriendsFeedQueryKey: () => ['feed'],
  useGetOutfits: () => ({ data: { outfits: [] } }),
  // Added 2026-08-25 with the Friends/Everyone toggle: the strip keys its
  // board query by scope and reads the account to know whether the learner
  // has a public name yet.
  getGetFriendsLeaderboardQueryKey: () => ['leaderboard'],
  useGetAccount: () => ({ data: { profile: { username: 'learner', shareStats: true } } }),
  useReportUsername: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockState.pushFn }),
  useFocusEffect: () => {},
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#ffffff',
    border: '#e5e7eb',
    foreground: '#111827',
    mutedForeground: '#6b7280',
    primary: '#4f46e5',
    primaryForeground: '#ffffff',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
}));

jest.mock('@workspace/referral-link', () => ({
  REFERRAL_REWARD_CHAI: 50,
  buildReferralLink: (domain: string, code: string) =>
    `https://${domain}/join/${code}`,
}));

jest.mock('@/lib/referral', () => ({
  referralLinkFor: (code?: string) =>
    code ? `https://bolo.example.com/join/${code}` : null,
}));

jest.mock('@/components/PressableScale', () => {
  const ReactNative = require('react-native');
  const Pressable = ReactNative.Pressable;
  // Must not use the outer-scope `React` import in a jest.mock factory.
  const RN_React = require('react');
  return {
    PressableScale: ({
      children,
      onPress,
      testID,
      accessibilityRole,
      accessibilityLabel,
      style,
    }: any) =>
      RN_React.createElement(
        Pressable,
        { onPress, testID, accessibilityRole, accessibilityLabel, style },
        children,
      ),
  };
});

// Import after mocks.
/* eslint-disable @typescript-eslint/no-require-imports */
const { HomeSocialStrip } = require('@/components/HomeSocialStrip');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  userId: string,
  rank: number,
  xp: number,
  displayName: string,
  isSelf = false,
): LeaderboardEntry {
  return {
    userId,
    rank,
    xp,
    isSelf,
    displayName,
    email: null,
    equippedOutfit: null,
    equippedAccessory: null,
  } as unknown as LeaderboardEntry;
}

const SELF     = makeEntry('me', 1, 300, 'Priya', true);
const FRIEND_A = makeEntry('a',  2, 250, 'Arjun');
const FRIEND_B = makeEntry('b',  3, 200, 'Mira');
const FRIEND_C = makeEntry('c',  4, 150, 'Dev');
const FRIEND_D = makeEntry('d',  5, 100, 'Anaya');

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.leaderboardData = [];
  mockState.leaderboardLoading = false;
  mockState.leaderboardError = false;
  mockState.referralCode = 'K7XM2P';
  mockState.pushFn = jest.fn();
  jest.restoreAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('HomeSocialStrip — empty state (no friends)', () => {
  test('renders the invite affordance and share button', () => {
    render(<HomeSocialStrip />);

    expect(screen.getByText('Invite a friend, earn Chai')).toBeOnTheScreen();
    expect(screen.getByTestId('home-referral-share')).toBeOnTheScreen();
  });

  test('strip is absent while the leaderboard loads', () => {
    mockState.leaderboardLoading = true;
    render(<HomeSocialStrip />);

    expect(screen.queryByTestId('home-social-strip')).toBeNull();
  });

  test('share button triggers Share.share with the referral link', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as any);

    render(<HomeSocialStrip />);
    fireEvent.press(screen.getByTestId('home-referral-share'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const arg = shareSpy.mock.calls[0][0] as { url?: string; message: string };
    expect(arg.url).toBe('https://bolo.example.com/join/K7XM2P');
    expect(arg.message).toContain('https://bolo.example.com/join/K7XM2P');
  });

  test('share button is absent when no domain is configured', () => {
    mockState.referralCode = undefined;
    render(<HomeSocialStrip />);

    expect(screen.queryByTestId('home-referral-share')).toBeNull();
    // But invite copy still shows.
    expect(screen.getByText('Invite a friend, earn Chai')).toBeOnTheScreen();
  });
});

describe('HomeSocialStrip — populated state (has friends)', () => {
  test('shows a rank row for each leaderboard entry', () => {
    mockState.leaderboardData = [SELF, FRIEND_A, FRIEND_B];
    render(<HomeSocialStrip />);

    expect(screen.getByText('Priya (You)')).toBeOnTheScreen();
    expect(screen.getByText('Arjun')).toBeOnTheScreen();
    expect(screen.getByText('Mira')).toBeOnTheScreen();
  });

  test('does not show the invite affordance when friends are present', () => {
    mockState.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    expect(screen.queryByText('Invite a friend, earn Chai')).toBeNull();
    expect(screen.queryByTestId('home-referral-share')).toBeNull();
  });

  // With friends on the strip, "See all" opens the board, not the management
  // tab: the strip is a standings preview, so seeing all of it means the full
  // standings. Adding and removing friends still lives on the Friends tab.
  test('"See all" press navigates to the leaderboard', () => {
    mockState.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    fireEvent.press(screen.getByLabelText('See all'));
    expect(mockState.pushFn).toHaveBeenCalledWith('/(app)/leaderboard');
  });
});

describe('HomeSocialStrip — self outside top 4', () => {
  test('appends the self entry when learner is ranked 5th', () => {
    const selfRank5 = makeEntry('me', 5, 80, 'Priya', true);
    mockState.leaderboardData = [FRIEND_A, FRIEND_B, FRIEND_C, FRIEND_D, selfRank5];
    render(<HomeSocialStrip />);

    // Top 4 shown.
    expect(screen.getByText('Arjun')).toBeOnTheScreen();
    expect(screen.getByText('Mira')).toBeOnTheScreen();
    expect(screen.getByText('Dev')).toBeOnTheScreen();
    expect(screen.getByText('Anaya')).toBeOnTheScreen();

    // Self appended.
    expect(screen.getByText('Priya (You)')).toBeOnTheScreen();
  });

  test('does not duplicate the self row when they rank in the top 4', () => {
    mockState.leaderboardData = [SELF, FRIEND_A, FRIEND_B, FRIEND_C, FRIEND_D];
    render(<HomeSocialStrip />);

    // "(You)" should appear exactly once.
    const youLabels = screen.queryAllByText(/\(You\)/);
    expect(youLabels).toHaveLength(1);
  });
});
