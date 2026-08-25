import { describe, test, expect } from "vitest";
import {
  JOURNEY_ZONES,
  JOURNEY_2_ZONES,
  JOURNEY_COUNT,
  JOURNEY_LINES,
  zonesForJourney,
  stationsForJourney,
  journeyIsReady,
  availableJourneys,
  zoneIdsForJourney,
} from "@/lib/journeyLines";
import {
  QUICK_GAMES,
  eligibleQuickGames,
  gameForSignal,
} from "@/lib/quick-games";

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

  test("zones are keyed by SLUG, because ids are not stable", () => {
    // Journey 1's ids are 1-6 only because those were the first rows ever
    // inserted. Seeding journey 2's six landed them at 277-282, not 7-12: the
    // sequence had moved on. An id is whatever the database felt like that
    // day; a slug is what the seed declares.
    expect(JOURNEY_2_ZONES.map((z) => z.slug)).toEqual([
      "travel",
      "shopping",
      "time",
      "work",
      "health",
      "festivals",
    ]);
    const slugs1 = zonesForJourney(1).map((z) => z.slug);
    const slugs2 = zonesForJourney(2).map((z) => z.slug);
    expect(slugs1.some((s) => slugs2.includes(s))).toBe(false);
  });

  test("zonesForJourney returns the right set, and falls back safely", () => {
    // Compared by slug: journey 1's raw constant still carries ids for the
    // callers that use them directly, while the journey view is slug-keyed.
    const slugsOf = (j: number) => zonesForJourney(j).map((z) => z.slug);
    expect(slugsOf(1)).toEqual([
      "greetings",
      "family",
      "numbers",
      "food",
      "everyday",
      "feelings",
    ]);
    expect(zonesForJourney(2)).toEqual([...JOURNEY_2_ZONES]);
    // An unknown journey must not throw or return nothing: falling back to
    // journey 1 keeps a bad route parameter from emptying the map.
    expect(slugsOf(99)).toEqual(slugsOf(1));
    expect(slugsOf(0)).toEqual(slugsOf(1));
  });

  test("there are two journeys", () => {
    expect(JOURNEY_COUNT).toBe(2);
  });

  test("journey 1's zones still line up with its shipped titles", () => {
    expect(zonesForJourney(1).map((z) => z.title)).toEqual(
      JOURNEY_ZONES.map((z) => z.title),
    );
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
  // Ids deliberately unlike 1-12, mirroring what the seed actually produced.
  const cat = (slug: string, id: number, phraseCount: number) => ({ id, slug, phraseCount });
  const journey1Only = zonesForJourney(1).map((z, i) => cat(z.slug, i + 1, 40));
  const full = [
    ...journey1Only,
    ...zonesForJourney(2).map((z, i) => cat(z.slug, 277 + i, 40)),
  ];

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
      ...zonesForJourney(2).map((z, i) => cat(z.slug, 277 + i, i < 4 ? 40 : 0)),
    ];
    expect(journeyIsReady(2, partial)).toBe(false);
    expect(journeyIsReady(2, full)).toBe(true);
  });

  test("a category present with zero phrases counts as not ready", () => {
    const zeroed = [
      ...journey1Only,
      ...zonesForJourney(2).map((z, i) => cat(z.slug, 277 + i, 0)),
    ];
    expect(journeyIsReady(2, zeroed)).toBe(false);
  });

  test("a category missing its count entirely counts as not ready", () => {
    const noCounts = [
      ...journey1Only,
      ...zonesForJourney(2).map((z, i) => ({ id: 277 + i, slug: z.slug })),
    ];
    expect(journeyIsReady(2, noCounts)).toBe(false);
  });

  test("availableJourneys reports only what a learner can actually ride", () => {
    expect(availableJourneys(journey1Only)).toEqual([1]);
    expect(availableJourneys(full)).toEqual([1, 2]);
    expect(availableJourneys(undefined)).toEqual([1]);
  });
});

