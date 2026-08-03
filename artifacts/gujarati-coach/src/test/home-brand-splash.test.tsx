import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Cold-load brand splash v2 + home skeleton. Pins the behavior contract of
// useBrandSplash/BrandSplash (ready-signal hold) and the skeleton handoff:
// (1) a cold load with data still in flight shows the skeleton with the
//     splash (layered carriage/Bolo/steam composition) overlaying it, and
//     the ready signal landing releases the hold immediately;
// (2) the max-hold failsafe retires the moment even if the ready signal
//     never lands, leaving the skeleton;
// (3) reduced motion renders the STATIC composed frame (no animation
//     classes, single wing frame), never a blank screen;
// (4) warm cache (data ready at first paint) skips the moment entirely;
// (5) a remount (client-side navigation back to home) never replays it;
// (6) a failure inside the moment falls through to the normal loading home.
const h = vi.hoisted(() => ({
  groups: [] as unknown[],
  reduceMotion: false,
  catsLoading: true,
  portalThrows: false,
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

// Override ONLY useReducedMotion so tests can flip the preference; keep the
// real motion components so home renders exactly as in the app.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReducedMotion: () => h.reduceMotion,
}));

// The splash renders through createPortal; the failure-path test makes the
// portal throw so the error boundary's fall-through is exercised. Everything
// else delegates to the real react-dom.
vi.mock("react-dom", async (importOriginal) => {
  const orig = await importOriginal<typeof import("react-dom")>();
  return {
    ...orig,
    createPortal: (children: unknown, container: Element) => {
      if (h.portalThrows) throw new Error("splash portal boom");
      return orig.createPortal(children as Parameters<typeof orig.createPortal>[0], container);
    },
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
    isLoading: true,
    isError: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  getGetProgressSummaryQueryKey: () => ["summary"],
  useGetAccount: () => ({ data: undefined }),
  // The splash keys off this query's isLoading: it is home's first-paint
  // condition. Mutable via h.catsLoading so tests can land data mid-moment.
  useListCategories: () =>
    h.catsLoading
      ? { data: undefined, isLoading: true }
      : {
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
        },
  getListCategoriesQueryKey: () => ["categories"],
  useListRecentAttempts: () => ({ data: [], isLoading: false }),
  useListReviewPhrases: () => ({ data: [], isLoading: false }),
  getListReviewPhrasesQueryKey: () => ["review"],
  useListBadges: () => ({ data: undefined, isLoading: false }),
  useListIncomingFriendRequests: () => ({ data: [], isLoading: false }),
  useListCategoryLessonGroups: () => ({
    data: { lessonGroups: h.groups },
    isLoading: false,
    isError: false,
  }),
}));

// Imported after the mocks are declared.
import Home from "@/pages/home";
import { __resetBrandSplashForTests } from "@/components/brand-splash";

function renderHome() {
  const { hook, history } = memoryLocation({ path: "/app", record: true });
  const ui = (<Router hook={hook}>{(<Home />) as ReactElement}</Router>) as ReactElement;
  const utils = render(ui);
  return {
    ...utils,
    history,
    rerenderHome: () =>
      utils.rerender(
        (<Router hook={hook}>{(<Home />) as ReactElement}</Router>) as ReactElement,
      ),
  };
}

const splash = () => screen.queryByTestId("brand-splash");
const skeleton = () => screen.queryByTestId("home-skeleton");

beforeEach(() => {
  h.groups = [];
  h.reduceMotion = false;
  h.catsLoading = true;
  h.portalThrows = false;
  h.track.mockClear();
  __resetBrandSplashForTests();
});

