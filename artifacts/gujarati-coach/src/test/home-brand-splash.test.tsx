import { describe, test, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Cold-load brand splash v2 + home skeleton. The moment is a boot FILM over
// a white plate, with the poster still as its first frame, and it runs in one
// of two modes captured at mount:
//   FULL   the day's first cold start (no "bolo-splash-day" stamp for today)
//          plays the film through on --splash-full-play and ignores the ready
//          signal entirely, then stamps the day;
//   READY  every later cold start releases on the ready signal once the
//          minimum hold has elapsed.
// Pins the behavior contract of useBrandSplash/BrandSplash and the skeleton
// handoff:
// (1) a cold load with data still in flight shows the skeleton with the
//     splash (the film) overlaying it, and the ready signal landing releases
//     the hold;
// (2) release fires at the LATER of the ready signal and the minimum hold
//     (--splash-min-hold), so an instant signal cannot blink the moment;
// (3) poster-first reveal: the overlay holds the blurred first frame as its
//     own background and renders nothing else until the still decodes, then
//     the film in one reveal that fades in; a stalled decode is capped by
//     --splash-decode-cap and never traps the user;
// (4) the max-hold failsafe retires the moment even if the ready signal
//     never lands (NOT gated on the minimum hold), leaving the skeleton;
// (5) reduced motion follows the same gate, then renders the STILL and never
//     the film, so it is never a blank screen;
// (6) warm cache (data ready at first paint) skips the moment entirely;
// (7) a remount (client-side navigation back to home) never replays it;
// (8) a failure inside the moment falls through to the normal loading home;
// (9) the day's first cold start plays in full and ignores the ready signal.
const h = vi.hoisted(() => ({
  groups: [] as unknown[],
  reduceMotion: false,
  catsLoading: true,
  portalThrows: false,
  track: vi.fn(),
  decodeResolvers: [] as Array<() => void>,
}));

// Stand-in for the off-DOM Image objects the compose-then-reveal gate
// decodes: each instance parks its decode() resolver on h.decodeResolvers so
// tests control exactly when each of the five layers finishes decoding.
class FakeImage {
  src = "";
  decode(): Promise<void> {
    return new Promise<void>((resolve) => {
      h.decodeResolvers.push(resolve);
    });
  }
}

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

/** Feeds test-sized durations through the tuning-var reader (readTuningMs
 *  hits getComputedStyle on documentElement). Unpinned names return "", so
 *  the component falls back to its real defaults; pin every var a test's
 *  timing depends on. Callers must mockRestore() the returned spy. */
function pinTuningVars(vars: Record<string, string>) {
  const original = window.getComputedStyle.bind(window);
  return vi
    .spyOn(window, "getComputedStyle")
    .mockImplementation((el: Element, pseudo?: string | null) => {
      if (el === document.documentElement) {
        return {
          getPropertyValue: (name: string) => vars[name] ?? "",
        } as CSSStyleDeclaration;
      }
      return original(el, pseudo);
    });
}

beforeEach(() => {
  // useSplashShape reads matchMedia at mount; jsdom does not implement
  // it. Portrait by default, so the existing cases are unchanged.
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  h.groups = [];
  h.reduceMotion = false;
  h.catsLoading = true;
  h.portalThrows = false;
  h.track.mockClear();
  h.decodeResolvers = [];
  __resetBrandSplashForTests();
  // Default: NOT the day's first cold start, so these exercise the
  // ready-signal release. The full-play test clears it again.
  try {
    localStorage.setItem(
      "bolo-splash-day",
      `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`,
    );
  } catch {
    /* jsdom always has storage */
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("home brand splash v2", () => {
  test("cold load overlays the moment on the skeleton; the ready signal landing releases the hold", async () => {
    // Min-hold pinned tiny so this test isolates the ready-signal release.
    const spy = pinTuningVars({ "--splash-min-hold": "40", "--splash-exit": "40" });
    try {
      const { rerenderHome } = renderHome();
      // Splash overlays the ticket-and-card skeleton, never a bare spinner.
      expect(splash()).not.toBeNull();
      expect(skeleton()).not.toBeNull();
      expect(screen.queryByText("Phrasebook")).toBeNull();
      // Compose-then-reveal settles as soon as the decode promises resolve
      // (immediately under jsdom); then every SPLASH_V2_ASSETS layer is in
      // the composition: carriage, both wing frames in the window clip box,
      // both steam puffs, wordmark.
      const overlay = splash() as HTMLElement;
      await waitFor(() =>
        expect(overlay.querySelector('[data-testid="splash-scene"]')).not.toBeNull(),
      );
      expect(overlay.querySelector('[data-testid="splash-film"]')).not.toBeNull();
      expect(
        (overlay.querySelector('[data-testid="splash-film"]') as HTMLVideoElement)
          .muted,
      ).toBe(true);

      // The ready signal lands: the splash releases and unmounts after the
      // short exit fade. waitFor's 1s default timeout is far under the 8s
      // max-hold fallback, so this passing proves the ready-signal release,
      // not the failsafe.
      h.catsLoading = false;
      rerenderHome();
      await waitFor(() => expect(splash()).toBeNull());
      expect(screen.getByText("Phrasebook")).toBeInTheDocument();
      expect(skeleton()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("an instantly-settling ready signal still holds the moment for the minimum hold", async () => {
    const spy = pinTuningVars({ "--splash-min-hold": "300", "--splash-exit": "40" });
    try {
      const { rerenderHome } = renderHome();
      // The signal settles at once...
      h.catsLoading = false;
      rerenderHome();
      // ...but the minimum hold is pending: still playing, not exiting.
      expect(splash()).not.toBeNull();
      expect(
        (splash() as HTMLElement).classList.contains("brand-splash-exiting"),
      ).toBe(false);
      // Release fires at the LATER of the two: here, the minimum elapsing.
      await waitFor(() => expect(splash()).toBeNull());
      expect(screen.getByText("Phrasebook")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  test("nothing renders until the still decodes, then the film in one reveal", async () => {
    vi.stubGlobal("Image", FakeImage);
    const spy = pinTuningVars({
      "--splash-decode-cap": "5000",
      "--splash-min-hold": "40",
      "--splash-exit": "40",
    });
    try {
      renderHome();
      const overlay = splash() as HTMLElement;
      expect(overlay).not.toBeNull();
      // The gate is holding: the one still is decoding, and the overlay is
      // its holding surface with nothing in it. NOT A FLAT COLOUR (2026-08-30,
      // owner: "i don't want to see a blank brown page before the video
      // splash loads"): the surface is the film's own first frame, tiny and
      // pre-blurred, inlined as the overlay's background.
      expect(h.decodeResolvers.length).toBe(1);
      expect(overlay.querySelector("img")).toBeNull();
      expect(overlay.textContent).toBe("");
      expect(overlay.style.backgroundImage).toContain("data:image/jpeg;base64,");
      expect(overlay.style.backgroundSize).toBe("cover");
      // The decode lands: the film appears in a single reveal, and that
      // reveal FADES IN over the blur (the class carries the keyframes).
      h.decodeResolvers[0]();
      await waitFor(() =>
        expect(overlay.querySelector('[data-testid="splash-scene"]')).not.toBeNull(),
      );
      expect(overlay.querySelector('[data-testid="splash-film"]')).not.toBeNull();
      expect(
        (overlay.querySelector('[data-testid="splash-scene"]') as HTMLElement).classList.contains(
          "splash-scene-enter",
        ),
      ).toBe(true);
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  test("a stalled decode never traps the user: the cap reveals whatever is ready", async () => {
    // Decodes never resolve; only the cap can reveal.
    vi.stubGlobal("Image", FakeImage);
    const spy = pinTuningVars({
      "--splash-decode-cap": "60",
      "--splash-min-hold": "40",
      "--splash-exit": "40",
    });
    try {
      renderHome();
      const overlay = splash() as HTMLElement;
      expect(overlay.querySelector("img")).toBeNull();
      await waitFor(() =>
        expect(overlay.querySelector('[data-testid="splash-scene"]')).not.toBeNull(),
      );
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
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

  test("reduced motion renders the still, never the film", async () => {
    h.reduceMotion = true;
    const spy = pinTuningVars({ "--splash-min-hold": "40", "--splash-exit": "40" });
    try {
      const { rerenderHome } = renderHome();
      // The splash still mounts (never a blank screen) over the skeleton...
      const overlay = splash() as HTMLElement;
      expect(overlay).not.toBeNull();
      expect(skeleton()).not.toBeNull();
      // ...and follows the same poster-first gate, then shows the STILL:
      // the film is not rendered at all.
      await waitFor(() =>
        expect(overlay.querySelector('[data-testid="splash-still"]')).not.toBeNull(),
      );
      expect(overlay.querySelector('[data-testid="splash-film"]')).toBeNull();
      // The ready-signal hold still releases it.
      h.catsLoading = false;
      rerenderHome();
      await waitFor(() => expect(splash()).toBeNull());
      expect(screen.getByText("Phrasebook")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
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

  test("the day's first cold start plays the film in full and ignores the ready signal", async () => {
    // Clear the stamp beforeEach set: this IS the day's first.
    localStorage.removeItem("bolo-splash-day");
    const spy = pinTuningVars({
      "--splash-full-play": "200",
      "--splash-min-hold": "10",
      "--splash-exit": "20",
    });
    try {
      const { rerenderHome } = renderHome();
      expect(splash()).not.toBeNull();
      // The ready signal lands immediately and is DELIBERATELY ignored:
      // the film plays through on its own clock.
      h.catsLoading = false;
      rerenderHome();
      await new Promise((r) => setTimeout(r, 60));
      expect(splash()).not.toBeNull();
      // Only the full-play timer ends it.
      await waitFor(() => expect(splash()).toBeNull());
      // And the stamp is now set, so the next cold start releases on ready.
      expect(localStorage.getItem("bolo-splash-day")).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("a landscape viewport gets the wide film and its own still", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const spy = pinTuningVars({ "--splash-min-hold": "40", "--splash-exit": "40" });
    try {
      renderHome();
      const overlay = splash() as HTMLElement;
      await waitFor(() =>
        expect(overlay.querySelector('[data-testid="splash-film"]')).not.toBeNull(),
      );
      const film = overlay.querySelector('[data-testid="splash-film"]') as HTMLVideoElement;
      expect(film.getAttribute("src")).toContain("welcome-bolo-wide.mp4");
      // WAS .png. The wide film became live-action footage of a station bazaar
      // on 2026-08-23, and a photographic poster frame is 2.6MB as a PNG
      // against 257KB as a JPEG at the same 1920x1080. The portrait poster is
      // still illustration and still a PNG, which is why the pair now differs.
      expect(film.getAttribute("poster")).toContain("welcome-bolo-wide-poster.jpg");
    } finally {
      spy.mockRestore();
    }
  });
});
