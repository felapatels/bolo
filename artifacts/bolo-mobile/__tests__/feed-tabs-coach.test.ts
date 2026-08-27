import { coachCaretX, type CoachAnchor } from '@/components/FeedTabsCoach';

/**
 * WHERE THE FIRST-RUN TOUR POINTS.
 *
 * This component shipped pointing at the wrong thing TWICE, and it had no test
 * either time. The first attempt had no caret at all and merely selected the
 * tab; the second added a caret whose x was arithmetic off the WINDOW width
 * and whose card sat at a fixed offset that landed ON TOP of the strip it was
 * describing, so the arrow pointed up at the scope toggle instead. Reported as
 * "each isn't really pointing to the right option", then "still not pointing
 * to the right buttons".
 *
 * The fix was to measure the real strip, so what these pin is that the maths
 * is done INSIDE the measured box and never against the screen.
 */

/** A strip that is NOT the full window width and does NOT start at x=0. */
const INSET: CoachAnchor = { x: 20, y: 400, width: 360, height: 44 };

describe('the first-run tour caret', () => {
  it('puts a single tab in the middle of the strip, not the screen', () => {
    // The whole class of bug in one assertion: the strip's centre is 200 here
    // (20 + 360/2) and the window's would be something else entirely.
    expect(coachCaretX(INSET, 0, 1)).toBe(200);
  });

  it('lands each of two tabs inside its own half', () => {
    const left = coachCaretX(INSET, 0, 2);
    const right = coachCaretX(INSET, 1, 2);
    // Ordered, distinct, and each within the strip.
    expect(left).toBeLessThan(right);
    expect(left).toBeGreaterThan(INSET.x);
    expect(right).toBeLessThan(INSET.x + INSET.width);
    // Each sits in its own half of the strip rather than drifting toward the
    // middle, which is what a wrong gap or padding would look like.
    const mid = INSET.x + INSET.width / 2;
    expect(left).toBeLessThan(mid);
    expect(right).toBeGreaterThan(mid);
  });

  it('spaces two tabs symmetrically about the strip centre', () => {
    const mid = INSET.x + INSET.width / 2;
    const left = coachCaretX(INSET, 0, 2);
    const right = coachCaretX(INSET, 1, 2);
    // flex:1 segments split evenly, so the two centres must be mirror images.
    expect(mid - left).toBeCloseTo(right - mid, 5);
  });

  it('never points outside the strip, however many tabs there are', () => {
    for (const n of [1, 2, 3, 4]) {
      for (let i = 0; i < n; i++) {
        const x = coachCaretX(INSET, i, n);
        expect(x).toBeGreaterThanOrEqual(INSET.x);
        expect(x).toBeLessThanOrEqual(INSET.x + INSET.width);
      }
    }
  });

  it('moves with the strip, which is the point of measuring it', () => {
    // The same tab in a strip shifted right must move right by exactly that
    // much. Arithmetic against the window could not do this, and that is
    // precisely why the caret was wrong on a screen with other chrome on it.
    const shifted: CoachAnchor = { ...INSET, x: INSET.x + 50 };
    expect(coachCaretX(shifted, 0, 2) - coachCaretX(INSET, 0, 2)).toBe(50);
  });
});
