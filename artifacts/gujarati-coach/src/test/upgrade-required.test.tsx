import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { asUpgradeRequired } from "@/lib/entitlements";
import { upgradeRequiredError } from "./fixtures";

// Mutable state the query-hook mocks read from, so each test can shape the exact
// success/error response the page receives.
const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  categories: [] as unknown,
  addPhrases: {} as Record<string, unknown>,
  refetch: vi.fn(),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "hi", name: "Hindi", nativeName: "हिन्दी" }],
    activeLang: "hi",
    activeLanguage: { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Practice pulls in the voice recorder; stub it so the component mounts without
// touching real microphone/audio APIs.
vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    state: "idle",
    prepare: vi.fn().mockResolvedValue(undefined),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    abortRecording: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListCategoryPhrases: () => h.categoryPhrases,
  useListReviewPhrases: () => h.reviewPhrases,
  useListCategories: () => ({ data: h.categories, isLoading: false }),
  useAddCategoryPhrases: () => h.addPhrases,
  useSynthesizeSpeech: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEvaluatePronunciation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAttempt: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getListCategoryPhrasesQueryKey: () => ["category-phrases"],
  getListCategoriesQueryKey: () => ["categories"],
  getListReviewPhrasesQueryKey: () => ["review"],
  getGetProgressSummaryQueryKey: () => ["progress-summary"],
  getListRecentAttemptsQueryKey: () => ["recent-attempts"],
  getListBadgesQueryKey: () => ["badges"],
}));

// Imported after the mocks are declared.
import CategoryDetail from "@/pages/category-detail";
import Practice from "@/pages/practice";

function renderPage(ui: ReactElement, path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

const idleQuery = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: h.refetch,
};

beforeEach(() => {
  h.categoryPhrases = { ...idleQuery };
  h.reviewPhrases = { ...idleQuery };
  h.categories = [];
  h.addPhrases = {
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
  h.refetch.mockClear();
});

describe("asUpgradeRequired", () => {
  test("recognizes a 402 upgrade_required body", () => {
    const err = upgradeRequiredError("feature_locked", "Review is Plus-only.");
    const upgrade = asUpgradeRequired(err);
    expect(upgrade).not.toBeNull();
    expect(upgrade?.reason).toBe("feature_locked");
  });

  test("ignores non-402 errors", () => {
    expect(asUpgradeRequired({ status: 500, data: {} })).toBeNull();
  });

  test("ignores a 402 that isn't an upgrade body", () => {
    expect(asUpgradeRequired({ status: 402, data: { foo: 1 } })).toBeNull();
  });
});

describe("Lesson load 402", () => {
  test("a locked language renders the upgrade screen, not a generic error", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: upgradeRequiredError(
        "language_locked",
        "Hindi is a Bolo! Plus language.",
      ),
    };
    renderPage(<CategoryDetail />);

    expect(screen.getByText("Unlock this language")).toBeInTheDocument();
    expect(
      screen.getByText("Hindi is a Bolo! Plus language."),
    ).toBeInTheDocument();
    expect(screen.getByText("See Bolo! Plus")).toBeInTheDocument();
    // Not the generic retry screen.
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  test("the daily lesson cap renders the upgrade screen", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: upgradeRequiredError(
        "daily_lesson_limit",
        "You've used today's free lessons.",
      ),
    };
    renderPage(<CategoryDetail />);

    expect(
      screen.getByText("You've hit today's free lessons"),
    ).toBeInTheDocument();
    expect(screen.getByText("See Bolo! Plus")).toBeInTheDocument();
  });

  test("a real (non-402) failure still shows the retry screen", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: { status: 500, data: { error: "boom" } },
    };
    renderPage(<CategoryDetail />);

    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.queryByText("See Bolo! Plus")).not.toBeInTheDocument();
  });
});

describe("Add-phrases 402", () => {
  test("hitting the cap while adding phrases offers an upgrade link", () => {
    // Rendered without a matching <Route>, so useParams() is empty and the page
    // parses categoryId as 0 — the fixture category must share that id.
    h.categories = [
      { id: 0, title: "Greetings", titleNative: null, accent: null },
    ];
    h.categoryPhrases = {
      ...idleQuery,
      data: [
        {
          id: 10,
          nativeScript: "નમસ્તે",
          romanized: "namaste",
          english: "hello",
          mastered: false,
          bestScore: null,
        },
      ],
    };
    h.addPhrases = {
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
      error: upgradeRequiredError(
        "daily_lesson_limit",
        "You've used today's free lessons.",
      ),
    };
    renderPage(<CategoryDetail />, "/learn/1");

    const link = screen.getByText(/go unlimited with Plus/i);
    // The daily cap is cheapest to lift with One Language, so the paywall opens
    // preselected on that tier.
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/upgrade?plan=one_language",
    );
  });
});

describe("Plus-locked phrases upsell", () => {
  // Rendered without a matching <Route>, so useParams() is empty and the page
  // parses categoryId as 0 — the fixture category must share that id.
  const withPhrases = () => {
    h.categoryPhrases = {
      ...idleQuery,
      data: [
        {
          id: 10,
          nativeScript: "નમસ્તે",
          romanized: "namaste",
          english: "hello",
          mastered: false,
          bestScore: null,
        },
      ],
    };
  };

  test("a non-Plus learner sees the locked-phrase count and an upgrade link", () => {
    withPhrases();
    h.categories = [
      {
        id: 0,
        title: "Greetings",
        titleNative: null,
        accent: null,
        phraseCount: 1,
        masteredCount: 0,
        lockedPhraseCount: 7,
      },
    ];
    renderPage(<CategoryDetail />, "/learn/1");

    expect(screen.getByText("7 more phrases with Plus")).toBeInTheDocument();
    // Extended library is an All-Access feature, so the paywall opens on Plus.
    const link = screen.getByText("Unlock with Plus").closest("a");
    expect(link).toHaveAttribute("href", "/upgrade?plan=plus");
  });

  test("singularizes the label when exactly one phrase is locked", () => {
    withPhrases();
    h.categories = [
      {
        id: 0,
        title: "Greetings",
        titleNative: null,
        accent: null,
        phraseCount: 1,
        masteredCount: 0,
        lockedPhraseCount: 1,
      },
    ];
    renderPage(<CategoryDetail />, "/learn/1");

    expect(screen.getByText("1 more phrase with Plus")).toBeInTheDocument();
  });

  test("a Plus learner (zero locked) sees no upsell", () => {
    withPhrases();
    h.categories = [
      {
        id: 0,
        title: "Greetings",
        titleNative: null,
        accent: null,
        phraseCount: 1,
        masteredCount: 0,
        lockedPhraseCount: 0,
      },
    ];
    renderPage(<CategoryDetail />, "/learn/1");

    expect(screen.queryByText(/more phrases? with Plus/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unlock with Plus")).not.toBeInTheDocument();
    // The existing add-phrases control still renders.
    expect(screen.getByText("Add more phrases")).toBeInTheDocument();
  });
});

describe("Review session 402", () => {
  test("a locked review session renders the upgrade screen", () => {
    h.reviewPhrases = {
      ...idleQuery,
      isError: true,
      error: upgradeRequiredError(
        "feature_locked",
        "Review is a Bolo! Plus feature.",
      ),
    };
    renderPage(<Practice mode="review" />, "/review");

    expect(screen.getByText("Review is a Plus feature")).toBeInTheDocument();
    expect(screen.getByText("See Bolo! Plus")).toBeInTheDocument();
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });
});
