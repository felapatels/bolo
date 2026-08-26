/**
 * THE OPENING SHOT ON THE JOURNEY MAP.
 *
 * The map opens at the TOP, holds long enough to read the fare-zone card, then
 * travels down to the learner's current stop. Asked for on 2026-08-26: "start
 * at the top then auto scroll to their current stop, so they can see the
 * progress visually", then "make sure you can see the zone card first", then
 * "speed it up and let them skip it by tapping the screen and landing on their
 * current card", then "maybe faster for further stops".
 *
 * Mobile twin: lib/journeyIntroScroll.ts. Keep the timings in step; an exact-
 * shape test on each side asserts the whole object.
 *
 * IT ALREADY SCROLLED BEFORE THIS. Both platforms have brought the current stop
 * into view since Task 1082 item 4. What was missing is the two halves the
 * owner named: there was no hold, so the map started moving on the first frame
 * and the zone card was never actually seen, and the pace was whatever the
 * platform's default smooth scroll does, which is slow over a long run and has
 * no cap.
 *
 * FURTHER MEANS FASTER, AND THAT IS WHAT THE CAP IS FOR. Duration grows with
 * distance up to 900ms and then stops, so a learner six zones down does not
 * wait six times as long as one in zone 1: they travel the same shot, faster.
 * A short hop stays proportional, because a 60px nudge taking the full shot
 * would read as sluggish rather than cinematic.
 *
 * ANY INPUT SKIPS TO THE CARD. Not "cancels": a learner who touches the screen
 * during a one-second intro wants to be at their stop, and stopping the travel
 * halfway would leave them somewhere nobody chose. The old behaviour bailed and
 * left them stranded mid-map.
 */
export const INTRO_SCROLL = {
  /** The beat before anything moves, long enough to read the zone card. */
  holdMs: 700,
  /** Travel time per pixel, before the floor and the cap. */
  msPerPx: 0.25,
  /** A short hop is still a shot, not a jump. */
  minMs: 320,
  /** The cap. Past this distance, further means faster rather than longer. */
  maxMs: 900,
  /**
   * Where the stop lands in the viewport: about a third down, clear of the
   * sticky boarding-pass header and never pinned to the bottom edge. Shared
   * with the zone jump so a jump and the opening shot agree.
   */
  leadMin: 140,
  leadMax: 260,
  leadFraction: 0.3,
} as const;

/**
 * How long the travel takes for a given distance, in ms.
 *
 * Proportional up to the cap, then flat, which is the whole "faster for further
 * stops" behaviour: beyond 3600px the shot takes the same time however far it
 * goes, so the speed rises with the distance.
 */
export function introScrollDurationMs(distancePx: number): number {
  const raw = Math.abs(distancePx) * INTRO_SCROLL.msPerPx;
  return Math.min(INTRO_SCROLL.maxMs, Math.max(INTRO_SCROLL.minMs, raw));
}

/** The framing lead for a viewport height. */
export function introScrollLead(viewportH: number): number {
  return Math.min(
    INTRO_SCROLL.leadMax,
    Math.max(INTRO_SCROLL.leadMin, Math.round(viewportH * INTRO_SCROLL.leadFraction)),
  );
}

/**
 * Ease for the travel: accelerate away from the zone card, decelerate onto the
 * stop. Cubic in-out rather than a plain ease-out, because the shot has a
 * subject at BOTH ends and a linear departure from the zone card reads as the
 * page being yanked.
 */
export function introScrollEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
