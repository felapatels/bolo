/**
 * WHERE THE EMERGENCY FIRES, and what film it plays.
 *
 * Keyed on journey and zone exactly like TRACE_STOP_LADDER and STORY_BOOKS, so
 * all three clients place it the same way and a new film is a data entry rather
 * than a client change. That pattern has now paid for itself twice.
 */

/**
 * It fires BETWEEN stop 8 and stop 9, at the owner's direction 2026-08-24.
 *
 * NOTHING IS DRAWN ON THE MAP FOR IT, which is the part that makes it work and
 * the part most likely to get "fixed" by somebody later. The tracing stop and
 * the story stop are both stations you can see coming and choose to walk into.
 * This is not: it is an interruption, and an interruption you can see on the
 * timetable is an appointment. It must never join `rowStations`, never advance
 * `k`, and never appear in `stationPts`.
 */
export const EMERGENCY_AFTER_STOP = 8;

/**
 * Journey 1's six zones each get their own film.
 *
 * JOURNEY 2 IS DELIBERATELY ABSENT rather than falling back to journey 1's
 * films. Six more zones exist there and will want six more; playing zone 1's
 * runaway train again in a different part of the map would teach people the
 * interruption is a loop, and the whole effect depends on it not being one.
 */
export const EMERGENCY_JOURNEY = 1;

/** How many zones carry a film. */
export const EMERGENCY_ZONES = 6;

/**
 * The asset id for a zone's film.
 *
 * ONE DEFINITION, used by whatever writes the file and by all three clients
 * that read it. A second copy of this rule is how the phone ends up requesting
 * a video the web app named differently, which is exactly what
 * `setupStillId` exists to prevent for the storybook.
 */
export function emergencyFilmId(journey: number, zone: number): string {
  return `j${journey}z${zone}`;
}

/**
 * Whether this zone has an Emergency at all.
 *
 * Callers must ALSO check that the zone actually has more than
 * EMERGENCY_AFTER_STOP stops in this language, and that `buildDrill` could
 * make a full run from the corpus. Any of the three failing means the
 * Emergency is skipped in silence: a half-played interruption is worse than
 * none, and the learner has no idea they missed anything.
 */
export function hasEmergency(journey: number, zone: number): boolean {
  return (
    journey === EMERGENCY_JOURNEY && zone >= 1 && zone <= EMERGENCY_ZONES
  );
}

/**
 * The copy, in the shared library rather than in either client.
 *
 * Web and mobile are hand-maintained twins, and a string defined in one of them
 * becomes two different strings within a week. Same reason STORY_TEASER_END
 * lives beside the books.
 *
 * The joke is that THE TEA SURVIVED, which is the only thing Chacha-ji would
 * care about, and it is short enough to read while the film is still running.
 */
export const EMERGENCY_COPY = {
  /** Flashed before the film, to interrupt rather than to inform. */
  alarm: "Emergency",
  alarmSub: "On the line",
  /** The verdict, either way. */
  won: {
    title: "Tea delivered",
    body: "Chacha-ji got the tea onto the train with seconds to spare. Bolo is still holding on.",
  },
  lost: {
    title: "The train went through",
    body: "It passed without stopping. Nothing is lost, and there is another one along shortly.",
  },
  /** The line under the clock while it drains. */
  running: "The train is coming through",
} as const;

/**
 * How long the alarm flashes before the film starts.
 *
 * Long enough to be read and short enough not to be a loading screen. It is the
 * interrupt: the owner asked for the word "Emergency" flashing "to interrupt
 * the player", so it has to land before anything else is on screen.
 */
export const EMERGENCY_ALARM_MS = 2_200;
