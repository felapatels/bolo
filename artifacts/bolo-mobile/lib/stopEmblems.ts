/**
 * THE STOP EMBLEMS. A brass medallion hangs on the rail at every stop, and the
 * emblem inside it says what KIND of stop it is. From the owner's own element
 * sheet, 2026-08-26, cut out and keyed to transparent.
 *
 * Web twin: src/lib/stop-emblems.ts. Keep the kinds in step.
 *
 * KIND, NOT STATUS, AND THAT IS THE CHANGE. The old markers encoded status and
 * nothing else: a filled circle for done, a hollow one for open, a train for
 * where you are. Status is already on the card beside every stop ("Completed",
 * "8/10 mastered"), so the marker was saying the same thing twice while the
 * thing it could uniquely say, that stop 2 is a tracing stop and stop 3 is a
 * story, was left to a chip. The reference the owner drew puts the kind in the
 * medallion and leaves status to the card, which is the right division.
 *
 * STATUS IS NOT ON THE MARKER AT ALL ANY MORE. It was carried in the emblem's
 * alpha until 2026-08-26, when three separate preview reports killed it:
 * whether a stop is reached is already said by the card's drained stock and by
 * the rail arriving dashed instead of green, and a third telling in alpha only
 * made cut art look faded on a painting. The current stop still keeps its own
 * train rather than an emblem.
 *
 * ONE PIECE OF ART PER KIND, six of them, shared by every zone and every one of
 * the 22 lines. They cost about 55KB each because they are cut from a painting
 * rather than drawn as vectors, and that is the same trade the backdrops made.
 */

/** The seven stop kinds the journey lays out. */
export type StopEmblemKind =
  | 'station'
  | 'halt'
  | 'trace'
  | 'story'
  | 'letter'
  | 'postcard'
  | 'terminus';

const EMBLEMS: Record<StopEmblemKind, number> = {
  station: require('../assets/journey/emblem-station.png') as number, // a brass compass
  halt: require('../assets/journey/emblem-halt.png') as number, // a signal post
  trace: require('../assets/journey/emblem-trace.png') as number, // a key
  story: require('../assets/journey/emblem-story.png') as number, // an open book
  // THE LETTER STOP SHARES THE TRACING STOP'S KEY, and this is a placeholder
  // that says so rather than a seventh painting. There is no letter emblem on
  // the owner's element sheet yet, and ASSET MAPS ARE COMPILE TIME on mobile:
  // a png cannot be dropped in later and switched on, it has to ride a build
  // first. Nothing draws this one today (the medallion is a numbered badge and
  // only the story card calls stopEmblem), so the sharing is invisible; the
  // kind exists so the row is nameable in a test and in the medallion testID.
  letter: require('../assets/journey/emblem-trace.png') as number, // the key, borrowed
  postcard: require('../assets/journey/emblem-postcard.png') as number, // a franked stamp
  terminus: require('../assets/journey/emblem-terminus.png') as number, // the engine
};

export function stopEmblem(kind: StopEmblemKind): number {
  return EMBLEMS[kind];
}
