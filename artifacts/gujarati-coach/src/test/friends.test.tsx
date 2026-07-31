import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// LanguagePicker calls useLanguage (needs LanguageProvider + API mocks).
// Friends tests render the full page which includes BottomNav; stub out the
// picker so tests stay focused on friends functionality.
vi.mock("@/components/language-picker", () => ({
  LanguagePicker: () => null,
}));

// BottomNav now reads activeLang directly — stub the context so no provider is needed.
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({ activeLang: "gu", activeLanguage: undefined, languages: [], setActiveLang: () => {}, isLoading: false }),
}));
import type {
  Friend,
  FriendRequest,
  LeaderboardEntry,
  UserSummary,
} from "@workspace/api-client-react";

// A stand-in for the ApiError the real client throws. friends.tsx narrows on
// `err instanceof ApiError`, so errors we feed the hooks must be built from this
// exact class (the same reference the mocked module exports). It lives inside
// vi.hoisted so the (hoisted) vi.mock factory can reference it.
const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super("ApiError");
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }
  return { ApiError };
});

// Mutable query/mutation snapshots the module mock reads from, so each test can
// shape the exact server response the page receives before rendering.
const h = vi.hoisted(() => ({
  search: undefined as unknown,
  incoming: undefined as unknown,
  outgoing: undefined as unknown,
  friends: undefined as unknown,
  leaderboard: undefined as unknown,
  sendRequest: undefined as unknown,
  accept: undefined as unknown,
  decline: undefined as unknown,
  remove: undefined as unknown,
  toast: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries, setQueryData: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  ApiError,
  useSearchFriendByEmail: () => h.search,
  useSendFriendRequest: () => h.sendRequest,
  useListIncomingFriendRequests: () => h.incoming,
  useListOutgoingFriendRequests: () => h.outgoing,
  useAcceptFriendRequest: () => h.accept,
  useDeclineFriendRequest: () => h.decline,
  useListFriends: () => h.friends,
  useRemoveFriend: () => h.remove,
  useGetFriendsLeaderboard: () => h.leaderboard,
    useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: vi.fn(() => ['progress-summary']),
  getSearchFriendByEmailQueryKey: () => ["search-friend"],
  getListIncomingFriendRequestsQueryKey: () => ["incoming"],
  getListOutgoingFriendRequestsQueryKey: () => ["outgoing"],
  getListFriendsQueryKey: () => ["friends"],
  getGetFriendsLeaderboardQueryKey: () => ["leaderboard"],
}));

// Imported after the mocks are declared.
import Friends from "@/pages/friends";

function renderFriends(ui: ReactElement, path = "/friends") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

// Query snapshots in the four common shapes the page branches on.
function loadingQuery(extra?: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    isFetching: true,
    refetch: vi.fn(),
    ...extra,
  };
}
function successQuery(data: unknown, extra?: Record<string, unknown>) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...extra,
  };
}
function errorQuery(error: unknown, refetch = vi.fn()) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    error,
    isFetching: false,
    refetch,
  };
}
function idleMutation(extra?: Record<string, unknown>) {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    ...extra,
  };
}

const me: LeaderboardEntry = {
  userId: "me",
  displayName: "Aanya",
  email: "aanya@example.com",
  xp: 240,
  rank: 2,
  isSelf: true,
};

const rival: LeaderboardEntry = {
  userId: "rival",
  displayName: "Dev",
  email: "dev@example.com",
  xp: 500,
  rank: 1,
  isSelf: false,
};

const third: LeaderboardEntry = {
  userId: "priya",
  displayName: "Priya",
  email: "priya@example.com",
  xp: 90,
  rank: 3,
  isSelf: false,
};

beforeEach(() => {
  // Sensible defaults: everything loaded and empty. Individual tests override.
  h.search = { ...successQuery(undefined), isSuccess: false };
  h.incoming = successQuery([]);
  h.outgoing = successQuery([]);
  h.friends = successQuery([]);
  h.leaderboard = successQuery([me]);
  h.sendRequest = idleMutation();
  h.accept = idleMutation();
  h.decline = idleMutation();
  h.remove = idleMutation();
  h.toast.mockClear();
  h.invalidateQueries.mockClear();
});

// Radix Tabs only mounts the active tab, so friend-management sections live
// behind the "Friends" tab. Flip to it before asserting on them.
async function openFriendsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /Friends/i }));
}

/* ------------------------------ Leaderboard ----------------------------- */

