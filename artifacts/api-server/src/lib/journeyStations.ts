/**
 * Where Chacha-ji stands on the journey map, as arithmetic.
 *
 * Extracted from chachaEncounters.ts on 2026-08-28 to BREAK AN IMPORT CYCLE.
 * The phone call's trigger needs this cadence, chachaEncounters needs the
 * trigger to decide whether an arrival rings, and the two importing each other
 * put a module-level constant inside a cycle. That resolved in a working order
 * under tsx and would have kept working right up until something changed the
 * import order, which is the kind of failure this repo has paid for before.
 *
 * Everything here is pure arithmetic with no database and no imports, which is
 * also why the trigger's tests no longer need a dummy DATABASE_URL to run.
 * chachaEncounters re-exports all of it, so nothing that imported it from there
 * had to change.
 */

/** The first station he appears at, on the GLOBAL station index. */
export const ENCOUNTER_FIRST_STATION = 3;

/** He reappears every fourth station after that: 3, 7, 11, 15, ... */
export const ENCOUNTER_STRIDE = 4;

export function isEncounterStation(station: number): boolean {
  return (
    Number.isInteger(station) &&
    station >= ENCOUNTER_FIRST_STATION &&
    (station - ENCOUNTER_FIRST_STATION) % ENCOUNTER_STRIDE === 0
  );
}

/** 1-based position of this encounter in the journey's encounter sequence. */
export function encounterOrdinal(station: number): number {
  return (station - ENCOUNTER_FIRST_STATION) / ENCOUNTER_STRIDE + 1;
}
