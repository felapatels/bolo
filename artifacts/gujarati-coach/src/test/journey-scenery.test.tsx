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
  // Stable across the module mock so a test can prove that DRAWING Chacha-ji's
  // stall records no encounter (rendering is not triggering).
  recordChachaEncounter: vi.fn(),
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
  useRecordChachaEncounter: () => ({ mutate: h.recordChachaEncounter, isPending: false }),
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
  STALL_PLACEMENT,
  ZONE_SCENERY_THEMES,
  planChachaStalls,
  planZoneScenery,
  planZoneSignpost,
} from "@/components/journey-scenery";
import { isChachaEncounterStation } from "@/lib/quick-games";
import { factForZone, factRotationForZone, INDIA_FACTS } from "@/lib/india-facts";

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
    // INVERTED Aug 18 2026, "a cow in every zone". At three stations a zone
    // plans exactly ONE element, and the cow is substituted into the last (and
    // here only) slot of any zone whose theme lacks one. So every zone shows a
    // cow at this size, and the themed kinds only reappear once a zone is big
    // enough to plan two or three elements. Zone 4's row is still station 11,
    // an encounter station, so Chacha-ji's stall takes that strip and the
    // decoration there still stands down: a landmark outranks scenery.
    expect(kinds(sceneryItems(container))).toEqual([
      "cow",
      "cow",
      "cow",
      "cow",
      "cow",
    ]);
  });

  test("a full-size zone keeps its theme, with a cow in the last slot", () => {
    // INVERTED Aug 18 2026. The zone's PRIMARY character (theme[0]) and its
    // second element are untouched; the cow takes the third slot, which is what
    // "a cow in every zone" costs on a zone whose theme has none. Zone 1 is
    // tuktuk, fruitCart, banyan, so the banyan is what stands down.
    setZones(zoneOf(11, 100));
    const { container } = renderJourney();
    const zone0 = kinds(sceneryItems(container)).slice(0, 3);
    expect(zone0).toEqual([ZONE_SCENERY_THEMES[0]![0], ZONE_SCENERY_THEMES[0]![1], "cow"]);
  });

  test("every zone gets a cow, whatever its theme", () => {
    // The reported gap: only zones 3 and 4 carried a cow, so most of the line
    // had none.
    for (let zi = 0; zi < 6; zi++) {
      expect(planZoneScenery(zi, 11).map((p) => p.kind)).toContain("cow");
      expect(planZoneScenery(zi, 3).map((p) => p.kind)).toContain("cow");
    }
  });

  test("a zone whose theme already has a cow is not given a second one", () => {
    for (const zi of [2, 3]) {
      const cows = planZoneScenery(zi, 11).filter((p) => p.kind === "cow");
      expect(cows).toHaveLength(1);
    }
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

  test("factRotationForZone leads with today's pick and walks the daily stride (Hotfix 3 item 6)", () => {
    const base = Date.UTC(2026, 7, 3);
    const opts = {
      zoneIndex: 2,
      geoName: "Vadodara",
      lineName: "Gujarat Express",
      salt: 1,
      now: base,
    };
    const rotation = factRotationForZone(opts);
    // Parity pin: index 0 is exactly today's factForZone pick, so the live
    // strip and the daily surface can never disagree on the lead fact.
    expect(rotation[0]).toBe(factForZone(opts));
    // The strip walks the same modular stride the daily rotation uses:
    // tomorrow's daily pick is today's second entry.
    expect(rotation[1]).toBe(factForZone({ ...opts, now: base + 86_400_000 }));
    // Whole pool, no repeats, all real facts.
    expect(new Set(rotation).size).toBe(rotation.length);
    for (const f of rotation) expect(INDIA_FACTS).toContain(f);
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

// Chacha-ji's stall as a permanent map LANDMARK. Two rules are load-bearing:
// (1) it stands at EVERY encounter station, ahead of the learner and behind,
//     seated in the gap after that stop; and
// (2) RENDERING IS NOT TRIGGERING, drawing the stall must never record an
//     encounter, mint Chai, or mark a stop seen. Only arrival does that.
describe("Chacha-ji stall landmark", () => {
  function stalls(container: HTMLElement) {
    // Only the stall groups, never the figure inside them (both testids share
    // the chacha-stall- prefix).
    return [...container.querySelectorAll('[data-testid^="chacha-stall-"]')].filter((el) =>
      /^chacha-stall-\d+$/.test(el.getAttribute("data-testid") ?? ""),
    );
  }
  function stallStations(container: HTMLElement) {
    return stalls(container)
      .map((el) => Number(el.getAttribute("data-testid")!.replace("chacha-stall-", "")))
      .sort((a, b) => a - b);
  }
  function stallY(el: Element) {
    const m = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(el.getAttribute("transform") ?? "");
    return { x: Number(m![1]), y: Number(m![2]) };
  }

  test("plans a stall at exactly the stations the arrival check pays at", () => {
    expect(planChachaStalls(0)).toEqual([]);
    expect(planChachaStalls(2)).toEqual([]);
    expect(planChachaStalls(12)).toEqual([3, 7, 11]);
    // Single source of truth: the plan can never drift from the predicate the
    // soft stop uses, in either direction.
    for (let s = 1; s <= 40; s++) {
      expect(planChachaStalls(40).includes(s)).toBe(isChachaEncounterStation(s));
    }
    expect(planChachaStalls(21)).toEqual(planChachaStalls(21));
  });

  test("renders at every encounter station whatever the learner's position", () => {
    // Learner at station 1: the whole line is still ahead of them.
    setZones(zoneOf(11, 100), zoneOf(10, 200));
    const fresh = renderJourney();
    expect(stallStations(fresh.container)).toEqual([3, 7, 11, 15, 19, 23]);

    // Learner deep in zone 2: the stalls behind them render identically, and
    // the ones ahead are unchanged.
    const done = Array.from({ length: 11 }, (_, i) => grp(100 + i, "completed"));
    setZones(done, zoneOf(10, 200));
    const later = renderJourney();
    expect(stallStations(later.container)).toEqual([3, 7, 11, 15, 19, 23]);
    expect(stalls(later.container).map(stallY)).toEqual(stalls(fresh.container).map(stallY));
  });

  test("seats each stall in the halt row after its stop, right of the track", () => {
    setZones(zoneOf(11, 100), zoneOf(10, 200));
    const { container } = renderJourney();
    const seats = stalls(container).map(stallY);
    const { STATION_H, HALT_H, LEFT_X } = SERPENTINE;
    // The halt row holds the rail on the encounter station's own flank, which
    // is always the left one, and the stall stands out to the RIGHT of it.
    for (const s of seats) expect(s.x).toBe(LEFT_X + STALL_PLACEMENT.laneDx);
    // Tied to real row geometry, not to a constant: the trackside signal at
    // the same stop is laid out from its station's center y, so the stall must
    // sit a fixed distance below it at every encounter station.
    const stations = stallStations(container);
    stations.forEach((station, i) => {
      const signal = container.querySelector<HTMLElement>(
        `[data-testid="trackside-signal-${station}"]`,
      );
      expect(signal).not.toBeNull();
      const signalY = Number.parseFloat(signal!.style.top);
      expect(seats[i]!.y - signalY).toBe(
        STATION_H / 2 + HALT_H / 2 + STALL_PLACEMENT.groundDy - 30,
      );
    });
    // The whole landmark lives inside the halt row, which exists for it.
    const top = STALL_PLACEMENT.groundDy - STALL_PLACEMENT.extentH;
    const bottom = STALL_PLACEMENT.groundDy + STALL_PLACEMENT.shadowH;
    expect(top).toBeGreaterThan(-HALT_H / 2);
    expect(bottom).toBeLessThan(HALT_H / 2);
  });

  test("the halt is layout only: no stop, no number, nothing to tap", () => {
    // The map got longer, the line did not. Whatever the halts do to the
    // geometry, the stops keep their numbers and the count is unchanged.
    setZones(zoneOf(11, 100), zoneOf(10, 200));
    const { container } = renderJourney();
    expect(stallStations(container).length).toBeGreaterThan(0);
    const stops = new Set(
      [...container.querySelectorAll("[aria-label^='Stop ']")].map(
        (el) => /^Stop \d+ of \d+/.exec(el.getAttribute("aria-label")!)![0],
      ),
    );
    // Both fixture zones still number 1..N with N unchanged: the halts add
    // rows to the map without adding a stop to either line.
    expect([...stops].filter((l) => l.endsWith("of 11"))).toHaveLength(11);
    expect([...stops].filter((l) => l.endsWith("of 10"))).toHaveLength(10);
    expect(stops.has("Stop 1 of 11")).toBe(true);
    expect(stops.has("Stop 11 of 11")).toBe(true);
    expect(stops.has("Stop 10 of 10")).toBe(true);
    // Nothing in the halt row answers to a press: the stall group and the
    // figure inside it are the only things seated there, and they ride the
    // scenery layer, which takes no pointer events.
    for (const el of stalls(container)) {
      expect(el.closest("[data-testid='journey-scenery-layer']")).not.toBeNull();
      expect(el.querySelector("button, a, [role='button']")).toBeNull();
    }
  });

  test("the lane clears the rail, the station card and the next row", () => {
    // Encounter stations are odd stops, so their 0-based index is even and the
    // serpentine always seats their marker on the left flank. One rule
    // therefore covers every encounter station and every supported map width.
    const { LEFT_X, RAIL_HALF_W, STATION_H, HALT_H } = SERPENTINE;
    for (const station of planChachaStalls(40)) expect((station - 1) % 2).toBe(0);
    const laneX = LEFT_X + STALL_PLACEMENT.laneDx;
    const box: [number, number] = [
      laneX - SCENERY_HALF_W.chaiStall,
      laneX + SCENERY_HALF_W.chaiStall,
    ];
    // Offsets from the encounter station's row center.
    const haltY = STATION_H / 2 + HALT_H / 2;
    const top = haltY + STALL_PLACEMENT.groundDy - STALL_PLACEMENT.extentH;
    const bottom = haltY + STALL_PLACEMENT.groundDy + STALL_PLACEMENT.shadowH;
    for (const mapW of [320, 360, 390]) {
      // VIEWPORT CONTAINMENT. The map runs full bleed at or below 390 CSS px,
      // so the map column IS the screen there: every pixel of the landmark has
      // to be inside it, with a margin so it never reads as falling off the
      // edge (the defect the first cut shipped with).
      expect(box[0]).toBeGreaterThanOrEqual(4);
      expect(box[1]).toBeLessThanOrEqual(mapW - 4);
      // Clear of the trackside signal, whose glyph ends at x82 in this gap.
      expect(box[0]).toBeGreaterThan(82);
      // RIGHT OF THE TRACK AT EVERY POINT BESIDE IT. The halt holds the rail
      // on the left flank, then it sweeps back out to the next station across
      // the lower half of the row, so checking the halt point alone would miss
      // the part of the curve that comes closest. A zone postcard instead of a
      // station leaves the halt later and gentler, so this is the worst case.
      const a = { x: LEFT_X, y: haltY };
      const b = { x: mapW - 94, y: STATION_H / 2 + HALT_H + STATION_H / 2 };
      const dy = (b.y - a.y) / 2;
      for (let i = 0; i <= 400; i++) {
        const t = i / 400;
        const u = 1 - t;
        const y =
          u * u * u * a.y + 3 * u * u * t * (a.y + dy) + 3 * u * t * t * (b.y - dy) + t * t * t * b.y;
        if (y < top || y > bottom) continue;
        const x = u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x;
        expect(x + RAIL_HALF_W).toBeLessThan(box[0]);
      }
    }
    // Vertical: the whole landmark, awning rail and pooled shadow included,
    // sits below the encounter station's card (which ends at y+39 at its
    // tallest), above a zone postcard (which starts where the halt ends when
    // the stop closes a fare zone), and above the next row's card.
    expect(top).toBeGreaterThan(39);
    expect(bottom).toBeLessThan(STATION_H / 2 + HALT_H);
    expect(bottom).toBeLessThan(STATION_H + HALT_H + STATION_H / 2 - 39);
  });

  test("Chacha-ji himself stands at every stall, as the delivered figure", () => {
    // The first cut drew an unmanned prop, so the man the encounter is named
    // after was nowhere on the map. He is the shipped art, never a redraw.
    setZones(zoneOf(11, 100), zoneOf(10, 200));
    const { container } = renderJourney();
    const stallEls = stalls(container);
    const figures = container.querySelectorAll<SVGImageElement>(
      '[data-testid="chacha-stall-figure"]',
    );
    expect(stallEls.length).toBeGreaterThan(0);
    expect(figures.length).toBe(stallEls.length);
    for (const el of stallEls) {
      const figure = el.querySelector('[data-testid="chacha-stall-figure"]');
      expect(figure).not.toBeNull();
      expect(figure!.getAttribute("href")).toContain("chachaji.png");
      // Full height, feet on the stall's ground line: he reads as a person,
      // not a smudge behind the counter.
      expect(Number(figure!.getAttribute("height"))).toBeGreaterThanOrEqual(30);
    }
  });

  test("a stall row keeps its strip: no decoration and no signpost beside it", () => {
    // The decorative chai stall is retired from the theme table, so the only
    // stall on the map is Chacha-ji's landmark.
    for (const theme of ZONE_SCENERY_THEMES) expect(theme).not.toContain("chaiStall");
    for (let zi = 0; zi < 6; zi++) {
      for (const n of [3, 8, 10, 11]) {
        const avoid = new Set(planZoneScenery(zi, n).map((s) => s.row));
        const busy = new Set([...avoid, 0, 1]);
        const spot = planZoneSignpost(zi, n, busy);
        expect(spot).not.toBeNull();
        if (busy.size < n) expect(busy.has(spot!.row)).toBe(false);
        // Pure: the avoided set is the only new input.
        expect(planZoneSignpost(zi, n, busy)).toEqual(spot);
      }
    }
  });

  test("rendering the stalls records no encounter and marks no stop seen", () => {
    const seen = vi.spyOn(Storage.prototype, "setItem");
    h.recordChachaEncounter.mockClear();
    setZones(zoneOf(11, 100), zoneOf(10, 200));
    const { container } = renderJourney();
    expect(stallStations(container)).toEqual([3, 7, 11, 15, 19, 23]);
    // The encounter that pays is never asked for by scenery...
    expect(h.recordChachaEncounter).not.toHaveBeenCalled();
    // ...and no arrival bookkeeping is written either.
    const chachaWrites = seen.mock.calls.filter(([k]) => String(k).startsWith("chacha-"));
    expect(chachaWrites).toEqual([]);
    seen.mockRestore();
  });
});
