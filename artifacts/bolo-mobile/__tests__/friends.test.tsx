// The learner's own friend code is shown as a shareable /join/<code> link and
// QR, built by @workspace/referral-link from EXPO_PUBLIC_DOMAIN — which
// lib/referral reads ONCE at module load. Hence the assignment before any
// import that reaches it (same pattern as home-referral-card.test.tsx).
process.env.EXPO_PUBLIC_DOMAIN = 'bolo.example.com';

import React from 'react';
import { Alert } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  ApiError,
  type Friend,
  type FriendRequest,
  type LeaderboardEntry,
  type UserSummary,
} from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Mocks
//
// Mirrors the web friends test (artifacts/gujarati-coach/src/test/friends.test.tsx):
// we drive the real screen but stub its data hooks so each test shapes the exact
// server response the page receives. Heavy presentational wrappers (Screen,
// Mascot, the keyboard-aware scroll view) are replaced with light stand-ins so
// tests don't depend on safe-area / image-asset / keyboard-controller internals;
// the interactive primitives (PressableScale, ChunkyButton) render for real so
// their press + accessibility wiring is exercised.
// ---------------------------------------------------------------------------

// Mutable query/mutation snapshots the module mock reads from, so each test can
// shape the exact response the page receives before rendering. Prefixed `mock*`
// so the hoisted jest.mock factory may reference it.
const mockState: Record<string, any> = {
  referral: undefined,
  incoming: undefined,
  outgoing: undefined,
  friends: undefined,
  leaderboard: undefined,
  sendRequest: undefined,
  sendInvite: undefined,
  accept: undefined,
  decline: undefined,
  remove: undefined,
};

const mockQueryClient = {
  setQueryData: jest.fn(),
  invalidateQueries: jest.fn(),
  removeQueries: jest.fn(),
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // Defined inside the factory so it's the exact class friends.tsx narrows on
  // with `err instanceof ApiError`; tests build errors from the same reference
  // via the value import above.
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super('ApiError');
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
  useSendFriendRequestByCode: () => mockState.sendRequest,
  useGetReferral: () => mockState.referral,
  useSendFriendInvite: () => mockState.sendInvite ?? { mutate: jest.fn(), isPending: false },
  useListIncomingFriendRequests: () => mockState.incoming,
  useListOutgoingFriendRequests: () => mockState.outgoing,
  useListFriends: () => mockState.friends,
  useAcceptFriendRequest: () => mockState.accept,
  useDeclineFriendRequest: () => mockState.decline,
  useRemoveFriend: () => mockState.remove,
  useGetFriendsLeaderboard: () => mockState.leaderboard,
  // Added 2026-08-25 when the Friends tab's own board gained the
  // Friends/Everyone toggle, so it stopped disagreeing with the other two.
  useGetAccount: () => ({ data: { profile: { username: 'learner', shareStats: true } } }),
  useReportUsername: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  getGetReferralQueryKey: () => ['referral'],
  getListIncomingFriendRequestsQueryKey: () => ['incoming'],
  getListOutgoingFriendRequestsQueryKey: () => ['outgoing'],
  getListFriendsQueryKey: () => ['friends'],
  getGetFriendsLeaderboardQueryKey: () => ['leaderboard'],
}));

// Keep the font registry from pulling in every @expo-google-fonts package.
jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

// Stands in for the real mascot but REPORTS what it was asked to wear: row
// avatars must render each learner's own outfit, and an undefined outfit prop
// would silently fall back to the viewer's own clothes.
jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return {
    Mascot: ({
      outfit,
      accessory,
    }: {
      outfit?: string | null;
      accessory?: string | null;
    }) => (
      <View
        testID={`mascot-outfit-${outfit === undefined ? 'inherited' : (outfit ?? 'none')}`}
        // eslint-disable-next-line react-native/no-inline-styles
        accessibilityLabel={`accessory-${accessory === undefined ? 'inherited' : (accessory ?? 'none')}`}
      />
    ),
  };
});

