import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

// Boarding pass and journey CTA animation task. Pins three things:
// (1) the progress-aware CTA copy: zero progress shows "Start your journey",
//     mid progress becomes "Resume at Stop N" with the phrases-remaining
//     count, and progress WITHOUT current-stop data falls back to the
//     pre-existing "Continue your journey";
// (2) the press handler (analytics track on the hero link) still fires with
//     the animation wrappers in place;
// (3) reduced motion renders the pass static: the idle animation classes are
//     not applied at all. jsdom cannot evaluate the CSS media block that
//     neutralizes keyframes in real browsers, so the JS gating is what these
//     tests can and do pin;
// (4) the stub tear (task 899): activation applies the tear classes and the
//     delayed navigation still fires (never swallowed by the animation path),
//     reduced motion navigates instantly with no tear, and a failure inside
//     the animation path falls through to immediate navigation.
const h = vi.hoisted(() => ({
  groups: [] as unknown[],
  groupsError: false,
  reduceMotion: false,
  track: vi.fn(),
  playTearSfx: vi.fn(),
  webHaptic: vi.fn(),
}));

// Task #978: tear SFX + haptic. Mock both modules so jsdom never touches
// AudioContext / navigator.vibrate. The haptics mock keeps webHaptic callable
// for every call type (home.tsx also fires 'success' elsewhere), so the pins
// assert the call TYPE, not just the call count.
vi.mock("@/lib/tearAudio", () => ({
  preloadTearAudio: vi.fn(),
  playTearSfx: h.playTearSfx,
}));
vi.mock("@/lib/haptics", () => ({ webHaptic: h.webHaptic }));

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

function renderHome(): ReturnType<typeof render> & { history: string[] } {
  const { hook, history } = memoryLocation({ path: "/app", record: true });
  return {
    ...render(<Router hook={hook}>{(<Home />) as ReactElement}</Router>),
    history,
  };
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
  h.playTearSfx.mockClear();
  h.webHaptic.mockClear();
});

afterEach(() => {
  // Task #905 hygiene: any test that lets the tear reach navigation spawns
  // the body-level hand-off overlay, whose removal in jsdom is time-based
  // (real ~900ms fallback timer — no animation events fire here). Purge it
  // after EVERY test so no test inherits a stale clone: the clones duplicate
  // the pass copy, which breaks getByText in later tests. The overlay's own
  // remove() is idempotent, so the timer firing later is harmless.
  document.body
    .querySelectorAll("[data-tear-overlay]")
    .forEach((n) => n.remove());
});

