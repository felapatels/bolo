import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import {
  FREE_ENTITLEMENTS,
  PLUS_ENTITLEMENTS,
  TRIALING_ENTITLEMENTS,
} from "./fixtures";

// Mutable state the module mocks read from, so each test can set the exact
// server snapshot / data it needs before rendering.
const h = vi.hoisted(() => ({
  entitlements: undefined as unknown,
  languages: [] as Array<{ code: string; name: string; nativeName: string }>,
  activeLang: "gu",
  summary: undefined as unknown,
  categories: undefined as unknown,
  attempts: undefined as unknown,
  reviewPhrases: undefined as unknown,
  badges: undefined as unknown,
  analytics: undefined as unknown,
  setActiveLang: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { firstName: "Test" } }),
  useClerk: () => ({ signOut: h.signOut }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: h.languages,
    activeLang: h.activeLang,
    activeLanguage: h.languages.find((l) => l.code === h.activeLang),
    setActiveLang: h.setActiveLang,
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetEntitlements: () => ({ data: h.entitlements, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useGetProgressSummary: () => ({ data: h.summary, isLoading: false }),
  useListCategories: () => ({ data: h.categories, isLoading: false }),
  useListRecentAttempts: () => ({ data: h.attempts, isLoading: false }),
  useListReviewPhrases: () => ({ data: h.reviewPhrases, isLoading: false }),
  getListReviewPhrasesQueryKey: () => ["review"],
  useListBadges: () => ({ data: h.badges, isLoading: false }),
  useGetProgressAnalytics: () => ({ data: h.analytics, isLoading: false }),
  useListIncomingFriendRequests: () => ({ data: [], isLoading: false }),
}));

// Imported after the mocks are declared.
import { LanguagePicker } from "@/components/language-picker";
import { AdvancedAnalytics } from "@/components/advanced-analytics";
import { BadgesGallery } from "@/components/badges-gallery";
import Home from "@/pages/home";

function renderWithRouter(ui: ReactElement, path = "/app") {
  const { hook, history } = memoryLocation({ path, record: true });
  const utils = render(<Router hook={hook}>{ui}</Router>);
  return { ...utils, history };
}

function currentPath(history: string[]) {
  return history[history.length - 1];
}

beforeEach(() => {
  h.entitlements = undefined;
  h.languages = [
    { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  ];
  h.activeLang = "gu";
  h.summary = { currentStreakDays: 3, xp: 120, phrasesMastered: 8 };
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
  h.attempts = [];
  h.reviewPhrases = [];
  h.badges = undefined;
  h.analytics = undefined;
  h.setActiveLang.mockClear();
  h.signOut.mockClear();
});

describe("Language picker gating", () => {
  test("Free plan locks disallowed languages and routes them to /upgrade", async () => {
    h.entitlements = FREE_ENTITLEMENTS;
    const user = userEvent.setup();
    const { history } = renderWithRouter(<LanguagePicker />);

    await user.click(screen.getByTitle("Change language"));

    const hindiButton = screen.getByText("Hindi").closest("button")!;
    // A locked language reads as aspirational, not broken: it wears the Plus pill.
    expect(within(hindiButton).getByText("Plus")).toBeInTheDocument();

    await user.click(hindiButton);

    expect(currentPath(history)).toBe("/upgrade");
    expect(h.setActiveLang).not.toHaveBeenCalled();
  });

  test("Plus plan unlocks the language and selects it without leaving", async () => {
    h.entitlements = PLUS_ENTITLEMENTS;
    const user = userEvent.setup();
    const { history } = renderWithRouter(<LanguagePicker />);

    await user.click(screen.getByTitle("Change language"));

    const hindiButton = screen.getByText("Hindi").closest("button")!;
    expect(within(hindiButton).queryByText("Plus")).not.toBeInTheDocument();

    await user.click(hindiButton);

    expect(h.setActiveLang).toHaveBeenCalledWith("hi");
    expect(currentPath(history)).not.toBe("/upgrade");
  });
});

describe("Advanced analytics gating", () => {
  test("Free plan shows a locked upgrade card linking to /upgrade", () => {
    h.entitlements = FREE_ENTITLEMENTS;
    renderWithRouter(<AdvancedAnalytics lang="gu" />);

    const cta = screen.getByText(/See your full breakdown/i);
    expect(cta.closest("a")).toHaveAttribute("href", "/upgrade");
    // The unlocked panel's "Mastery by topic" heading must be absent (the free
    // card's description mentions the phrase, so match on the heading role).
    expect(
      screen.queryByRole("heading", { name: /Mastery by topic/i }),
    ).not.toBeInTheDocument();
  });

  test("Plus plan unlocks the real analytics panel", () => {
    h.entitlements = PLUS_ENTITLEMENTS;
    h.analytics = {
      categories: [
        {
          categoryId: 1,
          title: "Greetings",
          phraseCount: 4,
          masteredCount: 2,
          averageScore: 88,
        },
      ],
      daily: [],
    };
    renderWithRouter(<AdvancedAnalytics lang="gu" />);

    expect(screen.getByText(/Mastery by topic/i)).toBeInTheDocument();
    expect(screen.queryByText(/See your full breakdown/i)).not.toBeInTheDocument();
  });
});

describe("Badges gallery gating", () => {
  const badges = [
    {
      key: "first_words",
      title: "First Words",
      description: "Master your first phrase",
      iconName: "Star",
      earned: false,
      earnedAt: null,
      progressCurrent: 1,
      progressTarget: 5,
    },
  ];

  test("Free plan shows the exclusive Plus-badges teaser linking to /upgrade", () => {
    h.entitlements = FREE_ENTITLEMENTS;
    h.badges = badges;
    renderWithRouter(<BadgesGallery lang="gu" />);

    const teaser = screen.getByText("Plus badges");
    expect(teaser.closest("a")).toHaveAttribute("href", "/upgrade");
  });

  test("Plus plan hides the teaser", () => {
    h.entitlements = PLUS_ENTITLEMENTS;
    h.badges = badges;
    renderWithRouter(<BadgesGallery lang="gu" />);

    expect(screen.queryByText("Plus badges")).not.toBeInTheDocument();
  });
});

describe("Home review card gating", () => {
  test("Free plan shows a locked review card and daily-cap upsell to /upgrade", () => {
    h.entitlements = FREE_ENTITLEMENTS;
    renderWithRouter(<Home />);

    const reviewCta = screen.getByText(/Plus builds smart review sessions/i);
    expect(reviewCta.closest("a")).toHaveAttribute("href", "/upgrade");

    // The daily free-lesson meter offers a way out, never a dead end.
    const goUnlimited = screen.getByText(/Go unlimited/i);
    expect(goUnlimited.closest("a")).toHaveAttribute("href", "/upgrade");
  });

  test("Plus plan unlocks review and hides the daily cap", () => {
    h.entitlements = PLUS_ENTITLEMENTS;
    renderWithRouter(<Home />);

    expect(
      screen.queryByText(/Plus builds smart review sessions/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Go unlimited/i)).not.toBeInTheDocument();
  });

  test("Trialing plan unlocks the same surfaces as an active subscription", () => {
    h.entitlements = TRIALING_ENTITLEMENTS;
    renderWithRouter(<Home />);

    expect(
      screen.queryByText(/Plus builds smart review sessions/i),
    ).not.toBeInTheDocument();
  });
});