jest.mock('@/components/KeyboardAwareScrollViewCompat', () => {
  const { View } = require('react-native');
  return {
    KeyboardAwareScrollViewCompat: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <View>{children}</View>,
  };
});

// Required (not imported) after the mocks and the env assignment above: static
// imports are hoisted, and lib/referral reads EXPO_PUBLIC_DOMAIN once at module
// load, so an import here would see no domain and hide the share/QR surface.
/* eslint-disable @typescript-eslint/no-require-imports */
const FriendsScreen = require('@/app/(app)/(tabs)/friends').default;

// -------------------------------- fixtures --------------------------------

function successQuery(data: unknown, extra?: Record<string, unknown>) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    isRefetching: false,
    refetch: jest.fn(),
    ...extra,
  };
}
function loadingQuery(extra?: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: true,
    isError: false,
    isSuccess: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(),
    ...extra,
  };
}
function errorQuery(error: unknown, refetch = jest.fn()) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    error,
    isRefetching: false,
    refetch,
  };
}
// A mutation whose `.mutate(vars, { onSuccess, onError })` resolves to the
// configured outcome, mirroring how friends.tsx drives its mutations.
function mutation(opts: { error?: unknown; result?: unknown } = {}) {
  const mutate = jest.fn(
    (
      _vars: unknown,
      cbs?: { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void },
    ) => {
      if (opts.error) cbs?.onError?.(opts.error);
      else cbs?.onSuccess?.(opts.result);
    },
  );
  return { mutate, isPending: false, variables: undefined };
}

const me: LeaderboardEntry = {
  userId: 'me',
  displayName: 'Aanya',
  email: 'aanya@example.com',
  xp: 240,
  rank: 2,
  isSelf: true,
};
const rival: LeaderboardEntry = {
  userId: 'rival',
  displayName: 'Dev',
  email: 'dev@example.com',
  xp: 500,
  rank: 1,
  isSelf: false,
};
const third: LeaderboardEntry = {
  userId: 'priya',
  displayName: 'Priya',
  email: 'priya@example.com',
  xp: 90,
  rank: 3,
  isSelf: false,
};

beforeEach(() => {
  // Sensible defaults: everything loaded and empty. Individual tests override.
  mockState.referral = successQuery({ code: 'AB7K2M', redeemed: false });
  mockState.incoming = successQuery([]);
  mockState.outgoing = successQuery([]);
  mockState.friends = successQuery([]);
  mockState.leaderboard = successQuery([me]);
  mockState.sendRequest = mutation();
  mockState.accept = mutation();
  mockState.decline = mutation();
  mockState.remove = mutation();
  mockQueryClient.invalidateQueries.mockClear();
  mockQueryClient.removeQueries.mockClear();
});

// Only the active tab renders; the leaderboard lives behind its segment.
function openLeaderboard() {
  fireEvent.press(screen.getByRole('button', { name: 'Leaderboard' }));
}

// Type a friend code and submit it. Adding a friend is code-only now — there is
// no lookup by email, name or partial match anywhere on this screen.
function submitCode(code: string) {
  fireEvent.changeText(screen.getByLabelText('Friend code'), code);
  fireEvent.press(screen.getByLabelText('Send friend request'));
}

/* ------------------------------ Leaderboard ----------------------------- */

