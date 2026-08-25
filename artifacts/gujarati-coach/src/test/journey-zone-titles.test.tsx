import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Task #906: journey zone titles come from the categories listing (the same
// source the Phrasebook uses), with the embedded JOURNEY_ZONES titles as a
// loading-state fallback only. Pins the behavior contract:
// (1) a server-side category rename shows up on the map without a client
//     release — and is NOT a hard-stop error anymore;
// (2) while the categories listing has no data, the fallback titles render;
// (3) the id joins stay authoritative (titles resolve by id, not position).
const h = vi.hoisted(() => ({
  cats: undefined as unknown[] | undefined,
  reduceMotion: false,
  // Task 1082: per-zone payloads, so the header derivation, the current-stop
  // card and the scroll-on-open can be exercised on a real six-zone line.
  // Left undefined, every zone serves the single default group these title
  // tests were written against.
  zones: undefined as (unknown[] | undefined)[] | undefined,
  // Aug 18 2026: a zone only folds when it owes no uncollected Chai, so the
  // fold tests need to say which trackside signals have been cleared.
  signalsByZone: {} as Record<
    number,
    { rewardChai: number; waves: string[]; clears: string[] }
  >,
}));

// framer-motion caches the prefers-reduced-motion media query globally on its
// first subscription, so a per-test matchMedia swap only works in the first
// test of a file. Drive the hook directly instead.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReducedMotion: () => h.reduceMotion,
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
  useEntitlements: () => ({ isAllAccess: true, isLoading: false }),
}));

