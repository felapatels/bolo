import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

// Boarding pass and journey CTA animation task. Pins three things:
// (1) the progress-aware CTA copy: zero progress keeps "Begin your journey",
//     mid progress becomes "Resume at Stop N" with the phrases-remaining
//     count, and progress WITHOUT current-stop data falls back to the
//     pre-existing "Continue your journey";
// (2) the press handler (analytics track on the hero link) still fires with
//     the animation wrappers in place;
// (3) reduced motion renders the pass static: the idle animation classes are
//     not applied at all. jsdom cannot evaluate the CSS media block that
//     neutralizes keyframes in real browsers, so the JS gating is what these
//     tests can and do pin.
const h = vi.hoisted(() => ({
  groups: [] as unknown[],
  groupsError: false,
  reduceMotion: false,
  track: vi.fn(),
}));

// Home renders BottomNav -> XpCounter; stub it so this suite does not need a
// react-query provider.
vi.mock("@/components/XpCounter", () => ({ XpCounter: () => null }));
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

// The language picker pulls the preferences mutation + query client, which
// this suite never asserts on.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

// Analytics: the press-handler assertion needs a spyable track.
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

// Override ONLY useReducedMotion so tests can flip the preference; keep the
// real motion components so the pass renders exactly as in the app.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReducedMotion: () => h.reduceMotion,
}));

vi.mock("@workspace/api-client-react", () => ({
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
  useListBadges: () => ({ data: undefined, isLoading: false }),
  useListIncomingFriendRequests: () => ({ data: [], isLoading: false }),
  // Drives useJourneyProgress: every zone returns the same group list, so the
  // current stop (when one exists) is Stop 1 in zone 1.
  useListCategoryLessonGroups: () =>
    h.groupsError
      ? { data: undefined, isLoading: false, isError: true }
      : { data: { lessonGroups: h.groups }, isLoading: false, isError: false },
}));

// Imported after the mocks are declared.
import Home from "@/pages/home";

function renderHome(): ReturnType<typeof render> {
  const { hook } = memoryLocation({ path: "/app", record: true });
  return render(<Router hook={hook}>{(<Home />) as ReactElement}</Router>);
}

/** A phrase-stage lesson group as the pass's zone queries see it. */
function grp(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    stage: "phrase",
    position: 1,
    status: "unlocked",
    masteredCount: 0,
    phraseCount: 5,
    attemptedCount: 0,
    ...over,
  };
}

beforeEach(() => {
  h.groups = [grp()];
  h.groupsError = false;
  h.reduceMotion = false;
  h.track.mockClear();
});

describe("home boarding pass CTA copy", () => {
  test("zero progress keeps Begin your journey, and the idle motion classes are applied", () => {
    const { container } = renderHome();
    expect(screen.getByText("Begin your journey")).toBeInTheDocument();
    expect(screen.queryByText(/resume at stop/i)).toBeNull();
    // Idle motion present when motion is not reduced.
    expect(container.querySelector(".animate-ticket-breathe")).not.toBeNull();
    expect(container.querySelector(".animate-cta-arrow-nudge")).not.toBeNull();
  });

  test("mid progress resumes at the current stop with the phrases-remaining count", () => {
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    const { unmount } = renderHome();
    expect(screen.getByText("Resume at Stop 1 · 3 phrases to go")).toBeInTheDocument();
    unmount();
    // Singular form for a single remaining phrase.
    h.groups = [grp({ status: "in_progress", masteredCount: 4, attemptedCount: 4 })];
    renderHome();
    expect(screen.getByText("Resume at Stop 1 · 1 phrase to go")).toBeInTheDocument();
  });

  test("progress without current-stop data falls back to Continue your journey", () => {
    // Every stop completed: doneCount > 0 but no boardable current stop.
    h.groups = [grp({ status: "completed", masteredCount: 5, attemptedCount: 5 })];
    renderHome();
    expect(screen.getByText("Continue your journey")).toBeInTheDocument();
    expect(screen.queryByText(/resume at stop/i)).toBeNull();
  });
});

describe("home boarding pass motion", () => {
  test("reduced motion renders the pass static with correct copy", () => {
    h.reduceMotion = true;
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    const { container } = renderHome();
    // No idle animation classes anywhere on the page.
    expect(container.querySelector(".animate-ticket-breathe")).toBeNull();
    expect(container.querySelector(".animate-cta-arrow-nudge")).toBeNull();
    // The static frame still carries the full progress-aware copy.
    expect(screen.getByText("Resume at Stop 1 · 3 phrases to go")).toBeInTheDocument();
  });

  test("pressing the pass still fires the hero analytics handler", async () => {
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    renderHome();
    const pass = screen.getByText("Resume at Stop 1 · 3 phrases to go").closest("a");
    expect(pass).not.toBeNull();
    await userEvent.setup().click(pass as HTMLElement);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.JOURNEY_ENTERED_VIA_HERO, {
      language: "gu",
    });
  });
});