// THE CTA COPY CHANGED ON PURPOSE, 2026-08-28. The hero became a carved
// station board with a ticket lying on it (ported from mobile), and the CTA
// plate went from a sentence to a VERB plus a tail:
//
//   "Resume at Stop 5 · 10 phrases to go"  ->  "Resume" + "Only 6 more stops to go!"
//
// The sentence wrapped to two lines inside the plate and repeated the two
// things directly above it — "Stop 5 of 11" and the progress bar. The tail
// counts STOPS LEFT IN THE ZONE, which is the one number nothing else on the
// board draws. planBlocked keeps its words: it is the only state with no
// current stop to name, so a bare verb would have no reason attached.
//
// These assertions are INVERTED rather than deleted: each one still pins the
// same behaviour, against the copy that behaviour now produces.
describe("home boarding pass CTA copy", () => {
  test("zero progress shows the Start verb, and the idle motion classes are applied", () => {
    const { container } = renderHome();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.queryByText(/resume at stop/i)).toBeNull();
    // Idle motion present when motion is not reduced: breathe, face shimmer,
    // glow pulse, CTA arrow slide, and the train drive.
    expect(container.querySelector(".animate-ticket-breathe")).not.toBeNull();
    // The shimmer is back. It was pulled for one round while the "white box
    // behind it" was being chased and turned out to be innocent: the box was
    // `.depth-shadow` outlining the board's rectangle through the art's
    // transparent margins. Restored to iOS's gradient and geometry.
    expect(container.querySelector(".animate-ticket-shimmer")).not.toBeNull();
    // THE GLOW IS GONE, ON PURPOSE, and this assertion is inverted rather than
    // deleted. Two of them were live at once: the original accent halo and a
    // brown one added with the carved board. The accent one pulsed the LINE
    // COLOUR — green on the Ganga Line — around a teak board, and both drew a
    // rounded rectangle bigger than the board's own art, which reads as a white
    // box behind it. The art has a drawn frame and a depth-shadow already.
    expect(container.querySelector(".animate-pass-glow")).toBeNull();
    expect(container.querySelector(".animate-cta-arrow-nudge")).not.toBeNull();
    expect(container.querySelector(".animate-train-drive")).not.toBeNull();
  });

  test("mid progress shows the Resume verb, with the stops-left tail beside it", () => {
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    const { unmount } = renderHome();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    // The stop, the zone and the phrase count are the BOARD's job now: the
    // plate no longer repeats any of them. Matched by shape rather than by
    // exact numbers so the fixture's stop arithmetic stays the map's business.
    expect(screen.getByText(/^Stop \d+ of \d+$/)).toBeInTheDocument();
    // The tail counts STOPS LEFT IN THE ZONE, matched by shape so the fixture's
    // stop arithmetic stays the map's business.
    //
    // THE CHAI CLAUSE IS PINNED ON PURPOSE. Nothing else in the app says where
    // Chai comes from, and this sentence is the only place that answers it, so
    // it is the half most likely to be quietly lost: it has already been cut
    // once by a `truncate` on the span that renders it. Asserting the whole
    // sentence means an ellipsis or a reworded tail fails here rather than
    // shipping.
    expect(
      screen.getByText(
        /^(Only \d+ more stops? to go\.|Last stop in this zone!) Chai and surprises along the way\.$/,
      ),
    ).toBeInTheDocument();
    unmount();
    h.groups = [grp({ status: "in_progress", masteredCount: 4, attemptedCount: 4 })];
    renderHome();
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  // The state the owner was actually looking at: no boardable stop at all
  // (loading, errored, or every authed call failing). The verb collapses to
  // "Start" and mobile leaves the tail null — which on a phone-width plate is
  // fine and on web's full-width plate reads as missing text. A learner with
  // no progress is also the one who most needs to know Chai is earned by
  // riding, so the clause carries here on its own.
  test("no current stop still fills the plate, and keeps the Chai promise", () => {
    h.groups = [];
    renderHome();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(
      screen.getByText("Chai and surprises along the way."),
    ).toBeInTheDocument();
  });

  test("progress without current-stop data falls back to the Continue verb", () => {
    // Every stop completed: doneCount > 0 but no boardable current stop.
    h.groups = [grp({ status: "completed", masteredCount: 5, attemptedCount: 5 })];
    renderHome();
    expect(screen.getByText("Continue")).toBeInTheDocument();
    expect(screen.queryByText("Resume")).toBeNull();
  });

  // S2 map honesty: a planLocked group (all its phrases are premium, so the
  // caller's plan can practice nothing there) is never the boarding-pass
  // target. When the only stops ahead are planLocked, the pass upsells
  // instead of promising a ride it cannot deliver.
  test("planLocked stops ahead with nothing boardable render the All-Access nudge", () => {
    h.groups = [
      grp({ status: "completed", masteredCount: 5, attemptedCount: 5 }),
      grp({ id: 2, position: 2, status: "locked", planLocked: true, phraseCount: 0 }),
    ];
    renderHome();
    // planBlocked is the one state that keeps a sentence: with no current stop
    // the board above names nothing, so the plate has to carry the reason.
    expect(screen.getByText("Unlock with All-Access")).toBeInTheDocument();
    expect(screen.queryByText("Continue")).toBeNull();
  });

  test("a boardable current stop wins over planLocked stops further down the line", () => {
    h.groups = [
      grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 }),
      grp({ id: 2, position: 2, status: "locked", planLocked: true, phraseCount: 0 }),
    ];
    renderHome();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.queryByText("Unlock with All-Access")).toBeNull();
  });
});

