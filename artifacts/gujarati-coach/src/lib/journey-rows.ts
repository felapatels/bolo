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
 */
export function planZoneRows({
  lang,
  zoneIndex,
  gradedCount,
}: {
  lang: string;
  zoneIndex: number;
  gradedCount: number;
}): ZoneRowPlan {
  const zone = zoneIndex + 1;
  const trace = traceStopFor(lang, 1, zone);
  const storyBook = storyBookFor(1, zone);

  // ADDED, NEVER SUBSTITUTED, and you can only add to something: a zone with no
  // graded stops gets neither extra row, or an unloaded zone draws a lone
  // tracing row under an empty board.
  //
  // EVERY ZONE, FOR EVERY LEARNER, AND NO SHOWROOM FLAG ANY MORE. Owner,
  // 2026-08-30 (build 23), off the 1.0.6 TestFlight build on a Free account:
  // "Every zone for every language should have a script trace and a story
  // stop however I'm just seeing it in Zone 1 for each."
  //
  // A Free learner previewing a locked language is in the showroom, and this
  // took a `showroom` flag until build 22 that drew both rows in zone 1 only.
  // Before 2026-08-28 it drew neither row anywhere in the showroom, on the
  // reasoning that a second chip beside the three-phrase voice teaser read as
  // two competing offers; zone 1 came back on the owner's ruling that "stops 2
  // and 3 of every journey zone 1 should have free tastes of script tracing
  // and storybook"; and later zones stayed out because their tracing and their
  // books really are All-Access, "so a row there would be a chip with nothing
  // behind it". That last half hid four fifths of what All-Access buys from
  // exactly the learner being sold it. The splices downstream already mark
  // journey 1 zone 1 `teaserStation` and every later zone `planLocked`, so a
  // showroom now shows the whole line it is selling, locked where it is locked.
  //
  // The flag is gone rather than ignored: a parameter nothing reads is an
  // invitation to gate on it again.
  const hasTrace = Boolean(trace) && gradedCount > 0;
  const hasStory = Boolean(storyBook) && gradedCount > 0;

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
