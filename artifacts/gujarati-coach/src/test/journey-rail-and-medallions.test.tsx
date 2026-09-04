import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// THE REPAINTED RAIL AND THE STOP MEDALLIONS, ON WEB.
//
// These shipped to MOBILE ONLY on 2026-08-26 while the commit message said
// nothing about which platform, so the handoff read as though web had them too.
// It did not. Web kept the old line-coloured rail whose centre stroke was
// `hsl(var(--background))`, which was invisible over a flat theme and PUNCHED A
// THEMED HOLE straight down the middle of every painting once the backdrops
// landed, and it kept status-only markers where mobile had grown kind-bearing
// medallions.
//
// Two kinds of assertion here, and the split is deliberate:
// (1) EXACT-SHAPE on the shared constants, the STALL_PLACEMENT idiom. The whole
//     object, so a value edited on one platform fails on the other. A constant
//     with a twin needs a test that can tell, which is exactly what was missing
//     when the rail went out on one platform.
// (2) A RENDER pass proving the medallions actually reach the map and carry the
//     kind rather than the status.

import { RAIL, RAIL_GLOW_PASSES, RAIL_STROKE } from "@/lib/rail-palette";
import { stopEmblem } from "@/lib/stop-emblems";

const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  passedIds: [] as string[],
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
  useEntitlements: () => ({
    isPlus: h.isPlus,
    isAllAccess: h.isPlus,
    isLoading: false,
  }),
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
    data: h.passedIds.map((characterId) => ({ characterId, passed: true })),
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import Journey from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

const grp = (id: number, position: number) => ({
  id,
  title: `Stop ${position + 1}`,
  stage: "phrase",
  position,
  status: position === 0 ? "unlocked" : "locked",
  phraseCount: 10,
  masteredCount: 0,
});

beforeEach(() => {
  h.passedIds = [];
  h.isPlus = true;
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z) => {
    h.groupsByZone[z.id] = Array.from({ length: 9 }, (_, i) => grp(z.id * 100 + i, i));
  });
});

