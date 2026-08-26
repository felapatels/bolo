/**
 * THE STOP EMBLEMS. A brass medallion hangs on the rail at every stop, and the
 * emblem inside it says what KIND of stop it is. From the owner's own element
 * sheet, 2026-08-26, cut out and keyed to transparent.
 *
 * Mobile twin: lib/stopEmblems.ts. Keep the kinds in step.
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
 *
 * THE FILES WERE ALREADY IN `public/journey/` BEFORE THIS EXISTED. They shipped
 * with the mobile medallions on 2026-08-26 and web simply never read them, so
 * this file adds no bytes to the bundle.
 */

/** The six stop kinds the journey lays out. */
export type StopEmblemKind =
  | 'station'
  | 'halt'
  | 'trace'
  | 'story'
  | 'postcard'
  | 'terminus';

const EMBLEMS: Record<StopEmblemKind, string> = {
  station: `${import.meta.env.BASE_URL}journey/emblem-station.png`, // a brass compass
  halt: `${import.meta.env.BASE_URL}journey/emblem-halt.png`, // a signal post
  trace: `${import.meta.env.BASE_URL}journey/emblem-trace.png`, // a key
  story: `${import.meta.env.BASE_URL}journey/emblem-story.png`, // an open book
  postcard: `${import.meta.env.BASE_URL}journey/emblem-postcard.png`, // a franked stamp
  terminus: `${import.meta.env.BASE_URL}journey/emblem-terminus.png`, // the engine
};

export function stopEmblem(kind: StopEmblemKind): string {
  return EMBLEMS[kind];
}
