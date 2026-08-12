import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
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
  repairOffer: undefined as unknown,
  repair: vi.fn() as ReturnType<typeof vi.fn>,
  repairHandlers: undefined as Record<string, unknown> | undefined,
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
  // Contextual streak-repair offer: controllable via h.repairOffer so each
  // test can set eligibility independently.
  useGetStreakRepair: () => ({
    data: h.repairOffer,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useRepairStreak: (opts?: { mutation?: Record<string, unknown> }) => {
    h.repairHandlers = opts?.mutation;
    return { mutate: h.repair, isPending: false };
  },
  getGetStreakRepairQueryKey: () => ["streak-repair"],
  getGetTokensQueryKey: () => ["tokens"],
}));

// Imported after the mocks are declared. ApiError is the real class: the
// shared mock passes non-hook exports straight through, so `instanceof`
// inside the refusal-copy mapper behaves exactly as it does at runtime.
import Home from "@/pages/home";
import { ApiError } from "@workspace/api-client-react";

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
  h.repairOffer = undefined;
  h.repair = vi.fn();
  h.repairHandlers = undefined;
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

describe("contextual streak repair offer (Ruling 2)", () => {
  // 2026-08-06 is a Thursday (today in the test run is 2026-08-07).
  const OFFER_THURSDAY = {
    eligible: true,
    missedDay: "2026-08-06",
    restoresStreakDays: 5,
    cost: 25,
    balance: 100,
  };

  test("absent while offer is still loading (data undefined)", () => {
    h.repairOffer = undefined;
    renderHome();
    expect(screen.queryByTestId("home-streak-repair-offer")).toBeNull();
  });

  test("absent when eligible is false (no repairable break)", () => {
    h.repairOffer = { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 };
    renderHome();
    expect(screen.queryByTestId("home-streak-repair-offer")).toBeNull();
  });

  test("shows banner with missed-day label and mend button when eligible", () => {
    h.repairOffer = OFFER_THURSDAY;
    renderHome();
    const banner = screen.getByTestId("home-streak-repair-offer");
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId("home-repair-streak")).toHaveTextContent("Mend · 25");
    expect(screen.getByText(/Thursday/)).toBeInTheDocument();
    expect(screen.getByText(/5-day/)).toBeInTheDocument();
  });

  test("pressing mend calls mutate() with no arguments", async () => {
    h.repairOffer = OFFER_THURSDAY;
    renderHome();
    await userEvent.setup().click(screen.getByTestId("home-repair-streak"));
    expect(h.repair).toHaveBeenCalledTimes(1);
    expect(h.repair.mock.calls[0]).toHaveLength(0);
  });

  // The tap IS the spend, so the balance has to be on screen next to the cost
  // before the learner commits 25 Chai from outside the wallet.
  test("shows the Chai balance beside the cost", () => {
    h.repairOffer = OFFER_THURSDAY;
    h.tokens = {
      balance: 40,
      stationPausesEquipped: 0,
      expressMultiplierActiveUntil: null,
    };
    renderHome();
    const balance = screen.getByTestId("home-repair-balance");
    expect(balance).toHaveTextContent("40");
    expect(balance).toHaveTextContent("Chai");
    expect(screen.getByTestId("home-repair-streak")).toHaveTextContent(
      "Mend · 25",
    );
  });

  test("reads the balance from the same token query as the rest of home", () => {
    h.repairOffer = OFFER_THURSDAY;
    h.tokens = {
      balance: 77,
      stationPausesEquipped: 0,
      expressMultiplierActiveUntil: null,
    };
    renderHome();
    // One query feeds the banner and the stall band alike; a second query
    // would let the two disagree about what the learner holds.
    expect(screen.getByTestId("home-repair-balance")).toHaveTextContent("77");
    expect(screen.getByTestId("chai-stall-balance")).toHaveTextContent("77");
  });

  test("degrades to the offer alone while the balance is unavailable", () => {
    h.repairOffer = OFFER_THURSDAY;
    h.tokens = undefined;
    renderHome();
    // Offer still actionable...
    expect(screen.getByTestId("home-streak-repair-offer")).toBeInTheDocument();
    expect(screen.getByTestId("home-repair-streak")).toHaveTextContent(
      "Mend · 25",
    );
    // ...but no placeholder and no zero beside a real spend button.
    expect(screen.queryByTestId("home-repair-balance")).toBeNull();
  });

  // A refusal used to read "Couldn't mend right now. Open the Chai wallet to
  // try again." for every cause, which sent a learner with empty pockets to
  // the wallet to be refused a second time. The server already names the
  // cause; the banner now says it.
  describe("refusals name the cause", () => {
    /** A 409 from POST /tokens/repair-streak, as the client would throw it. */
    function refusal(body: Record<string, unknown>) {
      return new ApiError(
        new Response(null, { status: 409, statusText: "Conflict" }),
        body,
        { method: "POST", url: "/api/tokens/repair-streak" },
      );
    }

    function failWith(error: unknown) {
      h.repairOffer = OFFER_THURSDAY;
      renderHome();
      act(() => {
        (h.repairHandlers?.onError as (e: unknown) => void)(error);
      });
    }

    test("empty pockets: names the gap and points at practice, not the wallet", () => {
      failWith(refusal({ error: "insufficient_tokens", balance: 3, cost: 25 }));
      expect(
        screen.getByText(
          "Not enough Chai to mend. You have 3, mending costs 25. Keep practicing to earn more.",
        ),
      ).toBeInTheDocument();
      // Never a dead end into the wallet, and never a Plus paywall.
      expect(screen.queryByText(/Chai wallet/)).toBeNull();
    });

    test("the window has closed: says so instead of inviting a retry", () => {
      failWith(refusal({ error: "repair_window_expired" }));
      expect(
        screen.getByText(
          "That day has slipped too far back to mend. Today starts the next one.",
        ),
      ).toBeInTheDocument();
    });

    test("a break, not a missed day: says so", () => {
      failWith(refusal({ error: "break_too_long" }));
      expect(
        screen.getByText(
          "That was a proper break, not a missed day. Today starts the next one.",
        ),
      ).toBeInTheDocument();
    });

    test("an unrecognised failure keeps the honest generic line", () => {
      failWith(new Error("network down"));
      expect(
        screen.getByText("That repair did not go through. Try again in a moment."),
      ).toBeInTheDocument();
    });

    test("the notice expires and hands the Mend button back", () => {
      vi.useFakeTimers();
      try {
        h.repairOffer = OFFER_THURSDAY;
        renderHome();
        act(() => {
          (h.repairHandlers?.onError as (e: unknown) => void)(
            refusal({ error: "insufficient_tokens", balance: 3, cost: 25 }),
          );
        });
        // The notice replaces the offer row, so the button is gone while it is up.
        expect(screen.queryByTestId("home-repair-streak")).toBeNull();
        act(() => {
          vi.advanceTimersByTime(4000);
        });
        // Earning the shortfall has to lead somewhere: the offer comes back.
        expect(screen.getByTestId("home-repair-streak")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
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
    // Task #1057: the bar is four tiles — Day Streak, Total XP, Mastered,
    // Chai. Speaking streak is still tracked server-side, but it no longer
    // earns a permanent tile here.
    for (const label of ["Day Streak", "Total XP", "Mastered", "Chai"]) {
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
    expect(within(row).queryByText(/speaking streak/i)).toBeNull();
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
    // affordance next to the label. The three static cells stay plain divs.
    expect(cell.tagName).toBe("BUTTON");
    expect(cell.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    for (const staticId of ["Day Streak", "Total XP", "Mastered"]) {
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

  // Build 37: the figures left of Chai all live on /progress, so the whole
  // run of them is one link into that page. Chai stays outside it — it opens
  // the wallet, and nesting a button inside a link would break both.
  // Task #1057 dropped Speaking Streak, so the run is three figures.
  test("the three progress figures are one link to /progress", () => {
    h.summary = {
      currentStreakDays: 3,
      speakingStreakDays: 2,
      xp: 120,
      phrasesMastered: 8,
      attemptsToday: 0,
    };
    renderHome();
    const row = bannerRow();
    const link = within(row).getByTestId("stats-progress-link");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/progress");
    for (const label of ["Day Streak", "Total XP", "Mastered"]) {
      expect(link.contains(within(row).getByText(label))).toBe(true);
    }
    expect(link.contains(within(row).getByTestId("stat-chai"))).toBe(false);
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

  // Task 1044: the lesson language chip and the audio settings gear belong to
  // practice screens only. Home must not grow a second language affordance.
  test("no lesson language chip and no audio settings gear on home", () => {
    renderHome();
    expect(screen.queryByTestId("lesson-language-chip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Audio settings" })).toBeNull();
  });
});
