import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Task #906: the home topic grid is gone, replaced by a single Phrasebook
// door card that opens the /phrasebook library. Pins the behavior contract:
// (1) home renders a Phrasebook door linking to /phrasebook, and the old
//     "Browse by topic" grid is not rendered;
// (2) the chip row shows the first three topics as deep links into
//     /learn/:id, with mastered/total shown only when mastery has started;
// (3) with more than three topics, a "+N more" chip links to /phrasebook;
// (4) opening home does NOT fire the phrasebook_opened event (only the
//     library surface itself does).
const h = vi.hoisted(() => ({
  track: vi.fn(),
  categories: [] as unknown[],
}));

const CATS = [
  { id: 1, title: "Greetings & Manners", titleNative: null, iconName: "HandHeart", accent: null, phraseCount: 5, masteredCount: 2 },
  { id: 2, title: "Family", titleNative: null, iconName: "Users", accent: null, phraseCount: 6, masteredCount: 0 },
  { id: 3, title: "Numbers 1-10", titleNative: null, iconName: "Hash", accent: null, phraseCount: 10, masteredCount: 0 },
  { id: 4, title: "Food & Eating", titleNative: null, iconName: "Utensils", accent: null, phraseCount: 7, masteredCount: 1 },
];

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
  useListCategories: () => ({ data: h.categories, isLoading: false }),
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

import Home from "@/pages/home";
import { __resetBrandSplashForTests } from "@/components/brand-splash";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

function renderHome() {
  const { hook } = memoryLocation({ path: "/app", record: true });
  return render(
    (<Router hook={hook}>{(<Home />) as ReactElement}</Router>) as ReactElement,
  );
}

beforeEach(() => {
  h.track.mockClear();
  h.categories = [...CATS];
  __resetBrandSplashForTests();
});

describe("home Phrasebook door (task 906)", () => {
  test("renders the door card linking to /phrasebook and no topic grid", () => {
    renderHome();
    const door = screen.getByRole("region", { name: "Phrasebook" });
    expect(door).toBeInTheDocument();
    // The header row is a link into the library.
    const links = Array.from(door.querySelectorAll('a[href="/phrasebook"]'));
    expect(links.length).toBeGreaterThan(0);
    expect(screen.getByText("Browse and practice any topic")).toBeInTheDocument();
    // The old grid heading and its full topic list are gone from home.
    expect(screen.queryByText("Browse by topic")).toBeNull();
    expect(screen.queryByText("Food & Eating")).toBeNull();
  });

  test("chips deep-link the first three topics; mastery shows only once started", () => {
    renderHome();
    const door = screen.getByRole("region", { name: "Phrasebook" });
    for (const cat of CATS.slice(0, 3)) {
      const chip = Array.from(door.querySelectorAll("a")).find(
        (a) => a.getAttribute("href") === `/learn/${cat.id}`,
      );
      expect(chip, `chip for ${cat.title}`).toBeTruthy();
      expect(chip!).toHaveTextContent(cat.title);
    }
    // Greetings has mastery underway: shows 2/5. Family has none: no 0/6.
    expect(door).toHaveTextContent("2/5");
    expect(door.textContent).not.toContain("0/6");
  });

  test("a fourth topic collapses into a +N more chip to /phrasebook", () => {
    renderHome();
    const more = screen.getByText("+1 more");
    expect(more.closest("a")).toHaveAttribute("href", "/phrasebook");
  });

  test("exactly three topics renders no +N more chip", () => {
    h.categories = CATS.slice(0, 3);
    renderHome();
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  test("home does not fire phrasebook_opened", () => {
    renderHome();
    const fired = h.track.mock.calls.map((c) => c[0]);
    expect(fired).not.toContain(ANALYTICS_EVENTS.PHRASEBOOK_OPENED);
  });
});