describe("the rail palette is one palette across both platforms", () => {
  // Sampled from the owner's rail sheet, not picked. Mobile twin:
  // bolo-mobile/lib/railPalette.ts, asserted there with the same three shapes.
  test("the wood, the rails and the green centre are exactly these", () => {
    // INVERTED 2026-08-29 (build 18, web parity with mobile's build 17, the
    // owner's hybrid journey mockup). The rails are the app's violet on both
    // runs ("The track ahead should have the two parallel purple lines"), the
    // travelled centre is the owner's lime, sent as a swatch after "#ECF584
    // looks yellow, not green" (and #4ADE80 was mint), the halo is lime with
    // it, and betweenUnlit is GONE: ahead there is nothing between the rails
    // at all ("future track should be only 2 purple lines, not filled").
    expect(RAIL).toEqual({
      // Darker planks from build 22 ("larger and darker"); were #8A5D4A over #361C0F.
      tie: "#6B4130",
      tieInk: "#22110A",
      rail: "#8B5CF6",
      between: "#84CC16",
      glow: "#BEF264",
    });
  });

  test("the glow is one narrow pass under the centre stripe", () => {
    // WAS TWO PASSES AT 28px AND 18px, which is three times the width of the
    // track itself: it washed the whole rail pale green and lost the twin-rail
    // read entirely. Reported from the preview as "train tracks don't look
    // right". The sheet draws no halo at all; it draws a bright green CENTRE
    // STRIPE down a brown sleeper ladder, which RAIL.between now is. What
    // survives here is one narrow glow under that stripe. 12 at 0.5 from
    // build 17/18, with the heavier rail under it.
    // 16 from build 22, with the wider rail under it.
    expect(RAIL_GLOW_PASSES).toEqual([{ width: 16, opacity: 0.5 }]);
  });

  test("the track strokes are exactly this shape", () => {
    // INVERTED 2026-08-29 (build 18). Heavier all round ("the train tracks
    // arent heavy enough"): 18 sleepers on a 5 9 rhythm, a 12 rail stroke
    // over a 7 centre. The run ahead gains `line` and `gauge` (two 2.5
    // strokes 9.5 apart, outer edges matching the 12) and loses unlitDash:
    // it is no longer dashed, state is the light down the middle.
    // INVERTED AGAIN build 22 (owner: "much heavier and a bit wider, they
    // are the centerpoint of the journey"): 26 on 7 11, 16 over 9, 3.5
    // lines 12.5 apart. Mobile twin pins the same six.
    expect(RAIL_STROKE).toEqual({
      tie: 32,
      rail: 16,
      between: 9,
      line: 3.5,
      gauge: 12.5,
      tieDash: "10 12",
      unlitOpacity: 1,
    });
  });

  test("the run ahead is two lines a gauge apart, with nothing between", () => {
    // The pair's outer edges span exactly what the travelled rail stroke
    // spans, so the track keeps one width along its whole length.
    expect(RAIL_STROKE.gauge + RAIL_STROKE.line).toBeCloseTo(RAIL_STROKE.rail, 5);
    expect("betweenUnlit" in RAIL).toBe(false);
    expect("unlitDash" in RAIL_STROKE).toBe(false);
  });

  test("nothing between the rails is a theme colour", () => {
    // THIS IS THE HOLE. The centre stroke used to be hsl(var(--background)),
    // which drew a strip of page colour down the middle of every painting. It
    // has to be a literal sampled from the sheet, never a token.
    expect(RAIL.between).toMatch(/^#[0-9A-F]{6}$/i);
    expect(RAIL.between).not.toMatch(/var\(|hsl\(/);
  });
});

describe("the stop medallions are one set across both platforms", () => {
  test("every kind resolves to art that already ships in public/journey", () => {
    // The six PNGs landed with the mobile medallions and web never read them,
    // so wiring this cost no bundle bytes. A kind pointing at a file that is
    // not there would render an empty medallion and nothing else would fail.
    const kinds = ["station", "halt", "trace", "story", "postcard", "terminus"] as const;
    for (const kind of kinds) {
      expect(stopEmblem(kind)).toMatch(new RegExp(`journey/emblem-${kind}\\.png$`));
    }
  });
});

describe("the medallions reach the map and say KIND, not status", () => {
  test("a phrase, a tracing, a story and a letter stop each wear their own", () => {
    renderJourney();
    // Status is already on the card beside every stop, so the marker's job is
    // the half the card cannot say.
    expect(screen.getAllByTestId("station-medallion-station").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("station-medallion-trace").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("station-medallion-story").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("station-medallion-letter").length).toBeGreaterThan(0);
  });

  test("the marker is a numbered badge, and the number is the row's", () => {
    // THE CUT-ART MEDALLION BECAME A NUMBERED PARCHMENT BADGE (build 17 on
    // mobile, build 18 here, the owner's hybrid mockup). The number is what
    // the card beside it counts in, and the chalkboard and the plaque no
    // longer print it themselves, so the badge is the only place a learner
    // reads "2" for the tracing stop.
    renderJourney();
    const numbers = screen
      .getAllByTestId(/^station-medallion-/)
      .map((el) => el.textContent?.trim());
    // Zone 1 in the fixture is nine phrase stops plus the tracing, story and
    // letter rows, numbered densely: the tracing stop is 2, the story stop 3
    // and the letter stop 4. Stop 1 is the current stop and wears the train,
    // not a badge, so the badges run 2 to 12 and then zone 2's stop 1.
    // INVERTED from 2..11 when the letter row landed; the DENSENESS is the
    // claim, and it is what would fail if a row stopped being numbered.
    expect(numbers.slice(0, 12)).toEqual([
      "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "1",
    ]);
    // No emblem art on the marker any more; the story emblem lives on the
    // plaque instead.
    for (const el of screen.getAllByTestId(/^station-medallion-/)) {
      expect(el.querySelector("img")).toBeNull();
    }
  });

  test("the marker carries no status of its own, only the kind", () => {
    renderJourney();
    // STATUS IS SAID TWICE ALREADY, by the card's drained stock and by the rail
    // arriving dashed instead of green. It was said a third time in the
    // emblem's alpha until 2026-08-26, and that third telling only made cut art
    // look faded on a painting: "some icons still too transparent".
    for (const el of screen.getAllByTestId(/^station-medallion-/)) {
      expect(el.style.opacity === "" || el.style.opacity === "1").toBe(true);
    }
  });
});
