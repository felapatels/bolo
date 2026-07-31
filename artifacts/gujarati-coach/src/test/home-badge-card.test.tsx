import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Task 919 pins, two surfaces:
// (1) the home latest-badge card: activating it lands on /progress, and the
//     return path the app relies on (the always-mounted nav's Home tab, since
//     Progress is itself a primary tab under AppShell) actually works;
// (2) the shared UpgradeCard title/badge row: the ALL-ACCESS pill renders and
//     the row is allowed to wrap, so the never-shrink pill yields to the next
//     line at narrow widths instead of clipping the card or squeezing the
//     title into one-word-per-line wrapping. jsdom cannot measure real
//     layout; the wrap-enabling structure is what these tests can pin, and
//     qa/task919-shots.mjs verifies the rendered result at three widths.

const h = vi.hoisted(() => ({
  badges: [] as unknown[],
}));

// BottomNav renders XpCounter and the LanguagePicker trigger; both pull
// react-query providers this suite does not need.
vi.mock("@/components/XpCounter", () => ({ XpCounter: () => null }));
vi.mock("@/components/language-picker", () => ({ LanguagePicker: () => null }));
// The one-time name prompt needs profile hooks; out of scope here.
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

vi.mock("@workspace/api-client-react", async () => {
  const { apiClientMockDefaults } = await import(
    "@/test-helpers/api-client-mock"
  );
  return {
    ...apiClientMockDefaults,
    useGetEntitlements: () => ({ data: PLUS_ENTITLEMENTS, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useUpdateAccountPreferences: () => ({ mutate: vi.fn(), isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetProgressSummary: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  getGetProgressSummaryQueryKey: () => ["summary"],
  useGetAccount: () => ({ data: undefined }),
  useListCategories: () => ({
    data: [
      {
        id: 1,
        title: "Greetings",
        titleNative: null,
        iconName: "HandHeart",
        accent: null,
        phraseCount: 5,
        masteredCount: 2,
      },
    ],
    isLoading: false,
  }),
  getListCategoriesQueryKey: () => ["categories"],
  useListRecentAttempts: () => ({ data: [], isLoading: false }),
  useListReviewPhrases: () => ({ data: [], isLoading: false }),
  getListReviewPhrasesQueryKey: () => ["review"],
  useListBadges: () => ({ data: h.badges, isLoading: false }),
  useListIncomingFriendRequests: () => ({ data: [], isLoading: false }),
  useListCategoryLessonGroups: () => ({ data: undefined, isLoading: false, isError: true }),
  };
});

// Imported after the mocks are declared.
import Home from "@/pages/home";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UpgradeCard, PlusPill } from "@/components/plus";

beforeEach(() => {
  h.badges = [
    {
      key: "first_phrase",
      title: "First Words",
      description: "Master your first phrase",
      iconName: "Star",
      earned: true,
      earnedAt: "2026-07-30T10:00:00.000Z",
      progressCurrent: 5,
      progressTarget: 5,
    },
  ];
});

// Mirrors AppShell: the page swaps while BottomNav stays mounted, so the nav
// is exactly what a learner arriving on /progress can use to get back.
function renderHomeWithNav() {
  const { hook, history } = memoryLocation({ path: "/app", record: true });
  const utils = render(
    <Router hook={hook}>
      <Home />
      <BottomNav />
    </Router>,
  );
  return { ...utils, history };
}

const currentPath = (history: string[]) => history[history.length - 1];

describe("home latest-badge card", () => {
  test("activating the badge card lands on Progress with a working nav return", async () => {
    const user = userEvent.setup();
    const { history } = renderHomeWithNav();

    // The card surfaces the latest earned badge and links to /progress.
    const card = screen.getByText("Latest badge").closest("a");
    expect(card).not.toBeNull();
    expect(screen.getByText("First Words")).toBeInTheDocument();

    await user.click(card as HTMLElement);
    expect(currentPath(history)).toBe("/progress");

    // On /progress the always-mounted nav marks Progress active and keeps a
    // functioning Home tab as the return path.
    const progressTab = screen.getByRole("link", { name: /Progress/i });
    expect(progressTab).toHaveClass("text-secondary");
    const homeTab = screen.getByRole("link", { name: /Home/i });
    await user.click(homeTab);
    expect(currentPath(history)).toBe("/app");
  });

  test("no earned badge renders no badge card", () => {
    h.badges = [];
    renderHomeWithNav();
    expect(screen.queryByText("Latest badge")).not.toBeInTheDocument();
  });
});

describe("UpgradeCard title/badge row (task 919 reflow)", () => {
  function renderCard() {
    const { hook } = memoryLocation({ path: "/app" });
    return render(
      <Router hook={hook}>
        <UpgradeCard
          icon={<span data-testid="icon" />}
          title="Review your weakest phrases"
          description="All-Access builds smart review sessions from the phrases you find trickiest, so they actually stick."
          href="/upgrade?plan=plus"
        />
      </Router>,
    );
  }

  test("renders the badge, and the title row is allowed to wrap so the pill yields instead of clipping", () => {
    renderCard();

    // Badge present inside the card.
    const pill = screen.getByText("All-Access");
    expect(pill).toBeInTheDocument();
    // The pill itself keeps its never-shrink contract (other call sites,
    // like the 360px language picker, rely on it).
    expect(pill.closest("span")).toHaveClass("shrink-0", "whitespace-nowrap");

    // The row containing title + pill must be a wrapping flex row: that is
    // what lets the fixed-width pill drop below the title at narrow widths
    // rather than overlapping it or overflowing the card.
    const title = screen.getByText("Review your weakest phrases");
    const row = title.parentElement as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    // And the title may shrink within its line (no one-word-per-line squeeze
    // forced by an unshrinkable sibling).
    expect(title.className).toContain("min-w-0");

    // Link target untouched.
    expect(title.closest("a")).toHaveAttribute("href", "/upgrade?plan=plus");
  });

  test("PlusPill keeps its compact never-wrap shape globally", () => {
    const { hook } = memoryLocation({ path: "/app" });
    render(
      <Router hook={hook}>
        <PlusPill />
      </Router>,
    );
    const pill = screen.getByText("All-Access");
    expect(pill.closest("span")).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
      "inline-flex",
    );
  });
});
