/**
 * THE HOME MOMENT ROTATES NOW. Work queue item 6, asked for in chat 7.
 *
 * Mobile twin: lib/momentRotation.ts. An exact-shape test on each side
 * asserts the whole object.
 *
 * IT ALREADY READ THE PROJECTION AND RENDERED ONE ENTRY FOREVER. The card
 * fetched limit=1 and drew `feed.data[0]`, so a learner who opened home twice
 * in a minute saw the same line both times and the card looked static even
 * while friends were busy. The fix is not a second feed on home: it is the same
 * one-line door, showing each of the last few moments in turn.
 *
 * IT RESETS TO THE NEWEST WHENEVER ONE LANDS. The green pulse marks a moment
 * arriving while the learner is looking at home, and a rotation that happened
 * to be three entries deep at that instant would pulse next to somebody else's
 * news. The pulse and the line have to agree.
 *
 * IT DOES NOT ROTATE UNDER REDUCED MOTION, and that is an accessibility rule
 * rather than a taste one: content that changes on its own with no way to stop
 * it is exactly what the preference is asking not to happen. Those learners get
 * the newest moment, held.
 */
export const MOMENT_ROTATION = {
  /** How many moments the card cycles through. */
  limit: 4,
  /** How long each one is held. Longer than the journey fact strip's 6s: this
   *  line is a door rather than a thing to read, and a door that changes while
   *  a thumb is travelling toward it is worse than a static one. */
  holdMs: 7000,
  /** The crossfade between two lines. */
  fadeMs: 260,
} as const;

/**
 * Which of `count` moments to show, given how many ticks have elapsed and the
 * id of the newest one.
 *
 * Pure, because the interesting behaviour is the reset: this is the whole of
 * "rotate, but snap back when news arrives", and it is worth asserting without
 * a timer or a render in the way.
 */
export function momentRotationIndex(
  count: number,
  ticks: number,
): number {
  if (count <= 0) return 0;
  return ((ticks % count) + count) % count;
}
