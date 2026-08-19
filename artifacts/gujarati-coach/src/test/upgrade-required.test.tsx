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
  isPlus: false,
}));

// Preserve the real asUpgradeRequired/upgradeHref helpers (pure functions with
// no Clerk dependency) but replace useEntitlements, it calls useUser() which
// requires a <ClerkProvider> that the test harness doesn't provide.
vi.mock("@/lib/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/entitlements")>();
  return {
    ...actual,
    useEntitlements: () => ({
      isPlus: h.isPlus,
      isLoading: false,
      isSignedIn: true,
      plan: h.isPlus ? "plus" : "free",
      isPaid: h.isPlus,
      isOneLanguage: false,
      isAllAccess: h.isPlus,
      status: "active",
      isTrialing: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: null,
      allowedLanguages: ["hi"],
      features: {} as never,
      dailyNewLessons: { limit: null, used: 0, remaining: null },
      isLanguageAllowed: () => true,
      entitlements: undefined,
    }),
  };
});

vi.mock("@/lib/language-context", () => ({
  useSpeechCapability: () => "supported" as const,
  useLanguage: () => ({
    languages: [{ code: "hi", name: "Hindi", nativeName: "हिन्दी" }],
    activeLang: "hi",
    activeLanguage: { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

// Practice pulls in the voice recorder; stub it so the component mounts without
// touching real microphone/audio APIs.
vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    getLastDurationSeconds: () => 2,
    getAmplitude: () => 0,
    state: "idle",
    prepare: vi.fn().mockResolvedValue(undefined),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    abortRecording: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  // Test-out mode is idle in these suites (no ?mode=testout).
  useGetLessonGroupTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() }),
  getGetLessonGroupTestoutQueryKey: () => ["lesson-group-testout"],
  useSubmitLessonGroupTestout: () => ({ mutate: vi.fn(), data: undefined, isError: false, error: null, isPending: false }),
  useReportPhrase: () => ({ mutate: vi.fn() }),
  // Group mode is idle in these suites (no ?group= param).
  useListLessonGroupPhrases: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  getListLessonGroupPhrasesQueryKey: () => ["lesson-group-phrases"],
  getListCategoryLessonGroupsQueryKey: () => ["category-lesson-groups"],
  ApiError: class extends Error {},
  useListCategoryPhrases: () => h.categoryPhrases,
  // The Plus-only sentence stage stays disabled in these suites (the fixture
  // categories are sentencesLocked or sentence-less), so an idle query is fine.
  useListCategorySentences: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: h.refetch,
  }),
  useListReviewPhrases: () => h.reviewPhrases,
  useListCategories: () => ({ data: h.categories, isLoading: false }),
  useAddCategoryPhrases: () => h.addPhrases,
  useSynthesizeSpeech: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEvaluatePronunciation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAttempt: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getListCategoryPhrasesQueryKey: () => ["category-phrases"],
  getListCategorySentencesQueryKey: () => ["category-sentences"],
  getListCategoriesQueryKey: () => ["categories"],
  getListReviewPhrasesQueryKey: () => ["review"],
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
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
  h.isPlus = false;
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
    expect(screen.getByText("See All-Access")).toBeInTheDocument();
    // Not the generic retry screen.
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  test("the daily lesson cap renders the upgrade screen with trial CTA", () => {
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
    expect(screen.getByText("Start 7-day free trial")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cancel anytime, no charge if you cancel before the trial ends.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("See All-Access")).not.toBeInTheDocument();
  });

  test("a locked language shows the generic CTA, not the trial copy", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: upgradeRequiredError(
        "language_locked",
        "Hindi is a Bolo! Plus language.",
      ),
    };
    renderPage(<CategoryDetail />);

    expect(screen.getByText("See All-Access")).toBeInTheDocument();
    expect(screen.queryByText("Start 7-day free trial")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cancel anytime/)).not.toBeInTheDocument();
  });

  test("a real (non-402) failure still shows the retry screen", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: { status: 500, data: { error: "boom" } },
    };
    renderPage(<CategoryDetail />);

    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.queryByText("See All-Access")).not.toBeInTheDocument();
    expect(screen.queryByText("Start 7-day free trial")).not.toBeInTheDocument();
  });
});

