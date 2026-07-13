import React from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
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
  search: undefined,
  incoming: undefined,
  outgoing: undefined,
  friends: undefined,
  leaderboard: undefined,
  sendRequest: undefined,
  accept: undefined,
  decline: undefined,
  remove: undefined,
};

const mockQueryClient = {
  invalidateQueries: jest.fn(),
  removeQueries: jest.fn(),
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@workspace/api-client-react', () => ({
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
  useSearchFriendByEmail: () => mockState.search,
  useSendFriendRequest: () => mockState.sendRequest,
  useListIncomingFriendRequests: () => mockState.incoming,
  useListOutgoingFriendRequests: () => mockState.outgoing,
  useListFriends: () => mockState.friends,
  useAcceptFriendRequest: () => mockState.accept,
  useDeclineFriendRequest: () => mockState.decline,
  useRemoveFriend: () => mockState.remove,
  useGetFriendsLeaderboard: () => mockState.leaderboard,
  getSearchFriendByEmailQueryKey: () => ['search-friend'],
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
  };
});

jest.mock('@/components/Mascot', () => ({
  Mascot: () => null,
}));

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

// Imported after the mocks are declared.
import FriendsScreen from '@/app/(app)/(tabs)/friends';

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
  mockState.search = { ...successQuery(undefined), isSuccess: false };
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

// Type an email and run the search (the button enables once the email is valid).
function runSearch(email: string) {
  fireEvent.changeText(screen.getByPlaceholderText("Friend's email"), email);
  fireEvent.press(screen.getByRole('button', { name: 'Search' }));
}

/* ------------------------------ Leaderboard ----------------------------- */

describe('Leaderboard', () => {
  test('nudges the learner to add friends when the board is empty', () => {
    mockState.leaderboard = successQuery([]);
    render(<FriendsScreen />);
    openLeaderboard();

    expect(screen.getByText('Nothing to rank yet')).toBeOnTheScreen();
  });

  test('shows a hint when the board holds only the learner', () => {
    mockState.leaderboard = successQuery([me]);
    render(<FriendsScreen />);
    openLeaderboard();

    expect(
      screen.getByText(/Add friends to see how you stack up/i),
    ).toBeOnTheScreen();
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

  test('renders a spinner while loading', () => {
    mockState.leaderboard = loadingQuery();
    render(<FriendsScreen />);
    openLeaderboard();

    expect(screen.UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(
      0,
    );
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

describe('Add friend (search)', () => {
  const found: UserSummary = {
    id: 'u1',
    displayName: 'Meera',
    email: 'meera@example.com',
  };

  test('a search hit shows the learner with an Add button', () => {
    mockState.search = successQuery(found);
    render(<FriendsScreen />);
    runSearch('meera@example.com');

    expect(screen.getByText('Meera')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Send friend request to Meera/i }),
    ).toBeOnTheScreen();
  });

  test('a search miss shows a friendly not-found message', () => {
    mockState.search = errorQuery(
      new ApiError(404, { detail: 'not found' }),
    );
    render(<FriendsScreen />);
    runSearch('ghost@example.com');

    expect(
      screen.getByText(/No learner found with that email/i),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: /Send friend request/i }),
    ).not.toBeOnTheScreen();
  });

  test('a non-404 search error surfaces a generic message', () => {
    mockState.search = errorQuery(new ApiError(500, {}));
    render(<FriendsScreen />);
    runSearch('meera@example.com');

    expect(
      screen.getByText(/Couldn't search right now/i),
    ).toBeOnTheScreen();
  });

  test('tapping Add sends a friend request for the found learner', async () => {
    mockState.search = successQuery(found);
    render(<FriendsScreen />);
    runSearch('meera@example.com');

    fireEvent.press(
      screen.getByRole('button', { name: /Send friend request to Meera/i }),
    );

    expect(mockState.sendRequest.mutate).toHaveBeenCalledWith(
      { data: { email: 'meera@example.com' } },
      expect.anything(),
    );
    await waitFor(() =>
      expect(screen.getByText('Request sent to Meera.')).toBeOnTheScreen(),
    );
  });

  test('a failed send surfaces the error as a notice', async () => {
    mockState.search = successQuery(found);
    mockState.sendRequest = mutation({
      error: new ApiError(409, { detail: 'Already connected.' }),
    });
    render(<FriendsScreen />);
    runSearch('meera@example.com');

    fireEvent.press(
      screen.getByRole('button', { name: /Send friend request to Meera/i }),
    );

    await waitFor(() =>
      expect(screen.getByText('Already connected.')).toBeOnTheScreen(),
    );
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

  test('shows the empty prompt when the learner has no friends', () => {
    mockState.friends = successQuery([]);
    render(<FriendsScreen />);

    expect(screen.getByText('No friends yet')).toBeOnTheScreen();
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
