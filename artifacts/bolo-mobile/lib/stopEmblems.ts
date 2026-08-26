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
 * Status did not disappear: a stop still reads done or not from the medallion's
 * weight, and the current stop keeps its own train rather than a medallion.
 *
 * ONE PIECE OF ART PER KIND, six of them, shared by every zone and every one of
 * the 22 lines. They cost about 55KB each because they are cut from a painting
 * rather than drawn as vectors, and that is the same trade the backdrops made.
 */

/** The six stop kinds the journey lays out. */
export type StopEmblemKind =
  | 'station'
  | 'halt'
  | 'trace'
  | 'story'
  | 'postcard'
  | 'terminus';

const EMBLEMS: Record<StopEmblemKind, number> = {
  station: require('../assets/journey/emblem-station.png') as number, // a brass compass
  halt: require('../assets/journey/emblem-halt.png') as number, // a signal post
  trace: require('../assets/journey/emblem-trace.png') as number, // a key
  story: require('../assets/journey/emblem-story.png') as number, // an open book
  postcard: require('../assets/journey/emblem-postcard.png') as number, // a franked stamp
  terminus: require('../assets/journey/emblem-terminus.png') as number, // the engine
};

export function stopEmblem(kind: StopEmblemKind): number {
  return EMBLEMS[kind];
}

/**
 * The medallion's brass rim, and its dimmed twin for a stop not yet reached.
 *
 * Sampled from the compass on the owner's sheet rather than picked, so a drawn
 * rim and a painted emblem sit in the same metal.
 */
export const MEDALLION = {
  /**
   * How far an unreached stop's medallion is knocked back.
   *
   * THE DRAWN DISC IS GONE, and with it the rim and face colours that used to
   * live here. Reported as "medallions shouldn't be opaque": the emblems are
   * CUT FROM A PAINTING and each already has its own brass rim, so drawing a
   * cream disc and a border behind one stacked a second medallion under the
   * first and the pair read as a sticker pressed onto the map.
   *
   * Alpha is the right knock-back here and the wrong one on a card, which is
   * not a contradiction: a marker is a small piece of art with no text on it,
   * so letting the painting through says "not yet" without costing anything a
   * learner has to read. The stop cards use a greyer stock for exactly the
   * opposite reason.
   */
  aheadOpacity: 0.62,
} as const;
