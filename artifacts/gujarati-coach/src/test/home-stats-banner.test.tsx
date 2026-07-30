import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Regression harness for the home stats banner (spinner-fix follow-up).
// The banner is ALWAYS mounted with its height reserved; the cell row is
// invisible until /progress/summary resolves. These tests pin down the three
// states: data → visible cells, pending → reserved invisible shell, error →
// visible "couldn't load" feedback with a retry (never a silent empty shell).
const h = vi.hoisted(() => ({
  summary: undefined as unknown,
  summaryIsError: false,
  refetchSummary: vi.fn(),
  categories: undefined as unknown,
}));

// Home renders BottomNav → XpCounter; stub it so this test doesn't need a
// react-query provider.
vi.mock("@/components/XpCounter", () => ({
  XpCounter: () => null,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { firstName: "Test" } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    ],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

// The language picker persists explicit picks (B1): it pulls the preferences
// mutation + query client, which this suite never asserts on — stub them.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetEntitlements: () => ({ data: PLUS_ENTITLEMENTS, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useUpdateAccountPreferences: () => ({ mutate: vi.fn(), isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetProgressSummary: () => ({
    data: h.summary,
    isLoading: !h.summary && !h.summaryIsError,
    isError: h.summaryIsError,
    isPlaceholderData: false,
    refetch: h.refetchSummary,
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
  useListCategoryLessonGroups: () => ({ data: undefined, isLoading: false, isError: true }),
}));

// Imported after the mocks are declared.
import Home from "@/pages/home";

function renderHome(): ReturnType<typeof render> {
  const { hook } = memoryLocation({ path: "/app", record: true });
  return render(<Router hook={hook}>{(<Home />) as ReactElement}</Router>);
}

/** The keyed cell row that toggles `invisible` / aria-hidden on summary. */
function bannerRow() {
  const label = screen.getByText("Day Streak");
  const row = label.closest("div[aria-hidden]");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

beforeEach(() => {
  h.summary = undefined;
  h.summaryIsError = false;
  h.refetchSummary.mockClear();
  h.categories = [
    {
      id: 1,
      title: "Greetings",
      titleNative: null,
      iconName: "HandHeart",
      accent: null,
      phraseCount: 5,
      masteredCount: 2,
    },
  ];
});

describe("home stats banner", () => {
  test("renders the stat cells when summary resolves with data", () => {
    h.summary = {
      currentStreakDays: 3,
      speakingStreakDays: 2,
      xp: 120,
      phrasesMastered: 8,
      attemptsToday: 0,
    };
    renderHome();
    const row = bannerRow();
    expect(row.getAttribute("aria-hidden")).toBe("false");
    expect(row.className).not.toMatch(/\binvisible\b/);
    expect(within(row).getByText("120")).toBeInTheDocument();
    expect(within(row).getByText("8")).toBeInTheDocument();
    expect(within(row).getByText("Speaking Streak")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
  });

  test("keeps the reserved shell hidden while summary is pending", () => {
    renderHome();
    const row = bannerRow();
    expect(row.getAttribute("aria-hidden")).toBe("true");
    expect(row.className).toMatch(/\binvisible\b/);
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
  });

  test("summary failure shows visible feedback with a working retry", async () => {
    h.summaryIsError = true;
    renderHome();
    // The reserved cells stay hidden…
    expect(bannerRow().getAttribute("aria-hidden")).toBe("true");
    // …but the failure is now VISIBLE feedback, not a silent empty shell.
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(h.refetchSummary).toHaveBeenCalledTimes(1);
  });
});
