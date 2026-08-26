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
import { MEDALLION, stopEmblem } from "@/lib/stop-emblems";

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
    expect(RAIL).toEqual({
      tie: "#8A5D4A",
      tieInk: "#361C0F",
      rail: "#8E9B43",
      between: "#ECF584",
      betweenUnlit: "#9A8A6B",
      glow: "#ABF1A5",
    });
  });

  test("the glow is one narrow pass under the centre stripe", () => {
    // WAS TWO PASSES AT 28px AND 18px, which is three times the width of the
    // track itself: it washed the whole rail pale green and lost the twin-rail
    // read entirely. Reported from the preview as "train tracks don't look
    // right". The sheet draws no halo at all; it draws a bright green CENTRE
    // STRIPE down a brown sleeper ladder, which RAIL.between now is. What
    // survives here is one narrow glow under that stripe.
    expect(RAIL_GLOW_PASSES).toEqual([{ width: 9, opacity: 0.45 }]);
  });

  test("the track strokes are exactly this shape", () => {
    expect(RAIL_STROKE).toEqual({
      tie: 15,
      rail: 8.5,
      between: 4,
      tieDash: "3 11",
      unlitDash: "9 7",
      unlitOpacity: 0.88,
    });
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
  test("keeps only the knock-back, because the art carries its own brass", () => {
    // WAS FIVE VALUES: a rim, a face and their drained twins, all drawn
    // BEHIND the emblem. The emblems are cut from a painting and each already
    // carries its own brass rim, so the drawn disc stacked a second medallion
    // under the first and the pair read as a sticker pressed onto the map.
    // Reported as "medallions shouldn't be opaque".
    //
    // Alpha is the right knock-back on a marker and the wrong one on a card,
    // which is not a contradiction: a marker is a small piece of art with no
    // text on it, so letting the painting through says "not yet" without
    // costing a learner anything they have to read.
    expect(MEDALLION).toEqual({ aheadOpacity: 0.62 });
  });

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
  test("a phrase stop, a tracing stop and a story stop each wear their own", () => {
    renderJourney();
    // Status is already on the card beside every stop, so the marker's job is
    // the half the card cannot say.
    expect(screen.getAllByTestId("station-medallion-station").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("station-medallion-trace").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("station-medallion-story").length).toBeGreaterThan(0);
  });

  test("a medallion is knocked back until the stop is behind the learner", () => {
    renderJourney();
    const ahead = screen
      .getAllByTestId(/^station-medallion-/)
      .filter((el) => el.style.opacity !== "" && el.style.opacity !== "1");
    // The fixture opens one stop per zone and locks the rest, so unreached
    // medallions must exist or this proves nothing.
    expect(ahead.length).toBeGreaterThan(0);
    for (const el of ahead) {
      expect(Number(el.style.opacity)).toBe(MEDALLION.aheadOpacity);
    }
  });
});
