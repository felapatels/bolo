import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Task 985: India-flavored trackside scenery + the 2.5D depth pass. Pins the
// behavior contract:
// (1) the placement plan is deterministic and zone-themed (Delhi-urban early,
//     market-town middle, river-and-temple final), 1-3 elements per zone;
// (2) placement geometry never intersects station markers, station cards,
//     the rail band, or the postcard rows at supported map widths;
// (3) reduced motion renders the identical static scenery with NO parallax
//     transform on the layer, and the rail comet stays absent as before;
// (4) depth order: the scenery group paints below the rail group, and the
//     HTML overlay z-indexes come from the shared DEPTH_2_5D tokens.
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

import Journey, { SERPENTINE } from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";
import { DEPTH_2_5D } from "@/lib/motion";
import {
  SCENERY_HALF_W,
  SCENERY_MAX_H,
  SCENERY_PLACEMENT,
  ZONE_SCENERY_THEMES,
  planZoneScenery,
  planZoneSignpost,
} from "@/components/journey-scenery";
import { factForZone, INDIA_FACTS } from "@/lib/india-facts";

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

function zoneOf(n: number, base: number) {
  return Array.from({ length: n }, (_, i) => grp(base + i, "locked"));
}

function sceneryItems(container: HTMLElement) {
  return [...container.querySelectorAll('[data-testid="scenery-item"]')];
}

function kinds(items: Element[]) {
  return items.map((el) => el.getAttribute("data-scenery"));
}

beforeEach(() => {
  h.reduceMotion = false;
  setZones();
});