describe("resolving zones to the ids everything downstream speaks", () => {
  const cats = [
    ...zonesForJourney(1).map((z, i) => ({ id: i + 1, slug: z.slug, phraseCount: 40 })),
    ...zonesForJourney(2).map((z, i) => ({ id: 277 + i, slug: z.slug, phraseCount: 40 })),
  ];

  test("journey 2 resolves to whatever ids the seed actually produced", () => {
    expect(zoneIdsForJourney(2, cats)).toEqual([277, 278, 279, 280, 281, 282]);
  });

  test("journey 1 resolves too, unchanged", () => {
    expect(zoneIdsForJourney(1, cats)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("a partially resolvable journey resolves to NOTHING", () => {
    // Returning a short list would silently draw a journey with fewer zones
    // than it has, which is harder to notice than drawing none.
    const missing = cats.filter((c) => c.slug !== "health");
    expect(zoneIdsForJourney(2, missing)).toEqual([]);
  });

  test("no listing resolves to nothing rather than throwing", () => {
    expect(zoneIdsForJourney(2, undefined)).toEqual([]);
  });
});

describe("journey-aware mini-game roster", () => {
  // FREE-VISIBLE ONLY, from 2026-08-25. eligibleQuickGames feeds the trackside
  // SIGNAL rotation, which is a free encounter offered mid-journey, so an
  // All-Access game must never appear in it: that would be an upsell wearing a
  // game's clothes. Wrong Platform 2 is the first such entry. These two
  // compared against the whole roster and now compare against the free half,
  // which is what they always meant.
  const freeIds = () => QUICK_GAMES.filter((g) => !g.plusOnly).map((g) => g.id);

  test("journey 1 gets exactly the roster it always had", () => {
    // The default is journey 1 and nothing in the shipped roster declares a
    // journey list, so this must be byte-identical to the old behaviour.
    expect(eligibleQuickGames(10)).toEqual(eligibleQuickGames(10, 1));
    expect(eligibleQuickGames(10).map((g) => g.id)).toEqual(freeIds());
  });

  test("a game with no journey list appears in every journey", () => {
    expect(eligibleQuickGames(10, 2).map((g) => g.id)).toEqual(freeIds());
  });

  test("the phrase floor still binds, in either journey", () => {
    // Signal Lights has the lowest floor, so a thin category offers only it.
    for (const journey of [1, 2]) {
      expect(eligibleQuickGames(2, journey).map((g) => g.id)).toEqual([
        "signal-lights",
      ]);
      expect(eligibleQuickGames(0, journey)).toEqual([]);
    }
  });

  test("gameForSignal rotates within the journey's roster", () => {
    const roster = eligibleQuickGames(10, 2);
    for (let i = 0; i < roster.length * 2; i++) {
      expect(gameForSignal(i, 10, 2)!.id).toBe(roster[i % roster.length]!.id);
    }
  });

  test("gameForSignal still defaults to journey 1", () => {
    expect(gameForSignal(0, 10)).toEqual(gameForSignal(0, 10, 1));
  });

  test("a category too thin for any game auto-waves in journey 2 too", () => {
    // null is the auto-wave case, and it must not become an exception just
    // because a second journey exists.
    expect(gameForSignal(0, 0, 2)).toBeNull();
  });

  test("SCRIPT TRACE IS DELIBERATELY ABSENT", () => {
    // It was asked for as a journey 2 mini game and cannot join on the current
    // contract: every roster entry rides a frozen server game id, and a game
    // session carries phraseResults the server validates against real phrase
    // ids. Script Trace has glyphs, not phrases. Filing a trace run as
    // "listen-and-pick" with invented phrase results would be lying to a server
    // that checks, on the path the token and XP economy hangs off.
    //
    // This test is the reminder, and it should be inverted the day a
    // server-side trace game type lands.
    expect(QUICK_GAMES.map((g) => g.id)).not.toContain("script-trace");
    for (const g of QUICK_GAMES) {
      expect(["listen-and-pick", "word-match"]).toContain(g.serverGame);
    }
  });
});
