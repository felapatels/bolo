import { describe, test, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// THE FEED PAGE, TO THE PHONE (2026-08-30, owner: "feed on web is not updated
// to match mobile styling"). Pins the shape mobile's LeaderboardScreen has:
// (1) the head is one row: back, the words, Bolo at the right; the bubble
//     hangs under the words;
// (2) the order down the page is scope, XP / Streak pills, the race bar, then
//     the Feed / Flex segments, then the board;
// (3) the segments are wide pills with the tab roles, Flex only when dressed;
// (4) Flex shows the dressed bird and Feed shows the board and the Latest feed.
const h = vi.hoisted(() => ({
  dressed: true,
  entries: [
    { userId: "u1", displayName: "Learner 8478", username: "learner8478", xp: 356, currentStreakDays: 4, reachedAt: null, rank: 1, isSelf: false },
    { userId: "u2", displayName: "Learner 4020", username: "learner4020", xp: 312, currentStreakDays: 2, reachedAt: null, rank: 2, isSelf: false },
    { userId: "me", displayName: "Alex", username: "alex", xp: 81, currentStreakDays: 1, reachedAt: null, rank: 3, isSelf: true },
  ],
}));

vi.mock("@/components/mascot", () => ({
  Mascot: (p: { pose: string }) => <div data-testid="mascot" data-pose={p.pose} />,
}));
vi.mock("@/components/mascot-avatar", () => ({
  MascotAvatar: () => <div data-testid="mascot-avatar" />,
}));
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: undefined,
    languages: [],
    setActiveLang: () => {},
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-equipped-outfit", () => ({
  useEquippedOutfit: () =>
    h.dressed ? { garment: "diwali-kurta", accessory: null } : { garment: null, accessory: null },
}));
vi.mock("@/components/feed-tabs-coach", () => ({
  FeedTabsCoach: () => null,
  useFeedTabsCoach: () => ({ pending: false, dismiss: () => {} }),
}));
vi.mock("@/components/board-scope", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useMyPublicName: () => ({ username: "alex", loaded: true }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));
vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetFriendsLeaderboard: () => ({
    data: h.entries,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  getGetFriendsLeaderboardQueryKey: () => ["leaderboard"],
  useGetFriendsFeed: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  getGetFriendsFeedQueryKey: () => ["feed"],
  useGetOutfits: () => ({ data: { outfits: [{ id: "diwali-kurta", name: "Diwali kurta" }] } }),
  useListBadges: () => ({ data: [] }),
  getListBadgesQueryKey: () => ["badges"],
}));

import Leaderboard from "@/pages/leaderboard";

function renderPage(path = "/leaderboard") {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <Leaderboard />
    </Router>,
  );
}

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  h.dressed = true;
  localStorage.clear();
});

describe("the Feed page, to the phone", () => {
  test("the head is one row with Bolo at the right, and the bubble hangs under the words", () => {
    renderPage();
    const head = screen.getByTestId("board-head");
    expect(within(head).getByLabelText("Back to home")).toBeTruthy();
    expect(within(head).getByRole("heading", { level: 1 })).toHaveTextContent("Leaderboard");
    expect(within(head).getByText("Everyone, this week")).toBeTruthy();
    const bird = within(head).getByTestId("mascot");
    expect(bird.getAttribute("data-pose")).toBe("thumbsup");
    const bubble = screen.getByTestId("board-bubble");
    expect(follows(head, bubble)).toBe(true);
    expect(bubble.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  test("scope, then XP / Streak, then the race bar, then the Feed / Flex segments, then the board", () => {
    renderPage();
    const scope = screen.getByTestId("board-scope-all");
    const metric = screen.getByTestId("board-metric-xp");
    const race = screen.getByTestId("weekly-race-bar");
    const tabs = screen.getByTestId("board-tabs");
    const board = screen.getByTestId("leaderboard-board");
    expect(follows(scope, metric)).toBe(true);
    expect(follows(metric, race)).toBe(true);
    expect(follows(race, tabs)).toBe(true);
    expect(follows(tabs, board)).toBe(true);
    // The Latest feed sits under the board on the Feed tab.
    expect(follows(board, screen.getByText("Latest"))).toBe(true);
  });

  test("the segments are wide pills with the tab roles, Feed chosen first", () => {
    renderPage();
    const tabs = within(screen.getByTestId("board-tabs")).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(["Feed", "Flex"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].className).toContain("bg-primary");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].className).toContain("bg-card");
  });

  test("Flex shows the dressed bird and what he wears; Feed brings the board back", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("board-tab-flex"));
    expect(screen.getByTestId("board-panel-flex")).toBeTruthy();
    expect(screen.getByText("Looking sharp")).toBeTruthy();
    expect(screen.getByText("Diwali kurta")).toBeTruthy();
    expect(screen.queryByTestId("leaderboard-board")).toBeNull();
    fireEvent.click(screen.getByTestId("board-tab-feed"));
    expect(screen.getByTestId("leaderboard-board")).toBeTruthy();
  });

  test("an undressed Bolo has no Flex segment, and ?tab=flex lands on Feed", () => {
    h.dressed = false;
    renderPage("/leaderboard?tab=flex");
    const tabs = within(screen.getByTestId("board-tabs")).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(["Feed"]);
    expect(screen.getByTestId("board-panel-feed")).toBeTruthy();
  });
});
