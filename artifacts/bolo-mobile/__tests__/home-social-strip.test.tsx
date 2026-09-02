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

    // getAllByText SINCE BUILD 29, and the reason is worth writing down.
    // On a wide screen the card now draws the leaderboard PODIUM above the
    // rows, so the top three are named twice: once on a pedestal, once in the
    // rank strip. getByText fails on "multiple elements", which is the test
    // correctly noticing a deliberate change rather than a bug.
    //
    // AND THIS SUITE IS A WIDE SCREEN. jest's window is 750x1334 and
    // useIsWideScreen() is width > 600, so every mobile test has rendered the
    // TABLET layout since build 25 introduced the content column. That is a
    // real gap, it is not this change's to fix, and it is why these assertions
    // see a podium at all.
    expect(screen.getAllByText('Priya (You)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Arjun').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mira').length).toBeGreaterThan(0);
  });

  test('does not show the invite affordance when friends are present', () => {
    mockState.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    expect(screen.queryByText('Invite a friend, earn Chai')).toBeNull();
    expect(screen.queryByTestId('home-referral-share')).toBeNull();
  });

  // INVERTED 2026-08-26, web twin inverted the same day. This asserted a bare
  // '/(app)/leaderboard' and that assertion WAS the bug, held in place by a
  // passing test: the bare route opens on Weekly XP, so "See all" on a FEED
  // card landed the learner on a ranking rather than on more of what they had
  // just been reading. Adding and removing friends still lives on the Friends
  // tab, which is where the empty state still points.
  test('"See all" opens the FEED tab, not the default ranking', () => {
    mockState.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    fireEvent.press(screen.getByLabelText('See all'));
    expect(mockState.pushFn).toHaveBeenCalledWith(
      expect.stringContaining('tab=feed'),
    );
  });

  // The card and the board are two views of the same thing. Handing off to a
  // different set of people than the card was showing reads as the toggle
  // having been ignored.
  test('"See all" carries the scope the card is showing', () => {
    mockState.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    // The card defaults to Everyone.
    fireEvent.press(screen.getByLabelText('See all'));
    expect(mockState.pushFn).toHaveBeenCalledWith(
      expect.stringContaining('scope=all'),
    );

    // Switch it to Friends and the route follows.
    fireEvent.press(screen.getByLabelText('Friends'));
    fireEvent.press(screen.getByLabelText('See all'));
    expect(mockState.pushFn).toHaveBeenLastCalledWith(
      expect.stringContaining('scope=friends'),
    );
  });
});

describe('HomeSocialStrip — self outside top 4', () => {
  test('appends the self entry when learner is ranked 5th', () => {
    const selfRank5 = makeEntry('me', 5, 80, 'Priya', true);
    mockState.leaderboardData = [FRIEND_A, FRIEND_B, FRIEND_C, FRIEND_D, selfRank5];
    render(<HomeSocialStrip />);

    // Top 4 shown. getAllByText for the first three: the podium names them a
    // second time on a wide screen, and this suite runs at 750pt. See the note
    // on the populated-state test above.
    expect(screen.getAllByText('Arjun').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mira').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dev').length).toBeGreaterThan(0);
    expect(screen.getByText('Anaya')).toBeOnTheScreen();

    // Self appended. Never on the podium, since they rank 5th, so still exactly
    // one of these. That is a real assertion about the append, not a workaround.
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

// ---------------------------------------------------------------------------
// PHONE VERSUS TABLET (build 29). These two are the reason the suite's window
// was changed at all.
//
// Until 2026-09-02 jest rendered at 750x1334, which useIsWideScreen() calls a
// tablet, so every test above was a wide-screen render and the phone path had
// no coverage whatsoever. The window is a phone now, and a test that wants a
// tablet says so out loud.
// ---------------------------------------------------------------------------
declare const setTestWindow: (win: { width: number; height: number } | null) => void;

describe('the podium is a tablet affordance', () => {
  test('a phone gets the rank rows and NO podium', () => {
    mockState.leaderboardData = [SELF, FRIEND_A, FRIEND_B];
    render(<HomeSocialStrip />);

    // The rows are there...
    expect(screen.getAllByText('Arjun').length).toBeGreaterThan(0);
    // ...and the stage is not. On a phone this card is one of eight stacked
    // sections; a podium would push everything under it off the fold.
    //
    // COUNTING NAMES IS THE WRONG TEST and the first cut of this did it: a name
    // can already appear twice on a phone, because LatestFriendMoment names a
    // friend above the rows. The podium's own testID is the honest signal.
    expect(screen.queryByTestId('podium')).toBeNull();
  });

  test('a 13-inch iPad gets the podium as well', () => {
    setTestWindow({ width: 1032, height: 1366 });
    mockState.leaderboardData = [SELF, FRIEND_A, FRIEND_B];
    render(<HomeSocialStrip />);

    expect(screen.queryByTestId('podium')).not.toBeNull();
    // The top three are now named twice: once on a pedestal, once in the strip.
    expect(screen.getAllByText('Arjun').length).toBeGreaterThan(1);
  });

  test('the window resets between tests, so an opt-in cannot leak', () => {
    mockState.leaderboardData = [SELF, FRIEND_A, FRIEND_B];
    render(<HomeSocialStrip />);
    expect(screen.queryByTestId('podium')).toBeNull();
  });
});