afterEach(() => {
  // Undo any scrollY override installed by the parallax test.
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

describe("scenery placement plan (story 2)", () => {
  test("themes progress urban to riverine and the plan is a pure function of the layout", () => {
    // Zone order is the journey order, so the theme table itself must read
    // Delhi-urban first and river-and-temple last.
    expect(ZONE_SCENERY_THEMES[0]).toContain("tuktuk");
    expect(ZONE_SCENERY_THEMES[1]).toContain("cycleRickshaw");
    expect(ZONE_SCENERY_THEMES[2]).toContain("fruitCart");
    expect(ZONE_SCENERY_THEMES[3]).toContain("cow");
    expect(ZONE_SCENERY_THEMES[4]).toContain("temple");
    expect(ZONE_SCENERY_THEMES[5]).toContain("ghat");
    // Determinism: same layout in, same plan out, every time.
    for (let zi = 0; zi < 6; zi++) {
      expect(planZoneScenery(zi, 10)).toEqual(planZoneScenery(zi, 10));
    }
  });

  test("plans 1-3 elements per zone, spread across distinct in-zone rows", () => {
    expect(planZoneScenery(0, 0)).toEqual([]);
    expect(planZoneScenery(0, 1)).toHaveLength(1);
    expect(planZoneScenery(0, 3)).toHaveLength(1);
    expect(planZoneScenery(0, 8)).toHaveLength(2);
    for (const n of [9, 10, 11, 14]) {
      const plan = planZoneScenery(0, n);
      expect(plan).toHaveLength(3);
      const rows = plan.map((p) => p.row);
      // Strictly increasing and in range: elements never stack on one row.
      for (let i = 1; i < rows.length; i++) expect(rows[i]!).toBeGreaterThan(rows[i - 1]!);
      expect(rows[0]!).toBeGreaterThanOrEqual(0);
      expect(rows[rows.length - 1]!).toBeLessThan(n);
    }
  });

  test("renders one themed element per 3-station zone, in zone order", () => {
    setZones(
      zoneOf(3, 100),
      zoneOf(3, 200),
      zoneOf(3, 300),
      zoneOf(3, 400),
      zoneOf(3, 500),
      zoneOf(3, 600),
    );
    const { container } = renderJourney();
    expect(kinds(sceneryItems(container))).toEqual([
      "tuktuk",
      "cycleRickshaw",
      "fruitCart",
      "cow",
      "temple",
      "ghat",
    ]);
  });

  test("a full-size zone renders its first three theme kinds", () => {
    setZones(zoneOf(11, 100));
    const { container } = renderJourney();
    const zone0 = kinds(sceneryItems(container)).slice(0, 3);
    expect(zone0).toEqual([...ZONE_SCENERY_THEMES[0]!]);
  });

  test("two renders of the same layout produce identical scenery (no per-render randomness)", () => {
    setZones(zoneOf(11, 100), zoneOf(10, 200));
    const a = renderJourney();
    const b = renderJourney();
    expect(kinds(sceneryItems(a.container))).toEqual(kinds(sceneryItems(b.container)));
  });
});

describe("scenery geometry: no overlap at supported widths (story 2)", () => {
  // Replays the exact placement math journey.tsx uses (SERPENTINE constants +
  // the placement config) against the realistic Gujarati line zone sizes, at
  // the supported map widths, and asserts every scenery bounding box stays
  // clear of the rail band, every station marker, every station card, and its
  // own station row's vertical bounds (postcard rows tile outside them).
  const ZONE_SIZES = [11, 10, 8, 10, 10, 10];

  for (const mapW of [320, 360, 390]) {
    test(`width ${mapW}: scenery clears rail, markers, cards, and row bounds`, () => {
      const { LEFT_X, RIGHT_INSET, CARD_GAP, EDGE_PAD, MARKER_HALF_W, RAIL_HALF_W, STATION_H } =
        SERPENTINE;
      const rightX = mapW - RIGHT_INSET;
      const railBand: [number, number] = [LEFT_X - RAIL_HALF_W, rightX + RAIL_HALF_W];
      let globalK = 0;
      for (let zi = 0; zi < ZONE_SIZES.length; zi++) {
        const n = ZONE_SIZES[zi]!;
        const zoneStart = globalK;
        globalK += n;
        for (const { kind, row } of planZoneScenery(zi, n)) {
          const k = zoneStart + row;
          const stationX = k % 2 === 0 ? LEFT_X : rightX;
          const onLeft = stationX < mapW / 2;
          const cx = onLeft ? SCENERY_PLACEMENT.edgeX : mapW - SCENERY_PLACEMENT.edgeX;
          const hw = SCENERY_HALF_W[kind];
          const box: [number, number] = [cx - hw, cx + hw];
          // Inside the map column.
          expect(box[0]).toBeGreaterThanOrEqual(0);
          expect(box[1]).toBeLessThanOrEqual(mapW);
          // Clear of the whole rail band (the serpentine never leaves it).
          expect(box[1] < railBand[0] || box[0] > railBand[1]).toBe(true);
          // Clear of the station marker on its own row.
          expect(
            box[1] < stationX - MARKER_HALF_W || box[0] > stationX + MARKER_HALF_W,
          ).toBe(true);
          // Clear of the station card, which sits on the opposite side.
          const cardBox: [number, number] =
            k % 2 === 0
              ? [stationX + CARD_GAP, mapW - EDGE_PAD]
              : [EDGE_PAD, stationX - CARD_GAP];
          expect(box[1] < cardBox[0] || box[0] > cardBox[1]).toBe(true);
          // Vertical: ground sits below the row center and the tallest asset
          // stays inside the row band, so postcards above and below are safe.
          expect(SCENERY_PLACEMENT.groundDy + 8).toBeLessThanOrEqual(STATION_H / 2);
          expect(SCENERY_MAX_H - SCENERY_PLACEMENT.groundDy).toBeLessThanOrEqual(
            STATION_H / 2,
          );
        }
      }
    });
  }
});

describe("reduced motion and parallax (story 3)", () => {
  test("reduced motion: identical static scenery, no parallax transform, comet stays absent", () => {
    setZones(
      zoneOf(3, 100),
      zoneOf(3, 200),
      zoneOf(3, 300),
      zoneOf(3, 400),
      zoneOf(3, 500),
      zoneOf(3, 600),
    );
    const normal = renderJourney();
    const normalKinds = kinds(sceneryItems(normal.container));
    normal.unmount();

    h.reduceMotion = true;
    setZones(
      [grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")],
      zoneOf(3, 200),
      zoneOf(3, 300),
      zoneOf(3, 400),
      zoneOf(3, 500),
      zoneOf(3, 600),
    );
    const { container } = renderJourney();
    // Scenery is static decoration: the same set renders under reduced motion.
    expect(kinds(sceneryItems(container))).toEqual(normalKinds);
    const layer = container.querySelector('[data-testid="journey-scenery-layer"]')!;
    expect(layer.getAttribute("transform")).toBeNull();
    // Existing comet pin: reduced motion renders no pulse dots at all.
    expect(container.querySelectorAll('[data-testid="rail-pulse-dot"]')).toHaveLength(0);
  });

  test("normal motion: scroll applies ONE translate on the scenery group at the shared factor", async () => {
    setZones(zoneOf(3, 100));
    const { container } = renderJourney();
    const layer = container.querySelector('[data-testid="journey-scenery-layer"]')!;
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => {
      expect(layer.getAttribute("transform")).toBe(
        `translate(0 ${(400 * DEPTH_2_5D.parallaxFactor).toFixed(1)})`,
      );
    });
  });
});

describe("depth order (story 3)", () => {
  test("tokens are strictly ordered scenery < rail < cards < stations < train < postcards < overlays", () => {
    const L = DEPTH_2_5D.layers;
    const order = [L.scenery, L.rail, L.stationCard, L.station, L.train, L.postcard, L.overlay];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    }
  });

  test("the scenery group paints below the rail group inside the map svg", () => {
    setZones(zoneOf(3, 100));
    const { container } = renderJourney();
    const scenery = container.querySelector('[data-testid="journey-scenery-layer"]')!;
    const rail = container.querySelector('[data-testid="journey-rail-layer"]')!;
    expect(scenery.closest("svg")).toBe(rail.closest("svg"));
    // DOCUMENT_POSITION_FOLLOWING: rail comes after scenery, so it paints on top.
    expect(scenery.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Scenery renders inside the parallax layer, below everything else.
    expect(scenery.querySelectorAll('[data-testid="scenery-item"]').length).toBeGreaterThan(0);
  });

  test("HTML overlays carry the token z-indexes: train pill above markers, postcards above the train", () => {
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    const { container } = renderJourney();
    const zs = [...container.querySelectorAll("div")]
      .map((d) => d.style.zIndex)
      .filter((z) => z !== "");
    expect(zs).toContain(String(DEPTH_2_5D.layers.train));
    expect(zs).toContain(String(DEPTH_2_5D.layers.station));
    expect(zs).toContain(String(DEPTH_2_5D.layers.stationCard));
    expect(zs).toContain(String(DEPTH_2_5D.layers.postcard));
  });
});

describe("zone signposts + line facts (Chunk 6B story 5)", () => {
  test("the signpost row is deterministic and never shares a row with scenery", () => {
    for (let zi = 0; zi < 6; zi++) {
      for (const n of [1, 3, 8, 10, 11]) {
        const spot = planZoneSignpost(zi, n);
        expect(spot).not.toBeNull();
        expect(spot!.row).toBeGreaterThanOrEqual(0);
        expect(spot!.row).toBeLessThan(n);
        const taken = new Set(planZoneScenery(zi, n).map((s) => s.row));
        // Only when a free row exists can the planner avoid scenery rows.
        if (taken.size < n) expect(taken.has(spot!.row)).toBe(false);
        // Pure function of the layout: same inputs, same row.
        expect(planZoneSignpost(zi, n)).toEqual(spot);
      }
    }
    expect(planZoneSignpost(0, 0)).toBeNull();
  });

  test("factForZone picks deterministically per day, rotates across days, and salts split surfaces", () => {
    const base = Date.UTC(2026, 7, 3);
    const opts = { zoneIndex: 2, geoName: "Vadodara", lineName: "Gujarat Express" };
    const a = factForZone({ ...opts, now: base });
    // Same day, same fact, no matter the hour.
    expect(factForZone({ ...opts, now: base + 60_000 })).toBe(a);
    expect(INDIA_FACTS).toContain(a);
    // Daily rotation actually rotates over a week.
    const week = new Set(
      Array.from({ length: 7 }, (_, d) => factForZone({ ...opts, now: base + d * 86_400_000 })),
    );
    expect(week.size).toBeGreaterThan(1);
    // The three surfaces (postcard salt 1, signpost salt 2, arrival salt 3)
    // each draw a valid fact from the pool.
    for (const salt of [1, 2, 3]) {
      expect(INDIA_FACTS).toContain(factForZone({ ...opts, now: base, salt }));
    }
  });

  test("untagged zones draw from the full pool and differ on the same day (prod hotfix item 4)", () => {
    const base = Date.UTC(2026, 7, 3);
    // Neither name matches any region tag, so this exercises the fallback.
    const opts = { geoName: "Zzz Junction", lineName: "Zzz Express" };
    const picks = new Set(
      [0, 1, 2, 3, 4, 5].map((zi) => factForZone({ zoneIndex: zi, ...opts, now: base })),
    );
    expect(picks.size).toBeGreaterThan(1);
    for (const f of picks) expect(INDIA_FACTS).toContain(f);
  });
});
