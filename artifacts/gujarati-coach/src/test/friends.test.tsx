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
  referral: undefined as unknown,
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
  useSendFriendRequestByCode: () => h.sendRequest,
  useGetReferral: () => h.referral,
  useListIncomingFriendRequests: () => h.incoming,
  useListOutgoingFriendRequests: () => h.outgoing,
  useAcceptFriendRequest: () => h.accept,
  useDeclineFriendRequest: () => h.decline,
  useListFriends: () => h.friends,
  useRemoveFriend: () => h.remove,
  useGetFriendsLeaderboard: () => h.leaderboard,
    useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: vi.fn(() => ['progress-summary']),
  getGetReferralQueryKey: () => ["referral"],
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
  h.referral = successQuery({ code: "AB7K2M", redeemed: false });
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

  test("every row wears that learner's own outfit, undressed when they have none", () => {
    // An outfit costs 40 Chai and used to be visible only to its buyer. These
    // rows are the audience. Three rows, three states: a dressed friend, the
    // caller in something else, and a learner who owns nothing — who gets the
    // canonical bird, never a blank or an initial.
    h.leaderboard = successQuery([
      { ...rival, equippedOutfit: "kurta", equippedAccessory: "pagdi" },
      { ...me, equippedOutfit: "sherwani" },
      third,
    ]);
    renderFriends(<Friends />);

    const rows = screen.getAllByTestId("row-mascot");
    expect(rows.map((r) => r.getAttribute("data-outfit"))).toEqual([
      "kurta",
      "sherwani",
      "none",
    ]);
    // The head slot travels with the garment: shipping only the outfit would
    // show a pagdi-wearing friend bare-headed.
    expect(rows[0].getAttribute("data-accessory")).toBe("pagdi");

    // And the outfit reaches the ART, not just the wrapper.
    const srcs = rows.map((r) =>
      Array.from(r.querySelectorAll("img")).map((i) => i.getAttribute("src")).join(" "),
    );
    expect(srcs[0]).toContain("outfits/kurta/mascot-wave.png");
    expect(srcs[1]).toContain("outfits/sherwani/mascot-wave.png");
    expect(srcs[2]).toContain("mascot-wave.png");
    expect(srcs[2]).not.toContain("outfits/");
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

describe("Add friend (by code)", () => {
  const meera: UserSummary = {
    id: "u1",
    displayName: "Meera",
    email: "meera@example.com",
  };

  test("there is no way to look a learner up by email", async () => {
    // Task #1111 retired email search from the product. If a field that takes
    // an address ever comes back to this page, this fails.
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(
      screen.queryByPlaceholderText("friend@email.com"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Friend's email/i)).not.toBeInTheDocument();
  });

  test("submitting a code sends a request with the normalized code", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      id: 3,
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
      user: meera,
    });
    h.sendRequest = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    // Typed sloppily on purpose: the client normalizes before sending.
    await user.type(screen.getByLabelText("Friend code"), " k7m2p9 ");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ data: { code: "K7M2P9" } }),
    );
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Request sent!" }),
    );
  });

  test("the request lands pending — the page never claims an instant friendship", async () => {
    // Load-bearing. Referral codes get broadcast on flyers and in group chats;
    // the accept step is the only thing standing between that and an open
    // friend list, so the success copy must not read as "you are now friends".
    const mutateAsync = vi.fn().mockResolvedValue({
      id: 3,
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
      user: meera,
    });
    h.sendRequest = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.type(screen.getByLabelText("Friend code"), "K7M2P9");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    const [[toastArg]] = h.toast.mock.calls as [[Record<string, string>]];
    expect(toastArg.title).toBe("Request sent!");
    expect(toastArg.description).toMatch(/like to be friends/i);
    expect(toastArg.description).not.toMatch(/you are now friends/i);
  });

  test("an unknown code shows the uniform rejection, revealing nothing", async () => {
    // The server answers unknown codes, near-misses and already-friended codes
    // identically. The client must not invent a more specific story.
    h.sendRequest = idleMutation({
      isError: true,
      error: new ApiError(404, {
        error: "That code didn't match. Check it and try again.",
      }),
    });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(
      await screen.findByText("That code didn't match. Check it and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already/i)).not.toBeInTheDocument();
  });

  test("a rate-limited attempt surfaces the server's wait message", async () => {
    h.sendRequest = idleMutation({
      isError: true,
      error: new ApiError(429, {
        error: "Too many code attempts. Try again in a little while.",
      }),
    });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(
      await screen.findByText(
        "Too many code attempts. Try again in a little while.",
      ),
    ).toBeInTheDocument();
  });

  test("a failed send surfaces a destructive toast", async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiError(400, { error: "That's your own friend code." }));
    h.sendRequest = idleMutation({ mutateAsync });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    await user.type(screen.getByLabelText("Friend code"), "K7M2P9");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't add that code",
          variant: "destructive",
        }),
      ),
    );
  });
});

/* ---------------------------- Your friend code -------------------------- */

describe("Your friend code", () => {
  test("shows the learner's own code, a QR, and copy/share actions", async () => {
    h.referral = successQuery({ code: "AB7K2M", redeemed: false });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    const panel = await screen.findByTestId("your-friend-code");
    expect(within(panel).getByTestId("friend-code")).toHaveTextContent("AB7K2M");
    expect(within(panel).getByTestId("friend-qr")).toBeInTheDocument();
    expect(within(panel).getByTestId("copy-friend-code")).toBeInTheDocument();
    expect(within(panel).getByTestId("share-friend-code")).toBeInTheDocument();
  });

  test("the QR encodes the join LINK, not the bare code", async () => {
    // A bare code in a QR does nothing for whoever scans it with an ordinary
    // camera app. Encoding the join link means any camera opens Bolo!.
    h.referral = successQuery({ code: "AB7K2M", redeemed: false });
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    const qr = await screen.findByTestId("friend-qr");
    const encoded = qr.getAttribute("data-value") ?? "";
    expect(encoded).toMatch(/\/join\/AB7K2M$/);
  });

  test("stays hidden until the code has loaded", async () => {
    h.referral = loadingQuery();
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    expect(screen.queryByTestId("your-friend-code")).not.toBeInTheDocument();
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

  test("a friend row shows their mascot in their outfit, not their initials", async () => {
    h.friends = successQuery([
      { ...friend, equippedOutfit: "saree", equippedAccessory: null },
      {
        friendshipId: 12,
        since: "2026-01-02T00:00:00.000Z",
        id: "f2",
        displayName: "Meera",
        email: "meera@example.com",
      },
    ]);
    const user = userEvent.setup();
    renderFriends(<Friends />);
    await openFriendsTab(user);

    const rows = screen.getAllByTestId("row-mascot");
    expect(rows.map((r) => r.getAttribute("data-outfit"))).toEqual([
      "saree",
      "none",
    ]);
    // The initials avatar is gone from these rows: "K" for Kabir would be it.
    expect(screen.queryByText("K")).not.toBeInTheDocument();
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