describe("home brand splash v2", () => {
  test("cold load overlays the moment on the skeleton; the ready signal landing releases the hold", async () => {
      const { rerenderHome } = renderHome();
    // Splash overlays the ticket-and-card skeleton, never a bare spinner.
    expect(splash()).not.toBeNull();
    expect(skeleton()).not.toBeNull();
    expect(screen.queryByText("Phrasebook")).toBeNull();
    // Every SPLASH_V2_ASSETS layer is in the composition: carriage, both
    // wing frames in the window clip box, both steam puffs, wordmark.
    const overlay = splash() as HTMLElement;
    expect(overlay.querySelector('img[src*="carriage.svg"]')).not.toBeNull();
    const windowBox = overlay.querySelector('[data-testid="splash-window"]');
    expect(windowBox).not.toBeNull();
    expect(
      (windowBox as HTMLElement).querySelector('img[src*="mascot-wave.png"]'),
    ).not.toBeNull();
    expect(
      (windowBox as HTMLElement).querySelector('img[src*="mascot-cheer.png"]'),
    ).not.toBeNull();
    expect(overlay.querySelector('img[src*="steam-a.svg"]')).not.toBeNull();
    expect(overlay.querySelector('img[src*="steam-b.svg"]')).not.toBeNull();
    expect(overlay).toHaveTextContent("Bolo!");

    // The ready signal lands: the splash flips to its exit fade immediately...
    h.catsLoading = false;
    rerenderHome();
    expect((splash() as HTMLElement).classList.contains("brand-splash-exiting")).toBe(true);
    // ...and unmounts after the short exit fade. waitFor's 1s default timeout
    // is far under the 8s max-hold fallback, so this passing proves the
    // ready-signal release, not the failsafe.
    await waitFor(() => expect(splash()).toBeNull());
    expect(screen.getByText("Phrasebook")).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });

  test("the max-hold failsafe retires the moment when the ready signal never lands, leaving the skeleton", async () => {
    // Feed tiny durations through the tuning-var reader so the test does not
    // sit through the real 8s max-hold cap.
    const original = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === document.documentElement) {
          return {
            getPropertyValue: (name: string) =>
              name === "--splash-max-hold" ? "60" : name === "--splash-exit" ? "40" : "",
          } as CSSStyleDeclaration;
        }
        return original(el, pseudo);
      });
    try {
      renderHome();
      expect(splash()).not.toBeNull();
      await waitFor(() => expect(splash()).toBeNull());
      // Data is still loading: the skeleton stays, content does not appear.
      expect(skeleton()).not.toBeNull();
      expect(screen.queryByText("Phrasebook")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("reduced motion renders the static composed frame: no animation classes, never blank", async () => {
    h.reduceMotion = true;
    const { rerenderHome } = renderHome();
    // The splash still mounts (never a blank screen) over the skeleton...
    const overlay = splash() as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(skeleton()).not.toBeNull();
    // ...fully composed (carriage, ONE wing frame, steam) but static: the
    // raised-wing frame is absent and no animate-splash2-* class is applied.
    expect(overlay.querySelector('img[src*="carriage.svg"]')).not.toBeNull();
    expect(overlay.querySelector('img[src*="mascot-wave.png"]')).not.toBeNull();
    expect(overlay.querySelector('img[src*="mascot-cheer.png"]')).toBeNull();
    expect(overlay.querySelector('img[src*="steam-a.svg"]')).not.toBeNull();
    expect(overlay.querySelector('[class*="animate-splash"]')).toBeNull();
    // The ready-signal hold still releases it.
    h.catsLoading = false;
    rerenderHome();
    await waitFor(() => expect(splash()).toBeNull());
    expect(screen.getByText("Phrasebook")).toBeInTheDocument();
  });

  test("data ready at first paint (warm cache) skips the moment entirely", () => {
    h.catsLoading = false;
    renderHome();
    expect(splash()).toBeNull();
    expect(screen.getByText("Phrasebook")).toBeInTheDocument();
  });

  test("client-side navigation back to home does not replay the moment", () => {
    const first = renderHome();
    expect(splash()).not.toBeNull();
    first.unmount();
    // Remount without resetting the module latch = navigating back.
    renderHome();
    expect(splash()).toBeNull();
    expect(skeleton()).not.toBeNull();
  });

  test("a failure inside the moment falls through to the normal loading home", async () => {
    h.portalThrows = true;
    // React logs the caught boundary error; keep the test output clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { rerenderHome } = renderHome();
      // The boundary swallowed the moment; home's loading state is intact.
      expect(splash()).toBeNull();
      expect(skeleton()).not.toBeNull();
      // And the handoff to real content still works as normal.
      h.catsLoading = false;
      rerenderHome();
      await waitFor(() =>
        expect(screen.getByText("Phrasebook")).toBeInTheDocument(),
      );
    } finally {
      errSpy.mockRestore();
    }
  });
});
