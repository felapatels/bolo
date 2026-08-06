import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS, upgradeRequiredError } from "./fixtures";

// Regression harness for the home stats banner (spinner-fix follow-up).
// The banner is ALWAYS mounted with its height reserved; the cell row is
// invisible until /progress/summary resolves. These tests pin down the three
// states: data → visible cells, pending → reserved invisible shell, error →
// visible "couldn't load" feedback with a retry (never a silent empty shell).
const h = vi.hoisted(() => ({
  summary: undefined as unknown,
  summaryIsError: false,
  summaryError: null as unknown,
  refetchSummary: vi.fn(),
  categories: undefined as unknown,
  tokens: undefined as unknown,
}));

// Home renders BottomNav → XpCounter; stub it so this test doesn't need a
// react-query provider.
vi.mock("@/components/XpCounter", () => ({
  XpCounter: () => null,
}));

// The one-time name prompt (Build 30 batch 3) needs a react-query provider
// and profile hooks; it is out of scope for the stats banner.
vi.mock("@/components/name-prompt-card", () => ({
  NamePromptCard: () => null,
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

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetEntitlements: () => ({ data: PLUS_ENTITLEMENTS, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useUpdateAccountPreferences: () => ({ mutate: vi.fn(), isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetProgressSummary: () => ({
    data: h.summary,
    isLoading: !h.summary && !h.summaryIsError,
    isError: h.summaryIsError,
    error: h.summaryError,
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
  // ONE token query feeds both Chai surfaces on this page (the stat cell and
  // the stall band), which is exactly what the parity test below asserts.
  useGetTokens: () => ({
    data: h.tokens,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
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
  h.summaryError = null;
  h.refetchSummary.mockClear();
  h.tokens = undefined;
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

  // Wallet polish item 4: Chai is a fifth full stat cell that opens the
  // wallet sheet; the 5B corner chip is gone.
  test("the Chai cell renders in the stats row and opens the wallet sheet", async () => {
    h.summary = {
      currentStreakDays: 3,
      speakingStreakDays: 2,
      xp: 120,
      phrasesMastered: 8,
      attemptsToday: 0,
    };
    renderHome();
    const row = bannerRow();
    const cell = within(row).getByTestId("stat-chai");
    // Tokens are idle-mocked here, so the count renders the loading dash.
    expect(within(cell).getByText("-")).toBeInTheDocument();
    expect(within(cell).getByText("Chai")).toBeInTheDocument();
    // Tappable cell contract: a real button element with a trailing chevron
    // affordance next to the label. The four static cells stay plain divs.
    expect(cell.tagName).toBe("BUTTON");
    expect(cell.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    for (const staticId of ["Day Streak", "Speaking Streak", "Total XP", "Mastered"]) {
      const staticCell = within(row).getByText(staticId).closest("div");
      expect(staticCell?.querySelector("svg.lucide-chevron-right")).toBeNull();
    }
    // The old corner chip must be gone.
    expect(screen.queryByTestId("chai-balance-chip")).toBeNull();
    // Tapping the cell opens the wallet sheet.
    expect(screen.queryByTestId("chai-wallet-sheet")).toBeNull();
    await userEvent.setup().click(cell);
    expect(screen.getByTestId("chai-wallet-sheet")).toBeInTheDocument();
  });

  // The band names itself and shows the balance, so it has to read from the
  // page's ONE token query — a second source could drift from the stat cell
  // and from the wallet after a spend.
  test("the stall band shows the same balance as the Chai cell", () => {
    h.summary = {
      currentStreakDays: 3,
      speakingStreakDays: 2,
      xp: 120,
      phrasesMastered: 8,
      attemptsToday: 0,
    };
    h.tokens = {
      balance: 12,
      stationPausesEquipped: 0,
      expressMultiplierActiveUntil: null,
    };
    renderHome();
    expect(screen.getByTestId("chai-stall-title")).toHaveTextContent(
      "Chacha-ji's Chai Stall",
    );
    expect(screen.getByTestId("chai-stall-balance")).toHaveTextContent("12");
    expect(
      within(bannerRow()).getByTestId("stat-chai"),
    ).toHaveTextContent("12");
  });

  // Owner correction (Aug 6): the stall band above the boarding pass is a
  // second door into the SAME wallet sheet — no new wallet surface.
  test("the stall band opens the same wallet sheet", async () => {
    renderHome();
    expect(screen.queryByTestId("chai-wallet-sheet")).toBeNull();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", {
          name: "Chacha-ji's Chai stall — open your Chai wallet",
        }),
      );
    expect(screen.getByTestId("chai-wallet-sheet")).toBeInTheDocument();
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

  // 86ae84f restoration: a locked-language 402 is a plan boundary, not an
  // outage — home must render the showroom/upgrade state, never the
  // error-retry shell (retrying a 402 can never succeed).
  test("locked-language 402 renders the showroom/upgrade state, not the retry shell", () => {
    h.summaryIsError = true;
    h.summaryError = upgradeRequiredError("language_locked", "Unlock this language");
    renderHome();
    // Reserved cells stay hidden, like every no-data state.
    expect(bannerRow().getAttribute("aria-hidden")).toBe("true");
    // No error framing, no retry.
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    // Showroom + upgrade affordances instead.
    expect(screen.getByRole("link", { name: /preview the journey/i })).toHaveAttribute(
      "href",
      "/journey",
    );
    expect(screen.getByRole("link", { name: /^unlock$/i })).toBeInTheDocument();
  });
});
