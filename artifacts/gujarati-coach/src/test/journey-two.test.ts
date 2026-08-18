import { describe, test, expect } from "vitest";
import {
  JOURNEY_ZONES,
  JOURNEY_2_ZONES,
  JOURNEYS,
  JOURNEY_LINES,
  zonesForJourney,
  stationsForJourney,
  journeyIsReady,
  availableJourneys,
} from "@/lib/journeyLines";

// ---------------------------------------------------------------------------
// Journey 2: the onward leg. Structure, category ids and geography land here;
// the phrases do not, and cannot until they are authored per language.
//
// So the tests that matter most are the ones about the GATE. An empty journey
// is worse than no journey: a learner rides to a zone, opens a stop, and finds
// nothing there. Journey 2 has to be invisible until it is real.
// ---------------------------------------------------------------------------

describe("the shape of a journey", () => {
  test("journey 2 has six zones, like journey 1", () => {
    expect(JOURNEY_2_ZONES).toHaveLength(6);
    expect(JOURNEY_ZONES).toHaveLength(6);
  });

  test("its category ids continue from journey 1 and never collide", () => {
    const ids1 = JOURNEY_ZONES.map((z) => z.id);
    const ids2 = JOURNEY_2_ZONES.map((z) => z.id);
    expect(ids1).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids2).toEqual([7, 8, 9, 10, 11, 12]);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  test("zonesForJourney returns the right set, and falls back safely", () => {
    expect(zonesForJourney(1)).toEqual(JOURNEY_ZONES);
    expect(zonesForJourney(2)).toEqual(JOURNEY_2_ZONES);
    // An unknown journey must not throw or return nothing: falling back to
    // journey 1 keeps a bad route parameter from emptying the map.
    expect(zonesForJourney(99)).toEqual(JOURNEY_ZONES);
    expect(zonesForJourney(0)).toEqual(JOURNEY_ZONES);
  });

  test("JOURNEYS is ordered so index + 1 is the journey number", () => {
    expect(JOURNEYS[0]).toEqual(JOURNEY_ZONES);
    expect(JOURNEYS[1]).toEqual(JOURNEY_2_ZONES);
  });
});

describe("every one of the 22 lines runs both journeys", () => {
  const codes = Object.keys(JOURNEY_LINES);

  test("there are 22 lines and none was missed", () => {
    expect(codes).toHaveLength(22);
  });

  test.each(codes)("%s has six onward stations", (code) => {
    const line = JOURNEY_LINES[code]!;
    expect(line.zones2).toHaveLength(6);
    for (const name of line.zones2) {
      expect(typeof name).toBe("string");
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  test.each(codes)("%s does not repeat a journey 1 station in journey 2", (code) => {
    // The onward leg is further along the same railway, so a repeat would mean
    // the line doubled back, and a learner would see the same place twice.
    const line = JOURNEY_LINES[code]!;
    const overlap = line.zones2.filter((z) => line.zones.includes(z));
    expect(overlap).toEqual([]);
  });

  test.each(codes)("%s has no duplicate stations within journey 2", (code) => {
    const line = JOURNEY_LINES[code]!;
    expect(new Set(line.zones2).size).toBe(6);
  });

  test("stationsForJourney picks the right leg", () => {
    const gu = JOURNEY_LINES.gu!;
    expect(stationsForJourney(gu, 1)).toEqual(gu.zones);
    expect(stationsForJourney(gu, 2)).toEqual(gu.zones2);
    expect(stationsForJourney(gu, 99)).toEqual(gu.zones);
  });
});

describe("THE GATE: an empty journey is never offered", () => {
  const full = [
    ...JOURNEY_ZONES.map((z) => ({ id: z.id, phraseCount: 40 })),
    ...JOURNEY_2_ZONES.map((z) => ({ id: z.id, phraseCount: 40 })),
  ];
  const journey1Only = JOURNEY_ZONES.map((z) => ({ id: z.id, phraseCount: 40 }));

  test("journey 1 is always ready: it is the shipped content", () => {
    expect(journeyIsReady(1, undefined)).toBe(true);
    expect(journeyIsReady(1, [])).toBe(true);
  });

  test("journey 2 is NOT ready while its categories carry no phrases", () => {
    expect(journeyIsReady(2, journey1Only)).toBe(false);
  });

  test("journey 2 is not ready before the categories exist at all", () => {
    expect(journeyIsReady(2, undefined)).toBe(false);
    expect(journeyIsReady(2, [])).toBe(false);
  });

  test("journey 2 is ready only when EVERY zone has content", () => {
    // A journey that runs out at zone 4 is the same broken promise as an empty
    // one, just later, so "some" must not be enough.
    const partial = [
      ...journey1Only,
      ...JOURNEY_2_ZONES.map((z, i) => ({ id: z.id, phraseCount: i < 4 ? 40 : 0 })),
    ];
    expect(journeyIsReady(2, partial)).toBe(false);
    expect(journeyIsReady(2, full)).toBe(true);
  });

  test("a category present with zero phrases counts as not ready", () => {
    const zeroed = [
      ...journey1Only,
      ...JOURNEY_2_ZONES.map((z) => ({ id: z.id, phraseCount: 0 })),
    ];
    expect(journeyIsReady(2, zeroed)).toBe(false);
  });

  test("a category missing its count entirely counts as not ready", () => {
    const noCounts = [...journey1Only, ...JOURNEY_2_ZONES.map((z) => ({ id: z.id }))];
    expect(journeyIsReady(2, noCounts)).toBe(false);
  });

  test("availableJourneys reports only what a learner can actually ride", () => {
    expect(availableJourneys(journey1Only)).toEqual([1]);
    expect(availableJourneys(full)).toEqual([1, 2]);
    expect(availableJourneys(undefined)).toEqual([1]);
  });
});
