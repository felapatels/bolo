import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Build 31 one-path restructure: home shows NO topic grid. Directly below the
// boarding pass sits one quiet bordered Phrasebook door card (book icon,
// title, subtitle, chevron) with a chip row previewing the first 3 topics
// (mastered/total shown only where progress exists) plus a "+N more" chip.
// The card opens /phrasebook; chips deep-link to /learn/:id.
const h = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock("@/components/XpCounter", () => ({ XpCounter: () => null }));
vi.mock("@/components/name-prompt-card", () => ({ NamePromptCard: () => null }));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { firstName: "Test" } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

vi.mock("@/lib/analytics", async () => {
  const { ANALYTICS_EVENTS: events } = await import("@/lib/analyticsEvents");
  return {
    initAnalytics: vi.fn(),
    identifyUser: vi.fn(),
    track: h.track,
    trackOnce: vi.fn(),
    ANALYTICS_EVENTS: events,
  };
});

// Reduced motion: skips the cold-load brand splash so content is on screen
// at first paint (splash behavior is pinned by home-brand-splash.test.tsx).
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReducedMotion: () => true,
}));

const CATS = [
  { id: 1, title: "Greetings & Manners", titleNative: null, iconName: "HandHeart", accent: null, phraseCount: 5, masteredCount: 2 },
  { id: 2, title: "Family", titleNative: null, iconName: "Users", accent: null, phraseCount: 5, masteredCount: 0 },
  { id: 3, title: "Numbers 1-10", titleNative: null, iconName: "Hash", accent: null, phraseCount: 5, masteredCount: 0 },
  { id: 4, title: "Food & Eating", titleNative: null, iconName: "Utensils", accent: null, phraseCount: 5, masteredCount: 0 },
];

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetEntitlements: () => ({ data: PLUS_ENTITLEMENTS, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useUpdateAccountPreferences: () => ({ mutate: vi.fn(), isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetProgressSummary: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  getGetProgressSummaryQueryKey: () => ["summary"],
  useGetAccount: () => ({ data: undefined }),
  useListCategories: () => ({ data: CATS, isLoading: false }),
  getListCategoriesQueryKey: () => ["categories"],
  useListRecentAttempts: () => ({ data: [], isLoading: false }),
  useListReviewPhrases: () => ({ data: [], isLoading: false }),
  getListReviewPhrasesQueryKey: () => ["review"],
  useListBadges: () => ({ data: undefined, isLoading: false }),
  useListIncomingFriendRequests: () => ({ data: [], isLoading: false }),
  useListCategoryLessonGroups: () => ({
    data: { lessonGroups: [] },
    isLoading: false,
    isError: false,
  }),
}));

// Imported after the mocks are declared.
import Home from "@/pages/home";

function renderHome() {
  const { hook, history } = memoryLocation({ path: "/app", record: true });
  const ui = (<Router hook={hook}>{(<Home />) as ReactElement}</Router>) as ReactElement;
  return { ...render(ui), history };
}

beforeEach(() => {
  h.track.mockClear();
});

describe("home Phrasebook door (build 31)", () => {
  test("renders the door card with title, subtitle, and a /phrasebook link", () => {
    renderHome();
    expect(screen.getByTestId("phrasebook-door")).toBeInTheDocument();
    expect(screen.getByText("Phrasebook")).toBeInTheDocument();
    expect(screen.getByText("Browse and practice any topic")).toBeInTheDocument();
    expect(screen.getByTestId("link-phrasebook-door").getAttribute("href")).toBe(
      "/phrasebook",
    );
  });

  test("chip row previews the first 3 topics; mastered/total only where progress exists", () => {
    renderHome();
    const chip1 = screen.getByTestId("phrasebook-chip-1");
    expect(chip1).toHaveTextContent("Greetings & Manners");
    expect(chip1).toHaveTextContent("2/5");
    expect(chip1.getAttribute("href")).toBe("/learn/1");

    const chip2 = screen.getByTestId("phrasebook-chip-2");
    expect(chip2).toHaveTextContent("Family");
    expect(chip2).not.toHaveTextContent("0/5");

    expect(screen.getByTestId("phrasebook-chip-3")).toHaveTextContent("Numbers 1-10");
    // Fourth topic is not previewed as a chip; it is folded into "+N more".
    expect(screen.queryByTestId("phrasebook-chip-4")).toBeNull();
    const more = screen.getByTestId("phrasebook-chip-more");
    expect(more).toHaveTextContent("+1 more");
    expect(more.getAttribute("href")).toBe("/phrasebook");
  });

  test("the old topic grid is gone from home", () => {
    renderHome();
    expect(screen.queryByText("Browse by topic")).toBeNull();
    // Grid cards carried the topic's percent progress; chips never do.
    expect(screen.queryByText("40%")).toBeNull();
    // The 4th topic only existed in the grid; the door previews just 3.
    expect(screen.queryByText("Food & Eating")).toBeNull();
  });

  test("tapping a chip fires topic_opened with the home_chip source", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("phrasebook-chip-1"));
    expect(h.track).toHaveBeenCalledWith("topic_opened", {
      categoryId: 1,
      language: "gu",
      source: "home_chip",
    });
  });
});