// THE HYBRID TICKET AND ITS FRAME (owner's home mockup, build 17 on mobile,
// build 18 on web). Three pins: the pass sits INSIDE a "Your Journey" frame
// with a View Map pill; the brass mastered bar is gone and a row of station
// dots stands in its place; the CTA is unboxed, the verb and arrow carrying
// the app's accent instead of a plate.
describe("home Your Journey frame and hybrid ticket (build 18 parity)", () => {
  test("the pass sits inside the Your Journey frame, with a View Map pill", () => {
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    renderHome();
    const frame = screen.getByTestId("home-journey-frame");
    expect(frame).toHaveTextContent("YOUR JOURNEY");
    expect(frame).toHaveTextContent("Board your train and continue learning");
    // The board is INSIDE the frame, not beside it: the mockup's whole point
    // is a container bridging the modern app and the journey world.
    expect(frame.querySelector('[data-testid="journey-pass-card"]')).not.toBeNull();
    const viewMap = screen.getByTestId("home-view-map");
    // Inverted in build 20: the pill was kept for a one-pager map and now
    // opens it; the pass beneath still opens /journey.
    expect(viewMap.getAttribute("href")).toBe("/map");
    expect(viewMap).toHaveTextContent("View Map");
  });

  test("station dots replace the brass mastered bar, the learner's stop ringed", () => {
    // Zone 1 in the fixture is one phrase stop plus the tracing and story
    // rows, so the pass counts three stops with the learner on the first.
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    const { container } = renderHome();
    const row = screen.getByTestId("pass-stops-row");
    expect(row.querySelectorAll('[data-testid="stop-dot-here"]')).toHaveLength(1);
    expect(
      row.querySelectorAll('[data-testid^="stop-dot-"]').length,
    ).toBeGreaterThanOrEqual(3);
    // The terminus skyline closes the row, the way the mockup draws it.
    expect(row.querySelector('[data-testid="stop-dots-terminus"]')).not.toBeNull();
    // INVERTED: the old bar was a percentage-width brass fill and it is gone
    // from the pass. The mastered count still reaches the learner on the
    // stop card, which is where the mockup keeps it.
    expect(container.querySelector('[data-testid="journey-pass-card"] .duration-700')).toBeNull();
  });

  test("the CTA is unboxed: verb and arrow in the accent, no plate", () => {
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    renderHome();
    const verb = screen.getByText("Resume");
    expect(verb.className).toContain("text-primary");
    const plate = verb.parentElement as HTMLElement;
    // INVERTED: it was a bordered plate on TICKET.stockBottom. The mockup
    // reverses that ruling; the train, the reason and the verb sit straight
    // on the paper.
    expect(plate.className).not.toMatch(/border-2/);
    expect(plate.style.background).toBe("");
    expect(plate.style.borderColor).toBe("");
  });
});

describe("home boarding pass motion", () => {
  test("reduced motion renders the pass static with correct copy", () => {
    h.reduceMotion = true;
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    const { container } = renderHome();
    // No idle animation classes anywhere on the page.
    expect(container.querySelector(".animate-ticket-breathe")).toBeNull();
    expect(container.querySelector(".animate-ticket-shimmer")).toBeNull();
    expect(container.querySelector(".animate-cta-arrow-nudge")).toBeNull();
    expect(container.querySelector(".animate-train-drive")).toBeNull();
    // The static frame still carries the full progress-aware copy.
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText(/^Stop \d+ of \d+$/)).toBeInTheDocument();
  });

  test("pressing the pass still fires the hero analytics handler", async () => {
    h.groups = [grp({ status: "in_progress", masteredCount: 2, attemptedCount: 3 })];
    renderHome();
    const pass = screen.getByText("Resume").closest("a");
    expect(pass).not.toBeNull();
    await userEvent.setup().click(pass as HTMLElement);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.JOURNEY_ENTERED_VIA_HERO, {
      language: "gu",
    });
  });
});

describe("home boarding pass stub tear (task 899)", () => {
  const getPass = () =>
    screen.getByText("Start").closest("a") as HTMLElement;

  test("activation applies the tear sequence AND the navigation still fires", async () => {
    const { container, history } = renderHome();
    await userEvent.setup().click(getPass());
    // Tear classes land on the stub and the ticket body.
    expect(container.querySelector(".animate-stub-tear")).not.toBeNull();
    expect(container.querySelector(".animate-body-tear")).not.toBeNull();
    // Navigation is delayed by --tear-nav-delay (fallback constant in jsdom,
    // where the :root var is not readable) but is never swallowed.
    expect(history).not.toContain("/journey");
    await waitFor(() => expect(history).toContain("/journey"));
  });

  test("reduced motion navigates instantly with no tear", async () => {
    h.reduceMotion = true;
    const { container, history } = renderHome();
    await userEvent.setup().click(getPass());
    // Native Link navigation, synchronously, and no tear classes anywhere.
    expect(history).toContain("/journey");
    expect(container.querySelector(".animate-stub-tear")).toBeNull();
    expect(container.querySelector(".animate-body-tear")).toBeNull();
  });

  test("a failure inside the animation path falls through to immediate navigation", () => {
    const { history } = renderHome();
    const pass = getPass();
    // Make the tear's CSS-var read blow up, scoped to the documentElement
    // lookup the handler performs so unrelated style reads keep working.
    const original = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === document.documentElement) throw new Error("boom");
        return original(el, pseudo);
      });
    try {
      fireEvent.click(pass);
    } finally {
      spy.mockRestore();
    }
    expect(history).toContain("/journey");
  });
});