describe("Leaderboard", () => {
  test("shows a nudge to add friends when the board only holds the learner", () => {
    h.leaderboard = successQuery([me]);
    renderFriends(<Friends />);

    expect(screen.getByText("Your leaderboard is waiting")).toBeInTheDocument();
    expect(screen.queryByText("Rank #2")).not.toBeInTheDocument();
  });

  test("ranks entries and highlights the learner's own row", () => {
    h.leaderboard = successQuery([rival, me, third]);
    renderFriends(<Friends />);

    // Every ranked learner is present.
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();

    // The learner's own row is marked with "(You)".
    const you = screen.getByText("(You)");
    expect(you).toBeInTheDocument();

    // And it carries the self-highlight styling, not a plain card.
    const selfRow = you.closest("div.rounded-2xl");
    expect(selfRow).not.toBeNull();
    expect(selfRow!.className).toContain("bg-primary");

    // XP is rendered for the entries.
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("240")).toBeInTheDocument();
  });

  test("renders a fun-fact loader while loading", () => {
    h.leaderboard = loadingQuery();
    renderFriends(<Friends />);

    // SectionLoader now shows an India fun fact instead of a bare spinner.
    expect(screen.getByText("Did you know?")).toBeInTheDocument();
    expect(
      screen.queryByText("Your leaderboard is waiting"),
    ).not.toBeInTheDocument();
  });

  test("shows an error state whose retry button refetches", async () => {
    const refetch = vi.fn();
    h.leaderboard = errorQuery(new ApiError(500, {}), refetch);
    const user = userEvent.setup();
    renderFriends(<Friends />);

    expect(
      screen.getByText("We couldn't load the leaderboard."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------- Add friend ----------------------------- */

describe("Add friend (search)", () => {
  const found: UserSummary = {
    id: "u1",
    displayName: "Meera",
    email: "meera@example.com",
  };

  test("a search hit shows the learner with an Add button", async () => {
    h.search = successQuery(found);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.type(
      screen.getByPlaceholderText("friend@email.com"),
      "meera@example.com",
    );
    // The submit button is icon-only; submit the form via Enter instead.
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Meera")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add/i })).toBeInTheDocument();
  });

  test("a search miss shows a friendly not-found message", async () => {
    h.search = errorQuery(
      new ApiError(404, { message: "We couldn't find a learner with that email." }),
    );
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.type(
      screen.getByPlaceholderText("friend@email.com"),
      "ghost@example.com",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("We couldn't find a learner with that email."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add$/i })).not.toBeInTheDocument();
  });

  test("clicking Add sends a friend request for the found learner", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    h.search = successQuery(found);
    h.sendRequest = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.type(
      screen.getByPlaceholderText("friend@email.com"),
      "meera@example.com",
    );
    await user.keyboard("{Enter}");

    await user.click(await screen.findByRole("button", { name: /Add/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: { email: "meera@example.com" },
      }),
    );
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Request sent!" }),
    );
  });

  test("a failed send surfaces a destructive toast", async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiError(409, { message: "Already connected." }));
    h.search = successQuery(found);
    h.sendRequest = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.type(
      screen.getByPlaceholderText("friend@email.com"),
      "meera@example.com",
    );
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: /Add/i }));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't send request",
          variant: "destructive",
        }),
      ),
    );
  });
});

/* --------------------------- Incoming requests -------------------------- */

describe("Incoming requests", () => {
  const request: FriendRequest = {
    id: 7,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    user: { id: "u2", displayName: "Rohan", email: "rohan@example.com" },
  };

  test("accepting an incoming request calls the mutation and toasts success", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    h.incoming = successQuery([request]);
    h.accept = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.click(
      screen.getByRole("button", { name: /Accept request from Rohan/i }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 7 }));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Friend added!" }),
    );
  });

  test("declining an incoming request calls the decline mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    h.incoming = successQuery([request]);
    h.decline = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.click(
      screen.getByRole("button", { name: /Decline request from Rohan/i }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 7 }));
  });

  test("shows an error state whose retry button refetches", async () => {
    const refetch = vi.fn();
    h.incoming = errorQuery(new ApiError(500, {}), refetch);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(
      screen.getByText("We couldn't load your requests."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

/* --------------------------- Outgoing requests -------------------------- */

describe("Outgoing requests", () => {
  const pendingOut: FriendRequest = {
    id: 21,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    user: { id: "u9", displayName: "Ishaan", email: "ishaan@example.com" },
  };

  test("lists each sent request under a Waiting status", async () => {
    h.outgoing = successQuery([pendingOut]);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Ishaan")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  test("renders nothing when there are no outgoing requests", async () => {
    h.outgoing = successQuery([]);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });
});

/* ------------------------------ Friends list ---------------------------- */

describe("Friends list", () => {
  const friend: Friend = {
    friendshipId: 11,
    since: "2026-01-01T00:00:00.000Z",
    id: "f1",
    displayName: "Kabir",
    email: "kabir@example.com",
  };

  test("shows the empty prompt when the learner has no friends", async () => {
    h.friends = successQuery([]);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(screen.getByText("No friends yet")).toBeInTheDocument();
  });

  test("removing a friend calls the remove mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    h.friends = successQuery([friend]);
    h.remove = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(screen.getByText("Kabir")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Remove Kabir/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ userId: "f1" }),
    );
  });

  test("a failed removal surfaces a destructive toast", async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiError(500, { message: "boom" }));
    h.friends = successQuery([friend]);
    h.remove = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.click(screen.getByRole("button", { name: /Remove Kabir/i }));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't remove friend",
          variant: "destructive",
        }),
      ),
    );
  });

  test("shows an error state whose retry button refetches", async () => {
    const refetch = vi.fn();
    h.friends = errorQuery(new ApiError(500, {}), refetch);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(
      screen.getByText("We couldn't load your friends."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
