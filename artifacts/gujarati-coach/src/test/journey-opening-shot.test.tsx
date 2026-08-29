import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { INTRO_SCROLL } from "@/lib/journey-intro-scroll";

// THE MAP OPENS AT THE TOP, HOLDS ON THE ZONE CARD, THEN TRAVELS.
//
// It has brought the current stop into view since Task 1082. What it did not do
// was let anyone SEE the zone card first: the scroll started one frame after
// layout, so the beat the owner asked for did not exist. The pace was the
// browser's `behavior: "smooth"`, which has no duration control and gets slower
// the further it goes, which is the opposite of "maybe faster for further
// stops".
//
// The shot is a hand-driven tween now, so these tests drive the clock and the
// frames themselves rather than waiting on either.
//
// Mobile twin: the opening-shot block in bolo-mobile/__tests__/journey-map.test.tsx.

const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  isPlus: true,
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

vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEntitlements: () => ({ isPlus: h.isPlus, isAllAccess: h.isPlus, isLoading: false }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useListCategoryLessonGroups: (categoryId: number) => ({
    data: { lessonGroups: h.groupsByZone[categoryId] ?? [] },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useGetScriptTraceProgress: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import Journey, { INTRO_HOPS } from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";

const grp = (id: number, position: number, status: string) => ({
  id,
  title: `Stop ${position + 1}`,
  stage: "phrase",
  position,
  status,
  phraseCount: 10,
  masteredCount: status === "completed" ? 10 : 0,
  attemptedCount: status === "completed" ? 10 : 0,
});

/**
 * Learner deep into the line: eleven finished stops, then the one they are on,
 * all inside zone 1.
 *
 * DELIBERATELY NOT "zone 1 complete, current stop in zone 2", which was the
 * first shape this fixture took and made the test assert nothing: a zone that
 * is all done and holds no current stop FOLDS, so finishing zone 1 pulls the
 * whole map back up and the shot has almost nowhere to travel. That fold is
 * correct product behaviour and it is exactly why the fixture keeps the
 * learner inside an unfinished zone.
 */
function deepIntoTheLine() {
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z, zi) => {
    h.groupsByZone[z.id] =
      zi === 0
        ? Array.from({ length: 12 }, (_, i) =>
            grp(z.id * 100 + i, i, i < 11 ? "completed" : "unlocked"),
          )
        : Array.from({ length: 9 }, (_, i) => grp(z.id * 100 + i, i, "locked"));
  });
}

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

let scrollTo: ReturnType<typeof vi.fn>;
let frames: FrameRequestCallback[];

/** Play every frame queued so far, at a given point on the frame clock. */
const playFrames = (now: number) => {
  const queued = frames;
  frames = [];
  queued.forEach((cb) => cb(now));
};
/** Past the layout frame, past the hold, then past the shot's longest run. */
/** THE LONGEST RUN IS A ROW PER BEAT, CAPPED (build 18, mobile's build 17
 *  pace): INTRO_HOPS.max rows at INTRO_HOPS.ms each, rather than
 *  INTRO_SCROLL.maxMs. Owner: "autoscroll happens too quickly when you join
 *  this page. slow it down so you can see the stops you passed." */
const SHOT_MAX_MS = INTRO_HOPS.max * INTRO_HOPS.ms;
const playWholeShot = () => {
  playFrames(0);
  vi.advanceTimersByTime(INTRO_SCROLL.holdMs);
  playFrames(0);
  playFrames(SHOT_MAX_MS + 1);
};
const lastTop = () =>
  (scrollTo.mock.calls[scrollTo.mock.calls.length - 1]![0] as { top: number }).top;

beforeEach(() => {
  vi.useFakeTimers();
  h.isPlus = true;
  frames = [];
  scrollTo = vi.fn();
  vi.stubGlobal("scrollY", 0);
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the opening shot on the journey map", () => {
  test("holds on the zone card before it moves anything", () => {
    deepIntoTheLine();
    renderJourney();
    playFrames(0);
    // THE POINT OF THE WHOLE CHANGE. The frame after layout used to start the
    // scroll, so the fare-zone card at the top was never on screen long enough
    // to be read.
    expect(scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs - 1);
    playFrames(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("travels to the current stop, and never hands the work to the browser", () => {
    deepIntoTheLine();
    renderJourney();
    playWholeShot();
    expect(scrollTo).toHaveBeenCalled();
    expect(lastTop()).toBeGreaterThan(0);
    // `behavior: "smooth"` is the thing being replaced: it has no duration
    // control and gets SLOWER the further it goes, which is backwards.
    for (const call of scrollTo.mock.calls) {
      expect((call[0] as { behavior: string }).behavior).toBe("auto");
    }
  });

  test("lands you on your card the moment you touch the screen", () => {
    deepIntoTheLine();
    const first = renderJourney();
    playWholeShot();
    const destination = lastTop();
    expect(destination).toBeGreaterThan(0);
    first.unmount();

    scrollTo.mockClear();
    frames = [];
    renderJourney();
    playFrames(0);
    window.dispatchEvent(new Event("pointerdown"));
    // IT SKIPS TO THE DESTINATION, IT DOES NOT CANCEL. Cancelling is what this
    // used to do, and it stranded a learner who reached for the screen halfway
    // down a map at a position nobody chose.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]![0]).toMatchObject({ top: destination, behavior: "auto" });
    // Nothing runs afterwards: no hold still pending, no tween still queued.
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs + SHOT_MAX_MS);
    playFrames(9999);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  test("travels about a row per beat, capped at ten rows' worth", () => {
    // The pace the owner asked for, pinned as the tween's duration: a stop
    // ten or more rows down takes exactly the cap, so further means faster.
    deepIntoTheLine();
    renderJourney();
    playFrames(0);
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs);
    playFrames(0);
    // Just short of the cap the tween is still travelling...
    playFrames(SHOT_MAX_MS - 40);
    const before = lastTop();
    // ...and on the cap it has landed and stops calling.
    playFrames(SHOT_MAX_MS + 1);
    const landed = lastTop();
    expect(landed).toBeGreaterThan(before);
    const calls = scrollTo.mock.calls.length;
    playFrames(SHOT_MAX_MS + 500);
    expect(scrollTo.mock.calls.length).toBe(calls);
    // And it took longer than the old 900ms cap would have allowed: at 901ms
    // the shot is nowhere near home.
    scrollTo.mockClear();
    frames = [];
    deepIntoTheLine();
    renderJourney();
    playFrames(0);
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs);
    playFrames(0);
    playFrames(INTRO_SCROLL.maxMs + 1);
    expect(lastTop()).toBeLessThan(landed);
  });

  test("a wheel cancels the shot rather than landing it", () => {
    // THE ASYMMETRY IS THE DESIGN. A tap moves nothing on its own, so the shot
    // can answer it with a destination. A wheel already scrolls the page, so
    // answering it with a jump would compose the jump WITH the learner's own
    // delta and land somewhere neither of them chose. They are driving.
    deepIntoTheLine();
    renderJourney();
    playFrames(0);
    window.dispatchEvent(new Event("wheel"));
    expect(scrollTo).not.toHaveBeenCalled();
    // And it is really over, not merely paused.
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs + INTRO_SCROLL.maxMs);
    playFrames(9999);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("a key cancels it too, for the same reason", () => {
    deepIntoTheLine();
    renderJourney();
    playFrames(0);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs + INTRO_SCROLL.maxMs);
    playFrames(9999);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("takes a page that arrives scrolled back to the top first", () => {
    // THIS USED TO ASSERT THE OPPOSITE, and the opposite was the bug. The shot
    // bailed whenever the page was not already at zero, on the theory that
    // something had moved the viewport and that something was the learner.
    // Arriving from a scrolled home page is exactly that case and it is not the
    // learner driving: the browser carried a scroll position across a route
    // change. The shot was skipped on the commonest way of reaching this page,
    // reported as "not seeing the start at the top and scroll to active card".
    vi.stubGlobal("scrollY", 400);
    deepIntoTheLine();
    renderJourney();
    playFrames(0);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]![0]).toMatchObject({ top: 0 });
    // And the shot still runs from there.
    vi.advanceTimersByTime(INTRO_SCROLL.holdMs);
    playFrames(0);
    playFrames(INTRO_SCROLL.maxMs + 1);
    expect(lastTop()).toBeGreaterThan(0);
  });
});
