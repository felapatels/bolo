import { createHash } from "node:crypto";
import { ENCOUNTER_FIRST_STATION, ENCOUNTER_STRIDE, isEncounterStation } from "./chachaEncounters";

/**
 * WHEN CHACHA-JI RINGS. Owner ruling, 2026-08-28, confirmed after three
 * corrections, so the final shape is worth stating plainly:
 *
 *   ZONE 1   he calls at the FIRST encounter station, station 3, in ALL 22
 *            languages. Fixed, not random. "After stop 2, so there is enough
 *            content behind him": a first call landing before the learner knows
 *            a single phrase is the failure this whole feature is built to
 *            avoid.
 *   ZONES 2+ ONE call per zone, at a RANDOM one of that zone's encounter
 *            stations. Random keeps it an event; once per zone keeps it from
 *            becoming a scheduled lesson.
 *
 * IT RIDES THE ENCOUNTER THAT ALREADY EXISTS. chachaEncounters.ts has put him
 * trackside at stations 3, 7, 11, ... since long before this feature, with one
 * chacha_encounters row per arrival. Adding a KIND of encounter is far cheaper
 * than inventing a second cadence, and it means the call cannot land somewhere
 * he would not already be standing.
 *
 * "RANDOM" HERE IS A HASH, NOT A ROLL, AND THAT IS THE WHOLE TRICK. A real
 * roll has to be persisted or it rerolls: a learner who backs out of the
 * journey and returns would get a different answer each time, and once-per-zone
 * would quietly become once-per-visit. Seeding a hash on the learner, the
 * language and the zone gives an answer that is stable forever, different for
 * every learner, different in each of their languages, and needs NO STORAGE AND
 * NO MIGRATION. Given what a generated migration has already cost this repo,
 * not needing one is worth more than the elegance.
 */

/** Zone 1's call is fixed here for every learner and every language. */
export const ZONE_ONE_CALL_STATION = ENCOUNTER_FIRST_STATION;

/**
 * The encounter stations inside a zone, ascending.
 *
 * Zone boundaries are NOT constants: they come from how many lesson groups a
 * zone has, which differs per language (the live Gujarati journey is 59
 * stations with zone 1 occupying 1..11). So the range is passed in by the
 * caller that resolved it, and this stays pure and testable.
 */
export function encounterStationsInZone(
  firstStation: number,
  lastStation: number,
): number[] {
  const out: number[] = [];
  if (!Number.isInteger(firstStation) || !Number.isInteger(lastStation)) return out;
  const start = Math.max(firstStation, ENCOUNTER_FIRST_STATION);
  for (let s = start; s <= lastStation; s++) {
    if (isEncounterStation(s)) out.push(s);
  }
  return out;
}

/** Stable 32-bit value for one learner, in one language, in one zone. */
function seedFor(userId: string, languageCode: string, zone: number): number {
  const digest = createHash("sha256")
    .update(`bolo-chacha-call::${userId}::${languageCode.trim().toLowerCase()}::${zone}`)
    .digest();
  return digest.readUInt32BE(0);
}

/**
 * Which station in this zone carries the call, or null when the zone has no
 * encounter station at all (a short final zone can happen).
 *
 * Zone 1 ignores the stations it is given and answers station 3, deliberately:
 * the owner fixed it there for all 22 languages, and a zone 1 whose first
 * encounter had drifted should still call at the place the ruling names.
 * Returns null if station 3 is somehow not in zone 1, rather than inventing a
 * different one.
 */
export function callStationForZone(
  userId: string,
  languageCode: string,
  zone: number,
  encounterStations: readonly number[],
): number | null {
  if (!Number.isInteger(zone) || zone < 1) return null;
  if (encounterStations.length === 0) return null;

  if (zone === 1) {
    return encounterStations.includes(ZONE_ONE_CALL_STATION)
      ? ZONE_ONE_CALL_STATION
      : null;
  }

  const i = seedFor(userId, languageCode, zone) % encounterStations.length;
  return encounterStations[i];
}

/** True when arriving at this station should make his phone ring. */
export function stationCarriesCall(
  userId: string,
  languageCode: string,
  zone: number,
  encounterStations: readonly number[],
  station: number,
): boolean {
  return callStationForZone(userId, languageCode, zone, encounterStations) === station;
}

/** Re-exported so callers do not re-derive the cadence. */
export { ENCOUNTER_FIRST_STATION, ENCOUNTER_STRIDE };