const GROUPS = [
  {
    id: 101,
    title: "Stop 1",
    stage: "phrase",
    position: 1,
    status: "unlocked",
    phraseCount: 5,
    masteredCount: 0,
  },
];

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: h.cats,
    isLoading: h.cats === undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useListCategoryLessonGroups: (zoneId: number) => ({
    data: {
      lessonGroups: h.zones
        ? h.zones[JOURNEY_ZONE_IDS.indexOf(zoneId)] ?? []
        : GROUPS,
      signals: h.signalsByZone[zoneId] ?? { rewardChai: 1, waves: [], clears: [] },
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import Journey from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";

// Read at call time (inside the mocked hook's body), never at factory time.
const JOURNEY_ZONE_IDS = JOURNEY_ZONES.map((z) => z.id);

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

beforeEach(() => {
  h.signalsByZone = {};
  h.cats = undefined;
  h.zones = undefined;
  h.reduceMotion = false;
});

const cat = (id: number, title: string) => ({
  id,
  title,
  titleNative: null,
  iconName: "HandHeart",
  accent: null,
  phraseCount: 5,
  masteredCount: 0,
});

describe("journey zone titles from categories (task 906)", () => {
  test("a renamed category renders on the map instead of a hard-stop error", () => {
    h.cats = [
      cat(1, "Warm Welcomes"),
      ...JOURNEY_ZONES.slice(1).map((z) => cat(z.id, z.title)),
    ];
    renderJourney();
    // No error screen, and the live title (resolved by id) is on the map.
    expect(screen.queryByText(/couldn't load|went wrong/i)).toBeNull();
    expect(screen.getAllByText(/Warm Welcomes/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Greetings & Manners/)).toBeNull();
  });

  test("fallback titles render while the categories listing has no data", () => {
    h.cats = undefined;
    renderJourney();
    expect(screen.getAllByText(/Greetings & Manners/).length).toBeGreaterThan(0);
  });

  test("titles resolve by id, not by array position", () => {
    // Reverse the listing order — titles must still land on the right zones.
    h.cats = [...JOURNEY_ZONES].reverse().map((z) => cat(z.id, `Live ${z.title}`));
    renderJourney();
    expect(screen.getAllByText(/Live Greetings & Manners/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Live Feelings/).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Task 1082 — journey map UX polish.
// ---------------------------------------------------------------------------

/** A lesson group as the zone endpoint serves it. */
const grp = (
  id: number,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  title: `Stop ${id}`,
  stage: "phrase",
  position: id,
  status,
  phraseCount: 8,
  masteredCount: 0,
  attemptedCount: 0,
  ...extra,
});

const zonesOf = (...counts: Array<unknown[]>) => counts;

describe("boarding-pass header numbers (task 1082 item 1)", () => {
  test("reads the learner's current station, not the count of finished ones", () => {
    // Seven stations: two finished, the learner standing on the third. The
    // header used to render "{doneCount}/{totalCount} stations", so the slot a
    // learner reads as "the stop I am on" carried the number 2 while the map
    // lit up stop 3. Both numbers now come off the one flattened station list
    // the map, the payload and the Chacha encounter logic already share.
    h.zones = zonesOf(
      [grp(1, "completed", { masteredCount: 8, attemptedCount: 8 }), grp(2, "tested_out")],
      [grp(3, "in_progress", { masteredCount: 3, attemptedCount: 5 })],
      [grp(4, "unlocked")],
      [grp(5, "locked")],
      [grp(6, "locked")],
      [grp(7, "locked")],
    );
    renderJourney();
    expect(screen.getByText(/· Stop 3 of 7 stations/)).toBeInTheDocument();
    expect(screen.queryByText(/2\/7 stations/)).toBeNull();
  });

  test("counts every station the six zones serve, with no second source", () => {
    // The total is the length of that same list: 11 + 10 + 8 + 10 + 10 + 10,
    // the real Gujarati shape in the development library. Nothing in the
    // client caps or filters it.
    const zone = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => grp(from + i, "locked"));
    h.zones = zonesOf(
      [grp(1, "in_progress", { masteredCount: 1, attemptedCount: 2 }), ...zone(10, 2)],
      zone(10, 12),
      zone(8, 22),
      zone(10, 30),
      zone(10, 40),
      zone(10, 50),
    );
    renderJourney();
    expect(screen.getByText(/· Stop 1 of 59 stations/)).toBeInTheDocument();
  });

  // ── Folding finished zones ────────────────────────────────────────────────
  // With 52 stations the page is dominated by work already done, so a finished
  // zone folds to a single row. The GUARD is the interesting half: an earlier
  // attempt at this was thrown away because folding also hid trackside signals,
  // and an active or waved signal still owes the learner Chai.

  /** Six zones, the first N finished, with every signal in them cleared. */
  const foldable = (finished: number) => {
    const zs: unknown[][] = [];
    let id = 100;
    for (let zi = 0; zi < 6; zi++) {
      const done = zi < finished;
      zs.push([
        grp(id++, done ? "completed" : zi === finished ? "in_progress" : "locked", {
          masteredCount: done ? 8 : 2,
          attemptedCount: done ? 8 : 3,
        }),
        grp(id++, done ? "completed" : "locked", {
          masteredCount: done ? 8 : 0,
          attemptedCount: done ? 8 : 0,
        }),
      ]);
    }
    return zs;
  };

  /** Clear every gap, so no zone is owed any Chai. */
  const clearAllSignals = () => {
    const clears = Array.from({ length: 40 }, (_, i) => `gap-${i + 1}`);
    for (const z of JOURNEY_ZONES) {
      h.signalsByZone[z.id] = { rewardChai: 1, waves: [], clears };
    }
  };

  test("a finished zone with nothing owed folds to one row", () => {
    h.zones = foldable(2) as never;
    clearAllSignals();
    renderJourney();

    expect(screen.getByTestId("zone-collapsed-0")).toBeInTheDocument();
    expect(screen.getByTestId("zone-collapsed-0")).toHaveTextContent("2 stops ridden");
  });

  test("a zone still owing Chai NEVER folds, however finished it is", () => {
    // The reason the first attempt at this was reverted: folding a zone with an
    // active or waved signal hides Chai the learner has not collected.
    h.zones = foldable(2) as never;
    // No clears anywhere: every signal still owes.
    renderJourney();

    expect(screen.queryByTestId("zone-collapsed-0")).toBeNull();
    expect(screen.queryByTestId("zone-collapsed-1")).toBeNull();
  });

  test("the zone the learner is standing in never folds", () => {
    // The one thing this map exists to show is where you are.
    h.zones = foldable(2) as never;
    clearAllSignals();
    renderJourney();

    expect(screen.queryByTestId("zone-collapsed-2")).toBeNull();
  });

  test("an unfinished zone never folds", () => {
    h.zones = foldable(2) as never;
    clearAllSignals();
    renderJourney();

    for (const zi of [3, 4, 5]) {
      expect(screen.queryByTestId(`zone-collapsed-${zi}`)).toBeNull();
    }
  });

  test("tapping a folded zone opens it again", () => {
    h.zones = foldable(2) as never;
    clearAllSignals();
    renderJourney();

    fireEvent.click(screen.getByTestId("zone-collapsed-0"));
    expect(screen.queryByTestId("zone-collapsed-0")).toBeNull();
    // And the other folded zone is unaffected: expanding is per zone.
    expect(screen.getByTestId("zone-collapsed-1")).toBeInTheDocument();
  });

  test("the desktop rail indexes every zone with its real progress", () => {
    // The map column is phone-width and centred, so on a wide screen most of
    // the viewport is empty margin while the learner scrolls 52 stations
    // looking for where they are. The rail fills it with the whole line.
    h.zones = zonesOf(
      [grp(1, "completed", { masteredCount: 8, attemptedCount: 8 }), grp(2, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(3, "in_progress", { masteredCount: 3, attemptedCount: 5 }), grp(4, "locked")],
      [grp(5, "locked")],
      [grp(6, "locked")],
      [grp(7, "locked")],
      [grp(8, "locked")],
    );
    renderJourney();

    const rail = screen.getByTestId("journey-zone-rail");
    expect(rail).toBeInTheDocument();
    // One entry per fare zone, no more and no fewer.
    for (let zi = 0; zi < 6; zi++) {
      expect(screen.getByTestId(`zone-rail-${zi}`)).toBeInTheDocument();
    }
    // Counts come off the same station list the map draws, so they cannot
    // disagree with it: zone 1 is 2/2 done, zone 2 is 0/2.
    expect(screen.getByTestId("zone-rail-0")).toHaveTextContent("2/2");
    expect(screen.getByTestId("zone-rail-1")).toHaveTextContent("0/2");
  });

  // THE STUB IS GONE, AND THESE TWO TESTS ARE INVERTED RATHER THAN DELETED.
  //
  // They asserted the stub always carried a zone stamp: once for a finished
  // line, where the stamp used to be gated on a CURRENT station and rendered
  // empty, and once mid-line. Both were fixes to a real bug at the time.
  //
  // On 2026-08-25 the stub was removed outright: "technically, the ticket is
  // already torn, just get rid of the stub". A pass being read on the train
  // has had its stub taken, so the perforation is now the header's torn right
  // edge with nothing past it. What has to hold is that no stub comes back on
  // either of the two paths that used to draw one, so the cases are kept and
  // their expectations reversed.
  test("a finished line carries no stub stamp", () => {
    h.zones = zonesOf(
      [grp(1, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(2, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(3, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(4, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(5, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(6, "completed", { masteredCount: 8, attemptedCount: 8 })],
    );
    renderJourney();
    expect(screen.queryByTestId("zone-stamp")).toBeNull();
  });

  test("a line still being ridden carries no stub stamp either", () => {
    h.zones = zonesOf(
      [grp(1, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(2, "in_progress", { masteredCount: 3, attemptedCount: 5 })],
      [grp(3, "locked")],
      [grp(4, "locked")],
      [grp(5, "locked")],
      [grp(6, "locked")],
    );
    renderJourney();
    expect(screen.queryByTestId("zone-stamp")).toBeNull();
  });

  test("a finished line reads as complete rather than borrowing a stop number", () => {
    h.zones = zonesOf(
      [grp(1, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [grp(2, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [], [], [], [],
    );
    renderJourney();
    expect(screen.getByText(/· All 2 stations complete/)).toBeInTheDocument();
  });
});

describe("current-stop card (task 1082 item 2)", () => {
  test('carries no "Bolo is waiting here", in either current state', () => {
    // Bolo herself stands beside the card, so the fragment only ever said in
    // words what the mascot says in the art — and it was what wrapped the
    // status line at narrow widths.
    for (const [status, copy] of [
      ["unlocked", /Now boarding/],
      ["in_progress", /In progress/],
    ] as const) {
      h.zones = zonesOf(
        [grp(1, status, status === "in_progress" ? { masteredCount: 3, attemptedCount: 5 } : {})],
        [], [], [], [],
        [],
      );
      const { unmount } = renderJourney();
      expect(screen.queryByText(/Bolo is waiting/)).toBeNull();
      // The status copy itself is untouched.
      expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
      unmount();
    }
  });

  test("keeps the stop title, the progress bar and the mastered count", () => {
    h.zones = zonesOf(
      [grp(1, "in_progress", { masteredCount: 3, attemptedCount: 5 })],
      [], [], [], [], [],
    );
    const { container } = renderJourney();
    // WAS "Stop 1 of 1", and it was passing for the wrong reason: the match was
    // coming from the EMPTY zones, each of which had grown a lone tracing stop
    // numbered "Stop 1 of 1" under an empty postcard. Zone 1's real stop had
    // already become "Stop 1 of 2" once tracing was added to it. Both halves
    // fixed 2026-08-23: a zone with no phrase stops gets no tracing stop, and
    // this now asserts the number the current-stop card actually carries.
    //
    // "of 3" since 2026-08-24: the STORY stop joined every zone that has a
    // book, which is all six of journey 1. One phrase stop plus a tracing stop
    // plus a story stop is three. The empty zones still get neither, which is
    // the half of this that must keep holding.
    expect(screen.getAllByText("Stop 1 of 3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Stop 1 of 1")).toBeNull();
    expect(screen.getByText("3/8 mastered")).toBeInTheDocument();
    expect(container.querySelector(".h-1\\.5")).not.toBeNull();
  });
});

describe("journey-map copy (task 1082 item 3)", () => {
  test("uses no em dash anywhere on the map, in text or in labels", () => {
    h.zones = zonesOf(
      [grp(1, "in_progress", { masteredCount: 3, attemptedCount: 5 })],
      [grp(2, "locked", { stage: "sentence", planLocked: true })],
      [], [], [], [],
    );
    const { container } = renderJourney();
    expect(container.textContent).not.toContain("\u2014");
    for (const el of Array.from(container.querySelectorAll("[aria-label],[title]"))) {
      expect(el.getAttribute("aria-label") ?? "").not.toContain("\u2014");
      expect(el.getAttribute("title") ?? "").not.toContain("\u2014");
    }
    // The replacements are on screen, not merely absent.
    expect(
      screen.getByText(/Terminus: Dwarka, the festival finale awaits/),
    ).toBeInTheDocument();
    // "Stop 1 of 1" until 2026-08-23 and "Stop 1 of 2" until 2026-08-24, as a
    // tracing stop and then a story stop joined every zone carrying content.
    // One phrase stop, one tracing stop and one story stop is three, and
    // neither of the two extra rows is ever first, so the phrase stop keeps
    // position 1. The claim under test is the COPY, not the count: no em dash,
    // and the replacement wording actually on screen.
    expect(screen.getByLabelText("Stop 1 of 3: In progress")).toBeInTheDocument();
  });

  test("centres the terminus label below the dot, clear of the bunting", () => {
    // It used to flank the dot on whichever side the serpentine ended, which
    // put it under the bunting and right-aligned a wrapped second line.
    h.zones = zonesOf([grp(1, "unlocked")], [], [], [], [], []);
    const { container } = renderJourney();
    const label = Array.from(container.querySelectorAll("div")).find((d) =>
      /^Terminus: /.test(d.textContent ?? ""),
    )!;
    expect(label.className).toContain("text-center");
    expect(label.className).not.toContain("text-right");
    // Spans the full column rather than being squeezed beside the dot.
    expect(label.style.left).toBe("12px");
    expect(label.style.right).toBe("12px");
  });
});

describe("scroll to the current stop on open (task 1082 item 4)", () => {
  /** Learner deep into the line: eleven finished stops, then the current one. */
  const deepIntoTheLine = () => {
    h.zones = zonesOf(
      Array.from({ length: 11 }, (_, i) =>
        grp(i + 1, "completed", { masteredCount: 8, attemptedCount: 8 }),
      ),
      [grp(12, "unlocked")],
      [], [], [], [],
    );
  };

  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    // jsdom has no scrollTo at all; the component feature-detects it, so the
    // spy is what makes the behaviour observable here.
    scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", {
      writable: true,
      configurable: true,
      value: scrollTo,
    });
  });

  test("lands on the current stop, comfortably clear of the top edge", async () => {
    deepIntoTheLine();
    renderJourney();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    const arg = scrollTo.mock.calls[0]![0] as ScrollToOptions;
    // Past the top of the line: this learner's stop is the twelfth, so the map
    // does not leave them staring at stop 1.
    expect(arg.top).toBeGreaterThan(0);
    expect(arg.behavior).toBe("smooth");
  });

  test("leaves an early learner at the top rather than scrolling their stop up", async () => {
    // Comfortable framing, checked at the edge where it bites: stop 1 is
    // already in view, so the lead clamps the target to the top of the line.
    h.zones = zonesOf([grp(1, "unlocked")], [], [], [], [], []);
    renderJourney();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    // Effectively the top of the line: the lead is larger than the distance to
    // stop 1, so the clamp keeps the whole head of the map on screen.
    expect((scrollTo.mock.calls[0]![0] as ScrollToOptions).top).toBeLessThan(20);
  });

  test("never scrolls twice in one visit", async () => {
    deepIntoTheLine();
    const { rerender } = renderJourney();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    // A refetch or any other re-render inside the same visit must leave the
    // learner exactly where they are.
    const { hook } = memoryLocation({ path: "/journey", record: true });
    rerender((<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement);
    await new Promise((r) => setTimeout(r, 30));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  test("yields to a learner who starts scrolling first", async () => {
    deepIntoTheLine();
    renderJourney();
    window.dispatchEvent(new Event("wheel"));
    await new Promise((r) => setTimeout(r, 40));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("jumps instead of animating under reduced motion", async () => {
    h.reduceMotion = true;
    deepIntoTheLine();
    renderJourney();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    expect((scrollTo.mock.calls[0]![0] as ScrollToOptions).behavior).toBe("auto");
  });

  test("stays put when there is no current stop to land on", async () => {
    h.zones = zonesOf(
      [grp(1, "completed", { masteredCount: 8, attemptedCount: 8 })],
      [], [], [], [], [],
    );
    renderJourney();
    await new Promise((r) => setTimeout(r, 40));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
