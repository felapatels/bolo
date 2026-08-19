// Build 35 mobile parity: trackside signal seating, ported from the web
// planner in gujarati-coach/src/components/journey-scenery.tsx.
//
// Kept as its own module, pure and free of any React or layout import, for
// the same reason the web planner is: the seating rule is a CONTRACT shared
// with the server. `afterStop` is the gap number N, and the signal's
// contextRef is `gap-N`, the string the quick-game launch carries and the
// server matches against ^gap-[0-9]+$ when it decides whether to grant Chai.
// Get the numbering wrong and the map advertises a signal the ledger has
// never heard of, so this is tested on its own rather than through the map.

export type TracksideSignal = {
  /** Gap number N: the signal sits in the gap AFTER global stop N (1-based). */
  afterStop: number;
  /** Ordinal of this signal along the whole line, 0-based. Drives the
   *  deterministic game rotation (see gameForSignal). */
  signalIndex: number;
};

/**
 * One signal after every ODD global stop, walking the whole line.
 *
 * The `stop < totalStations` bound is load-bearing: it means the line never
 * ends on a signal, so the last stop is always reachable without clearing
 * one more crossing. Ported verbatim from web, the two must agree stop for
 * stop, because a signal's identity (`gap-N`) is what the server's grant
 * ledger is keyed on.
 */
export function planTracksideSignals(totalStations: number): TracksideSignal[] {
  const out: TracksideSignal[] = [];
  for (let stop = 1, i = 0; stop < totalStations; stop += 2, i += 1) {
    out.push({ afterStop: stop, signalIndex: i });
  }
  return out;
}

/** The contextRef a signal launch carries. One definition, so the map, the
 *  launch and the tests can never drift into two spellings of the same gap. */
export function signalContextRef(gap: number): string {
  return `gap-${gap}`;
}