// Task #905: at the navigation moment the two mid-tear halves hand off to a
// document.body-level fixed overlay that outlives home's unmount, resumes
// the tear keyframes via negative animation-delay, and gust-sweeps each
// piece away over the incoming route. These pins cover the overlay's
// lifecycle: spawn AT NAVIGATION (never before), removal on the final gust
// animationend, removal via the timeout fallback when animation events
// never fire (jsdom fires none, so that pin exercises the REAL fallback
// path), and the two paths that must never create an overlay at all
// (reduced motion, animation-path failure).
describe("home boarding pass tear hand-off overlay (task 905)", () => {
  const getPass = () =>
    screen.getByText("Start").closest("a") as HTMLElement;
  const overlay = () => document.body.querySelector("[data-tear-overlay]");
  const animEnd = (name: string) =>
    Object.assign(new Event("animationend", { bubbles: true }), {
      animationName: name,
    });

  test("both halves hand off to the overlay at navigation; only the final gust animationend removes it (no orphaned node)", async () => {
    const { history } = renderHome();
    await userEvent.setup().click(getPass());
    // Nothing is spawned at activation — the hand-off happens in the same
    // beat as the delayed navigation.
    expect(overlay()).toBeNull();
    await waitFor(() => expect(history).toContain("/journey"));
    const node = overlay() as HTMLElement;
    expect(node).not.toBeNull();
    // Inert, fixed, above the incoming route.
    expect(node.getAttribute("aria-hidden")).toBe("true");
    expect(node.style.pointerEvents).toBe("none");
    expect(node.style.position).toBe("fixed");
    // BOTH halves ride the overlay, resuming their tear keyframes inside
    // staggered gust wrappers.
    expect(node.querySelectorAll(".animate-stub-tear").length).toBe(1);
    expect(node.querySelectorAll(".animate-body-tear").length).toBe(1);
    expect(node.querySelectorAll(".animate-gust-away").length).toBe(2);
    const final = node.querySelector("[data-gust-final]") as HTMLElement;
    expect(final).not.toBeNull();
    // A bubbling tear-keyframe end must NOT remove the overlay mid-gust...
    fireEvent(final, animEnd("stub-tear"));
    expect(overlay()).not.toBeNull();
    // ...only the final wrapper's gust end does.
    fireEvent(final, animEnd("gust-away"));
    expect(overlay()).toBeNull();
  });

  test("overlay removes itself via the timeout fallback when animationend never fires", async () => {
    const { history } = renderHome();
    fireEvent.click(getPass());
    await waitFor(() => expect(history).toContain("/journey"));
    expect(overlay()).not.toBeNull();
    // jsdom never dispatches animation events, so reaching removal here
    // proves the --tear-overlay-cleanup deadline (fallback 900ms from the
    // hand-off) fires.
    await waitFor(() => expect(overlay()).toBeNull(), { timeout: 2500 });
  });

  test("reduced motion navigates instantly and never creates an overlay", async () => {
    h.reduceMotion = true;
    const { history } = renderHome();
    await userEvent.setup().click(getPass());
    expect(history).toContain("/journey");
    expect(overlay()).toBeNull();
  });

  test("failure inside the animation path leaves no orphaned overlay and still navigates", () => {
    const { history } = renderHome();
    const pass = getPass();
    // Same scoped blow-up as the 899 failure pin: the overlay spawn reads
    // the cleanup var from documentElement BEFORE touching the DOM, so a
    // failing style read must produce zero overlay nodes.
    const original = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === document.documentElement) throw new Error("boom");
        return original(el, pseudo);
      });
    try {
      fireEvent.click(pass);
    } finally {
      spy.mockRestore();
    }
    expect(history).toContain("/journey");
    expect(overlay()).toBeNull();
  });
});

// Task #978: the tear SFX + light haptic fire at the exact moment the tear
// starts (inside the try, after the reduceMotion || tearing early-return,
// before setTearing) so haptic, sound onset, and tear start land as one
// simultaneous beat. Reduced motion stays instant and completely silent.
describe("home boarding pass tear SFX + haptic (task 978)", () => {
  const getPass = () =>
    screen.getByText("Start").closest("a") as HTMLElement;

  test("activation fires playTearSfx once and a light webHaptic", async () => {
    renderHome();
    await userEvent.setup().click(getPass());
    expect(h.playTearSfx).toHaveBeenCalledTimes(1);
    expect(h.webHaptic).toHaveBeenCalledWith("light");
  });

  test("reduced-motion activation fires neither sound nor haptic", async () => {
    h.reduceMotion = true;
    const { history } = renderHome();
    await userEvent.setup().click(getPass());
    expect(history).toContain("/journey");
    expect(h.playTearSfx).not.toHaveBeenCalled();
    expect(h.webHaptic).not.toHaveBeenCalledWith("light");
  });

  // Build 35: Sound effects off suppresses the tear SFX but never blocks navigation.
  test("Sound effects off — playTearSfx is suppressed", async () => {
    localStorage.setItem("bolo.soundEffects", "off");
    try {
      renderHome();
      await userEvent.setup().click(getPass());
      expect(h.playTearSfx).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem("bolo.soundEffects");
    }
  });
});
