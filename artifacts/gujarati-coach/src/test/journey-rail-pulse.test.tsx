import { describe, test, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Task #917: directional pulse on the active rail segment. The run from the
// current stop to the next station (in path order) renders a series of accent
// dots whose staggered opacity delays grow toward the next stop, so the wave
// travels in the direction of the journey. Pins the behavior contract:
// (1) dots render ONLY on the active run (count = dots-per-segment x segments
//     in the run), including a locked next stop;
// (2) a zone-boundary run (current stop is the last station of its zone)
//     spans two segments with one continuous, strictly increasing delay order;
// (3) no next station (final stop before the terminus, or journey complete)
//     means zero dots, so nothing pulses toward the terminus;
// (4) reduced motion renders no dots at all.
const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  reduceMotion: false as boolean | null,
}));

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
}));

import Journey from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";

// Must match PULSE_DOTS_PER_SEG in pages/journey.tsx.
const DOTS_PER_SEG = 8;

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

const grp = (id: number, status: string) => ({
  id,
  title: `Stop ${id}`,
  stage: "phrase",
  position: id,
  status,
  phraseCount: 5,
  masteredCount: 0,
});

/** One group list per zone: zones[i] applies to JOURNEY_ZONES[i]. */
function setZones(...zones: unknown[][]) {
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z, i) => {
    h.groupsByZone[z.id] = zones[i] ?? [grp(9000 + z.id, "locked")];
  });
}

function pulseDots(container: HTMLElement) {
  return [...container.querySelectorAll('[data-testid="rail-pulse-dot"]')];
}

function delays(dots: Element[]) {
  return dots.map((d) =>
    Number((d as SVGElement).style.getPropertyValue("--rail-pulse-delay")),
  );
}

beforeEach(() => {
  h.reduceMotion = false;
  setZones();
});

describe("journey rail directional pulse (task 917)", () => {
  test("dots render only on the current-to-next segment, even when next is locked", () => {
    // Zone 1: done, current, locked-next. Every other zone fully locked.
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    const { container } = renderJourney();
    const dots = pulseDots(container);
    // Exactly one segment's worth of dots: nothing on the completed segment
    // behind the current stop, nothing beyond the (locked) next stop.
    expect(dots).toHaveLength(DOTS_PER_SEG);
    const ds = delays(dots);
    // Direction: delay fractions strictly increase toward the next stop.
    for (let i = 1; i < ds.length; i++) {
      expect(ds[i]!).toBeGreaterThan(ds[i - 1]!);
    }
    expect(ds.every((d) => d >= 0 && d < 1)).toBe(true);
  });

  test("zone-boundary run spans both segments with one continuous delay order", () => {
    // Current stop is the LAST station of zone 1; next station opens zone 2,
    // so the run passes through the zone postcard point: two segments.
    setZones(
      [grp(101, "completed"), grp(102, "unlocked")],
      [grp(201, "locked")],
    );
    const { container } = renderJourney();
    const dots = pulseDots(container);
    expect(dots).toHaveLength(DOTS_PER_SEG * 2);
    const ds = delays(dots);
    for (let i = 1; i < ds.length; i++) {
      expect(ds[i]!).toBeGreaterThan(ds[i - 1]!);
    }
  });

  test("no dots when the current stop is the final station (no pulse toward the terminus)", () => {
    setZones(
      [grp(101, "completed")],
      [grp(201, "completed")],
      [grp(301, "completed")],
      [grp(401, "completed")],
      [grp(501, "completed")],
      [grp(601, "completed"), grp(602, "unlocked")],
    );
    const { container } = renderJourney();
    expect(pulseDots(container)).toHaveLength(0);
  });

  test("no dots when the journey is complete (no current stop)", () => {
    setZones(
      [grp(101, "completed")],
      [grp(201, "completed")],
      [grp(301, "completed")],
      [grp(401, "completed")],
      [grp(501, "completed")],
      [grp(601, "completed")],
    );
    const { container } = renderJourney();
    expect(pulseDots(container)).toHaveLength(0);
  });

  test("reduced motion renders a fully static rail: no pulse dots at all", () => {
    h.reduceMotion = true;
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    const { container } = renderJourney();
    expect(pulseDots(container)).toHaveLength(0);
  });
});
