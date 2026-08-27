// WHAT NUMBER A STOP WEARS, decided in ONE place.
//
// The map draws more rows than the server sends groups: a tracing row and a
// story row are spliced into every zone and the whole run is renumbered, so a
// zone of nine graded stops reads "Stop 1 of 11" to "Stop 11 of 11". The home
// hero was counting the GROUPS instead, so it said "Stop 3 of 9" for a stop the
// map called "Stop 5 of 11": wrong total AND wrong number, on the two screens a
// learner sees back to back. Reported by the owner on 2026-08-27, chat 12.
//
// `traceStopIndexIn` and `storyStopIndexIn` each already carry the rule that
// BOTH CLIENTS MUST CALL THEM rather than each choosing a position. This is the
// same rule one level up: knowing where the rows land is not enough, because
// the two splices interact (the story row is placed against a run that already
// contains the tracing row, and each splice pushes every graded stop at or
// after it down by one). Anyone deriving a stop number has to replay both, and
// replaying them twice is how the two screens drifted in the first place.
//
// Mobile twin: bolo-mobile/lib/journeyRows.ts. Ported here on 2026-08-27, the
// same day, because web carried the IDENTICAL fault: its home hero read the
// graded index straight off the payload while its journey page renumbered
// spliced rows at journey.tsx's `rowStations`. Found by the parity sweep the
// owner asked for rather than by anybody reporting it on web.
import { storyBookFor, storyStopIndexIn, type StoryBook } from '@workspace/story';
import { traceStopFor, traceStopIndexIn, type TraceStop } from '@workspace/script-trace';

export interface ZoneRowPlan {
  /** The tracing stop this zone draws, or null. */
  trace: TraceStop | null;
  /** The story book this zone draws, or null. */
  storyBook: StoryBook | null;
  /** Where the tracing row lands in the run, or null when there is none. */
  traceIndex: number | null;
  /** Where the story row lands, or null. Computed AFTER the tracing splice. */
  storyIndex: number | null;
  /** Rows the map draws: graded stops plus whichever of the two are present. */
  rowCount: number;
  /**
   * The 1-based number a graded stop wears on the map, given its 0-based index
   * among the zone's graded stops. Replays both splices in order.
   */
  rowNumberOfGraded(gradedIndex: number): number;
}

/**
 * @param lang       the learner's active language code
 * @param zoneIndex  0-based zone index, as every caller here holds it
 * @param gradedCount how many graded lesson groups the server sent for the zone
 * @param showroom   a locked-language preview, which draws neither extra row
 */
export function planZoneRows({
  lang,
  zoneIndex,
  gradedCount,
  showroom,
}: {
  lang: string;
  zoneIndex: number;
  gradedCount: number;
  showroom: boolean;
}): ZoneRowPlan {
  const zone = zoneIndex + 1;
  const trace = traceStopFor(lang, 1, zone);
  const storyBook = storyBookFor(1, zone);

  // ADDED, NEVER SUBSTITUTED, and you can only add to something: a zone with no
  // graded stops gets neither extra row, or an unloaded zone draws a lone
  // tracing row under an empty board. Never in showroom either: a locked
  // language preview already carries its own free taste, and a second one
  // beside it reads as two competing offers on a language nobody can open.
  const hasTrace = Boolean(trace) && gradedCount > 0 && !showroom;
  const hasStory = Boolean(storyBook) && gradedCount > 0 && !showroom;

  const traceIndex = hasTrace
    ? traceStopIndexIn(gradedCount, trace!.journey, trace!.zone)
    : null;
  // Against the run that ALREADY holds the tracing row, which is what the map
  // splices against and is why this is not simply an index into the groups.
  const storyIndex = hasStory
    ? storyStopIndexIn(gradedCount + (hasTrace ? 1 : 0), 1, zone, traceIndex)
    : null;

  const rowCount = gradedCount + (hasTrace ? 1 : 0) + (hasStory ? 1 : 0);

  return {
    trace,
    storyBook,
    traceIndex,
    storyIndex,
    rowCount,
    rowNumberOfGraded(gradedIndex: number): number {
      // splice(i, 0, x) inserts BEFORE i, so an element at index j moves down
      // by one exactly when i <= j. Order matters: trace first, then story
      // against the already-shifted run, which is the order the map splices in.
      let at = gradedIndex;
      if (traceIndex !== null && traceIndex <= at) at += 1;
      if (storyIndex !== null && storyIndex <= at) at += 1;
      return at + 1;
    },
  };
}
