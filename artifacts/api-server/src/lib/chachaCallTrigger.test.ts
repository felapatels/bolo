import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ZONE_ONE_CALL_STATION,
  callStationForZone,
  encounterStationsInZone,
  stationCarriesCall,
} from "./chachaCallTrigger";

// When Chacha-ji rings. The rules under test are the owner's, 2026-08-28:
// zone 1 at station 3 in all 22 languages, one random encounter station per
// zone after that, and the answer must never change on a revisit.
//
// STATIC IMPORTS, NO DUMMY ENV. This used to import dynamically after setting a
// fake DATABASE_URL, because the cadence constants came from chachaEncounters,
// which reaches the database at import. They live in journeyStations.ts now, so
// this file is pure the whole way down. The plainness of these imports is the
// evidence.

// The live Gujarati journey: 59 stations, zone 1 occupying 1..11.
const ZONE_1 = encounterStationsInZone(1, 11);
const ZONE_2 = encounterStationsInZone(12, 22);
const ZONE_3 = encounterStationsInZone(23, 33);

// The 22 journey languages, by code, so "all 22" is asserted rather than said.
const LANGUAGES = [
  "hi", "gu", "bn", "ta", "te", "mr", "kn", "ml", "pa", "or", "as",
  "ur", "sa", "ks", "kok", "mai", "doi", "sat", "sd", "ne", "brx", "mni",
];

describe("which stations he can appear at", () => {
  test("a zone's encounter stations follow the existing 3, 7, 11 cadence", () => {
    assert.deepEqual(ZONE_1, [3, 7, 11]);
    assert.deepEqual(ZONE_2, [15, 19]);
  });

  test("a zone with no encounter station yields none rather than guessing", () => {
    assert.deepEqual(encounterStationsInZone(4, 6), []);
    assert.deepEqual(encounterStationsInZone(1, 2), []);
  });

  test("stations before his first arrival are never offered", () => {
    // ENCOUNTER_FIRST_STATION is 3. Nothing at 1 or 2, which is the whole
    // point of "after stop 2, so there is enough content".
    assert.ok(!encounterStationsInZone(1, 11).includes(1));
    assert.ok(!encounterStationsInZone(1, 11).includes(2));
  });
});

describe("zone 1 is fixed, everywhere", () => {
  test("zone 1 calls at station 3 in ALL 22 languages", () => {
    for (const lang of LANGUAGES) {
      assert.equal(
        callStationForZone("learner_1", lang, 1, ZONE_1),
        ZONE_ONE_CALL_STATION,
        `${lang} did not call at station 3`,
      );
    }
  });

  test("zone 1 is the same station for every learner", () => {
    for (const user of ["a", "b", "c", "user_with_a_long_clerk_id", ""]) {
      assert.equal(callStationForZone(user, "gu", 1, ZONE_1), 3);
    }
  });

  test("zone 1 answers null rather than inventing a station if 3 is missing", () => {
    assert.equal(callStationForZone("learner_1", "gu", 1, [7, 11]), null);
  });
});

describe("later zones are random but never reroll", () => {
  test("the same learner always gets the same station back", () => {
    // The property that matters most. A roll would have to be persisted or a
    // learner who backs out and returns gets a different answer, and
    // once-per-zone quietly becomes once-per-visit.
    const first = callStationForZone("learner_1", "gu", 3, ZONE_3);
    for (let i = 0; i < 50; i++) {
      assert.equal(callStationForZone("learner_1", "gu", 3, ZONE_3), first);
    }
  });

  test("it is always one of that zone's own encounter stations", () => {
    for (let i = 0; i < 200; i++) {
      const s = callStationForZone(`learner_${i}`, "gu", 2, ZONE_2);
      assert.ok(ZONE_2.includes(s!), `${s} is not a station in zone 2`);
    }
  });

  test("different learners do not all get the same station", () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) =>
        callStationForZone(`learner_${i}`, "gu", 3, ZONE_3),
      ),
    );
    assert.ok(seen.size > 1, "every learner got the same station; the hash is not spreading");
  });

  test("the same learner differs across their languages and zones", () => {
    // Two learners on the same journey should not ring in lockstep, and one
    // learner should not meet him at the same point in every zone.
    const across = new Set(
      LANGUAGES.map((l) => callStationForZone("learner_1", l, 3, ZONE_3)),
    );
    assert.ok(across.size > 1, "the language does not affect the station");
    const zones = new Set([
      callStationForZone("learner_1", "gu", 2, ZONE_2),
      callStationForZone("learner_1", "gu", 3, ZONE_2),
      callStationForZone("learner_1", "gu", 4, ZONE_2),
      callStationForZone("learner_1", "gu", 5, ZONE_2),
    ]);
    assert.ok(zones.size > 1, "the zone does not affect the station");
  });

  test("language codes are matched case and space insensitively", () => {
    assert.equal(
      callStationForZone("learner_1", " GU ", 3, ZONE_3),
      callStationForZone("learner_1", "gu", 3, ZONE_3),
    );
  });

  test("an empty zone rings nowhere rather than throwing", () => {
    assert.equal(callStationForZone("learner_1", "gu", 4, []), null);
    assert.equal(callStationForZone("learner_1", "gu", 0, ZONE_2), null);
  });
});

describe("exactly one call per zone", () => {
  test("only one station in a zone carries the call", () => {
    for (const zone of [1, 2, 3]) {
      const stations = zone === 1 ? ZONE_1 : zone === 2 ? ZONE_2 : ZONE_3;
      const carrying = stations.filter((s) =>
        stationCarriesCall("learner_7", "gu", zone, stations, s),
      );
      assert.equal(carrying.length, 1, `zone ${zone} carried ${carrying.length} calls`);
    }
  });

  test("a station outside the zone never carries it", () => {
    assert.equal(stationCarriesCall("learner_7", "gu", 2, ZONE_2, 3), false);
    assert.equal(stationCarriesCall("learner_7", "gu", 2, ZONE_2, 99), false);
  });
});