describe('Leaderboard', () => {
  test('nudges the learner to add friends when the board is empty', () => {
    mockState.leaderboard = successQuery([]);
    render(<FriendsScreen />);
    openLeaderboard();

    expect(screen.getByText('Nothing to rank yet')).toBeOnTheScreen();
  });

  test('shows a hint when the FRIENDS board holds only the learner', () => {
    // SCOPED FROM 2026-08-25. The tab defaults to Everyone now, and on that
    // board "add friends to see how you stack up" is wrong advice: you are
    // already being compared with everyone, and adding a friend changes
    // nothing about the ranking you are looking at. The hint belongs to the
    // friends scope, so the test switches to it first, as a learner would.
    mockState.leaderboard = successQuery([me]);
    render(<FriendsScreen />);
    openLeaderboard();
    fireEvent.press(screen.getByTestId('board-scope-friends'));

    expect(
      screen.getByText(/Add friends to see how you stack up/i),
    ).toBeOnTheScreen();
  });

  test('does NOT show that hint on the Everyone board', () => {
    mockState.leaderboard = successQuery([me]);
    render(<FriendsScreen />);
    openLeaderboard();
    expect(screen.queryByText(/Add friends to see how you stack up/i)).toBeNull();
  });

  test("ranks entries and highlights the learner's own row", () => {
    mockState.leaderboard = successQuery([rival, me, third]);
    render(<FriendsScreen />);
    openLeaderboard();

    // Every friend is present under their name.
    expect(screen.getByText('Dev')).toBeOnTheScreen();
    expect(screen.getByText('Priya')).toBeOnTheScreen();

    // The learner's own row renders the self label instead of their name.
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.queryByText('Aanya')).not.toBeOnTheScreen();

    // XP is shown for the entries.
    expect(screen.getByText('500 XP')).toBeOnTheScreen();
    expect(screen.getByText('240 XP')).toBeOnTheScreen();
  });

  test("every row wears that learner's own outfit, undressed when they have none", () => {
    // Mobile rows used to be initials and nothing else. An outfit costs 40
    // Chai; these rows are the only place another learner ever sees it.
    mockState.leaderboard = successQuery([
      { ...rival, equippedOutfit: 'kurta', equippedAccessory: 'pagdi' },
      { ...me, equippedOutfit: 'sherwani' },
      third,
    ]);
    render(<FriendsScreen />);
    openLeaderboard();

    // Scoped to the ROWS: the screen's own header Bolo legitimately inherits
    // the viewer's outfit, and asserting screen-wide would catch that instead.
    const rows = screen.getAllByTestId('row-mascot');
    expect(rows).toHaveLength(3);
    // INVERTED build 22: the first three sit on a podium that seats second
    // on the left, first in the middle and third on the right, so the rows
    // read me (2nd), the rival (1st), then the third.
    expect(
      rows.map((r) => within(r).getByTestId(/^mascot-outfit-/).props.testID),
    ).toEqual([
      'mascot-outfit-sherwani',
      'mascot-outfit-kurta',
      // The learner who owns nothing gets canonical Bolo — an EXPLICIT null,
      // not an inherited fallback that would paint them in the viewer's
      // clothes ('mascot-outfit-inherited' is what that failure looks like).
      'mascot-outfit-none',
    ]);
    // The head slot rides along with the garment (the rival, in the middle).
    expect(within(rows[1]).getByLabelText('accessory-pagdi')).toBeOnTheScreen();
  });

  test('renders skeleton placeholders while loading', () => {
    mockState.leaderboard = loadingQuery();
    render(<FriendsScreen />);
    openLeaderboard();

    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nothing to rank yet')).not.toBeOnTheScreen();
  });

  test('shows an error state whose retry button refetches', () => {
    const refetch = jest.fn();
    mockState.leaderboard = errorQuery(new ApiError(500, {}), refetch);
    render(<FriendsScreen />);
    openLeaderboard();

    expect(
      screen.getByText(/We couldn't load this right now/i),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------- Add friend ----------------------------- */

describe('Add friend (by code)', () => {
  const meera: UserSummary = {
    id: 'u1',
    displayName: 'Meera',
    email: 'meera@example.com',
  };

  test('there is no way to look a learner up by email', () => {
    // Task #1111 retired email search from the product. The invite box (which
    // mails a download link to someone who has no account) is deliberately kept
    // behind a link and is not a lookup.
    render(<FriendsScreen />);

    expect(screen.queryByPlaceholderText("Friend's email")).toBeNull();
    expect(screen.queryByLabelText('Search')).toBeNull();
  });

  test('submitting a code sends a request with the normalized code', async () => {
    mockState.sendRequest = mutation({
      result: { id: 3, status: 'pending', createdAt: 'x', user: meera },
    });
    render(<FriendsScreen />);
    // Typed sloppily on purpose: the client normalizes before sending.
    submitCode(' k7m2p9 ');

    expect(mockState.sendRequest.mutate).toHaveBeenCalledWith(
      { data: { code: 'K7M2P9' } },
      expect.anything(),
    );
    await waitFor(() =>
      expect(screen.getByText('Request sent to Meera.')).toBeOnTheScreen(),
    );
  });

  test('the notice says a request was SENT, never that they are now friends', async () => {
    // Load-bearing. Referral codes get broadcast on flyers and in group chats;
    // the accept step is the only thing between that and an open friend list,
    // so the confirmation must not read as an instant friendship.
    mockState.sendRequest = mutation({
      result: { id: 3, status: 'pending', createdAt: 'x', user: meera },
    });
    render(<FriendsScreen />);
    submitCode('K7M2P9');

    await waitFor(() =>
      expect(screen.getByText('Request sent to Meera.')).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/now friends/i)).toBeNull();
  });

  test('an unknown code shows the uniform rejection, revealing nothing', async () => {
    // The server answers unknown codes, near-misses and already-friended codes
    // identically; the screen must not invent a more specific story.
    mockState.sendRequest = mutation({ error: new ApiError(404, {}) });
    render(<FriendsScreen />);
    submitCode('ZZZZZZ');

    await waitFor(() =>
      expect(
        screen.getByText("That code didn't match. Check it and try again."),
      ).toBeOnTheScreen(),
    );
  });

  test('a rate-limited attempt tells the learner to wait', async () => {
    mockState.sendRequest = mutation({ error: new ApiError(429, {}) });
    render(<FriendsScreen />);
    submitCode('ZZZZZZ');

    await waitFor(() =>
      expect(
        screen.getByText('Too many code attempts. Please try again later.'),
      ).toBeOnTheScreen(),
    );
  });

  test('a server message is preferred over the fallback copy', async () => {
    mockState.sendRequest = mutation({
      error: new ApiError(400, { error: "That's your own friend code." }),
    });
    render(<FriendsScreen />);
    submitCode('AB7K2M');

    await waitFor(() =>
      expect(
        screen.getByText("That's your own friend code."),
      ).toBeOnTheScreen(),
    );
  });

  test('an empty code does not fire a request', () => {
    render(<FriendsScreen />);
    fireEvent.press(screen.getByLabelText('Send friend request'));

    expect(mockState.sendRequest.mutate).not.toHaveBeenCalled();
  });
});

/* ------------------------------- QR scanning ---------------------------- */

describe('Scanning a friend QR', () => {
  test('the scanner stays closed until the learner asks for it', () => {
    render(<FriendsScreen />);

    expect(screen.queryByTestId('qr-camera')).toBeNull();
    expect(screen.getByLabelText('Scan a friend code')).toBeOnTheScreen();
  });

  test('opening the scanner shows the camera', () => {
    render(<FriendsScreen />);
    fireEvent.press(screen.getByLabelText('Scan a friend code'));

    expect(screen.getByTestId('qr-camera')).toBeOnTheScreen();
  });

  test('a scanned join link submits the code it carries', async () => {
    mockState.sendRequest = mutation({
      result: {
        id: 4,
        status: 'pending',
        createdAt: 'x',
        user: { id: 'u9', displayName: 'Meera', email: null },
      },
    });
    render(<FriendsScreen />);
    fireEvent.press(screen.getByLabelText('Scan a friend code'));

    // The QR encodes the join link, not the bare code, so an ordinary camera
    // app opens Bolo!. The in-app scanner has to pull the code back out.
    fireEvent(screen.getByTestId('qr-camera'), 'barcodeScanned', {
      data: 'https://bolo.example/join/K7M2P9',
    });

    expect(mockState.sendRequest.mutate).toHaveBeenCalledWith(
      { data: { code: 'K7M2P9' } },
      expect.anything(),
    );
    // A scan is a faster way to ENTER a code, never a shortcut past accept.
    await waitFor(() =>
      expect(screen.getByText('Request sent to Meera.')).toBeOnTheScreen(),
    );
  });

  test('a QR that is not ours is ignored rather than burning an attempt', () => {
    render(<FriendsScreen />);
    fireEvent.press(screen.getByLabelText('Scan a friend code'));

    fireEvent(screen.getByTestId('qr-camera'), 'barcodeScanned', {
      data: 'WIFI:S=CafeGuest;T=WPA;P=hunter2;;',
    });

    expect(mockState.sendRequest.mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("That doesn't look like a Bolo! friend code."),
    ).toBeOnTheScreen();
  });
});

/* ---------------------------- Your friend code -------------------------- */

describe('Your friend code', () => {
  test('shows the code, a QR and copy/share actions', () => {
    render(<FriendsScreen />);

    expect(screen.getByTestId('your-friend-code')).toBeOnTheScreen();
    expect(screen.getByTestId('friend-code')).toHaveTextContent('AB7K2M');
    expect(screen.getByTestId('friend-qr')).toBeOnTheScreen();
    expect(screen.getByLabelText('Copy friend code')).toBeOnTheScreen();
    expect(screen.getByLabelText('Share friend code')).toBeOnTheScreen();
  });

  test('the QR encodes the join LINK, not the bare code', () => {
    // A bare code in a QR does nothing for whoever scans it with an ordinary
    // camera app; the link opens Bolo! for them.
    render(<FriendsScreen />);

    const payload = screen.getByTestId('qr-payload');
    expect(payload.props.accessibilityValue.text).toMatch(/\/join\/AB7K2M$/);
  });

  test('stays hidden until the code has loaded', () => {
    mockState.referral = loadingQuery();
    render(<FriendsScreen />);

    expect(screen.queryByTestId('your-friend-code')).toBeNull();
  });
});

/* --------------------------- Incoming requests -------------------------- */

describe('Incoming requests', () => {
  const request: FriendRequest = {
    id: 7,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'u2', displayName: 'Rohan', email: 'rohan@example.com' },
  };

  test('accepting an incoming request calls the accept mutation', () => {
    mockState.incoming = successQuery([request]);
    render(<FriendsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Accept Rohan' }));

    expect(mockState.accept.mutate).toHaveBeenCalledWith(
      { id: 7 },
      expect.anything(),
    );
  });

  test('declining an incoming request calls the decline mutation', () => {
    mockState.incoming = successQuery([request]);
    render(<FriendsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Decline Rohan' }));

    expect(mockState.decline.mutate).toHaveBeenCalledWith(
      { id: 7 },
      expect.anything(),
    );
  });
});

/* --------------------------- Outgoing requests -------------------------- */

describe('Outgoing requests', () => {
  const pendingOut: FriendRequest = {
    id: 21,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'u9', displayName: 'Ishaan', email: 'ishaan@example.com' },
  };

  test('lists each sent request with a pending status', () => {
    mockState.outgoing = successQuery([pendingOut]);
    render(<FriendsScreen />);

    expect(screen.getByText('Ishaan')).toBeOnTheScreen();
    expect(screen.getByText('Request sent')).toBeOnTheScreen();
    // "Pending" appears as both the section title and the per-row status pill.
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  test('renders no pending section when there are no outgoing requests', () => {
    mockState.outgoing = successQuery([]);
    render(<FriendsScreen />);

    expect(screen.queryByText('Pending')).not.toBeOnTheScreen();
  });
});

/* ------------------------------ Friends list ---------------------------- */

describe('Friends list', () => {
  const friend: Friend = {
    friendshipId: 11,
    since: '2026-01-01T00:00:00.000Z',
    id: 'f1',
    displayName: 'Kabir',
    email: 'kabir@example.com',
  };

  test('THE EMPTY STATE SELLS THE BOARD, not the mechanism', () => {
    // It used to say "No friends yet. Add a friend by their code above." That
    // explains HOW and never WHY, and nobody adds friends in order to add
    // friends. The pitch is now the leaderboard itself, with the learner at
    // rank one and two empty seats. Owner ruling 2026-08-19, chosen over
    // asking for the contacts permission.
    mockState.friends = successQuery([]);
    render(<FriendsScreen />);

    expect(screen.getByText('You are winning')).toBeOnTheScreen();
    expect(screen.getByTestId('friends-ghost-leaderboard')).toBeOnTheScreen();
    // Two empty seats, so the board reads as a board rather than a single row.
    expect(screen.getByTestId('friends-ghost-seat-2')).toBeOnTheScreen();
    expect(screen.getByTestId('friends-ghost-seat-3')).toBeOnTheScreen();
    // The how is still there, underneath the why.
    expect(
      screen.getByText(
        'Add a friend by their code above, or share yours and let them add you.',
      ),
    ).toBeOnTheScreen();
  });

  test('the ghost seats are BARS, never invented names', () => {
    // A placeholder that reads as a real person is a lie about who is on the
    // board, and the funniest possible thing to screenshot.
    mockState.friends = successQuery([]);
    render(<FriendsScreen />);
    for (const fake of ['Friend', 'Someone', 'Player 2', 'Invite']) {
      expect(screen.queryByText(fake)).toBeNull();
    }
  });

  test('a friend row shows their mascot in their outfit, not their initials', () => {
    mockState.friends = successQuery([
      { ...friend, equippedOutfit: 'saree', equippedAccessory: null },
      {
        friendshipId: 12,
        since: '2026-01-02T00:00:00.000Z',
        id: 'f2',
        displayName: 'Meera',
        email: 'meera@example.com',
      },
    ]);
    render(<FriendsScreen />);

    const rows = screen.getAllByTestId('row-mascot');
    expect(rows).toHaveLength(2);
    expect(
      rows.map((r) => within(r).getByTestId(/^mascot-outfit-/).props.testID),
    ).toEqual(['mascot-outfit-saree', 'mascot-outfit-none']);
    // The initials avatar is gone from these rows ("K" for Kabir would be it).
    expect(screen.queryByText('K')).not.toBeOnTheScreen();
  });

  test('removing a friend confirms then calls the remove mutation', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockState.friends = successQuery([friend]);
    render(<FriendsScreen />);

    expect(screen.getByText('Kabir')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Remove Kabir' }));

    // A confirmation dialog is shown; invoke its destructive action.
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    const removeBtn = buttons.find((b) => b.text === 'Remove');
    removeBtn?.onPress?.();

    expect(mockState.remove.mutate).toHaveBeenCalledWith(
      { userId: 'f1' },
      expect.anything(),
    );
    alertSpy.mockRestore();
  });

  test('a failed removal surfaces an alert', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockState.friends = successQuery([friend]);
    mockState.remove = mutation({
      error: new ApiError(500, { detail: 'boom' }),
    });
    render(<FriendsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Remove Kabir' }));
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find((b) => b.text === 'Remove')?.onPress?.();

    // The remove mutation ran and its error handler raised a second alert.
    expect(mockState.remove.mutate).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Something went wrong',
      'boom',
    );
    alertSpy.mockRestore();
  });

  test('shows an error state whose retry button refetches', () => {
    const refetch = jest.fn();
    mockState.friends = errorQuery(new ApiError(500, {}), refetch);
    render(<FriendsScreen />);

    expect(
      screen.getByText(/We couldn't load this right now/i),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