describe("Add-phrases refusals", () => {
  test("hitting the topic ceiling while adding phrases offers an upgrade link", () => {
    // Rendered without a matching <Route>, so useParams() is empty and the page
    // parses categoryId as 0, the fixture category must share that id.
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
        "phrase_ceiling",
        "This topic is full at 20 phrases on your plan.",
      ),
    };
    renderPage(<CategoryDetail />, "/learn/1");

    const link = screen.getByText(/Unlock with All-Access/i);
    // Every denial lands on the All-Access card (One Language is mobile-only,
    // and it shares Free's ceiling so it would not lift this anyway). The
    // reason is forwarded so the paywall can stay contextual.
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/upgrade?plan=plus&reason=phrase_ceiling",
    );
  });

  test("a top-tier refusal shows the server's message and no upgrade prompt", () => {
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
    // 409 topic_full: the caller is on the top tier, so there is nothing to
    // upgrade to and an upgrade prompt here would be a lie.
    h.addPhrases = {
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
      error: {
        status: 409,
        data: {
          error: "This topic is full. It holds every phrase it can.",
          reason: "topic_full",
        },
      },
    };
    renderPage(<CategoryDetail />, "/learn/1");

    expect(
      screen.getByText("This topic is full. It holds every phrase it can."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All-Access/i)).not.toBeInTheDocument();
    // Nor the generic failure copy: this is a refusal, not a breakage.
    expect(
      screen.queryByText("Couldn't add new phrases. Please try again."),
    ).not.toBeInTheDocument();
  });

  test("at the ceiling the add button is replaced by the full-topic line", () => {
    // One visible phrase against a ceiling of one: there is nothing left to
    // add, so the control goes away instead of sitting there ready to fail.
    h.categories = [
      {
        id: 0,
        title: "Greetings",
        titleNative: null,
        accent: null,
        phraseCount: 1,
        masteredCount: 0,
        lockedPhraseCount: 0,
        phraseCeiling: 1,
      },
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
    h.addPhrases = { mutateAsync: vi.fn(), isPending: false, isError: false };
    renderPage(<CategoryDetail />, "/learn/1");

    expect(screen.queryByText("Add more phrases")).not.toBeInTheDocument();
    expect(screen.getByText("This topic is full at 1 phrases.")).toBeInTheDocument();
  });
});

describe("Plus-locked phrases upsell", () => {
  // Rendered without a matching <Route>, so useParams() is empty and the page
  // parses categoryId as 0, the fixture category must share that id.
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

    expect(screen.getByText("7 more phrases with All-Access")).toBeInTheDocument();
    // Extended library is an All-Access feature, so the paywall opens on Plus.
    const link = screen.getByText("Unlock with All-Access").closest("a");
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

    expect(screen.getByText("1 more phrase with All-Access")).toBeInTheDocument();
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

    expect(screen.queryByText(/more phrases? with All-Access/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unlock with All-Access")).not.toBeInTheDocument();
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

    expect(screen.getByText("Review is an All-Access feature")).toBeInTheDocument();
    expect(screen.getByText("See All-Access")).toBeInTheDocument();
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });
});

describe("Practice page 402", () => {
  test("the daily lesson cap on the practice page shows the trial CTA", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: upgradeRequiredError(
        "daily_lesson_limit",
        "You've used today's free lessons.",
      ),
    };
    renderPage(<Practice />, "/learn/1");

    expect(
      screen.getByText("You've hit today's free lessons"),
    ).toBeInTheDocument();
    expect(screen.getByText("Start 7-day free trial")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cancel anytime, no charge if you cancel before the trial ends.",
      ),
    ).toBeInTheDocument();
    // Generic CTA must NOT appear when showTrial is true.
    expect(screen.queryByText("See All-Access")).not.toBeInTheDocument();
  });

  test("a feature_locked denial on the practice page shows the generic CTA, not the trial copy", () => {
    h.categoryPhrases = {
      ...idleQuery,
      isError: true,
      error: upgradeRequiredError(
        "feature_locked",
        "This feature requires Bolo! Plus.",
      ),
    };
    renderPage(<Practice />, "/learn/1");

    expect(screen.getByText("See All-Access")).toBeInTheDocument();
    expect(screen.queryByText("Start 7-day free trial")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cancel anytime/)).not.toBeInTheDocument();
  });
});
