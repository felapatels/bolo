import {
  INTRO_SCROLL,
  introScrollDurationMs,
  introScrollEase,
  introScrollLead,
} from '@/lib/journeyIntroScroll';

// THE OPENING SHOT'S TIMING.
//
// Four owner instructions landed on this in one sitting on 2026-08-26, each
// narrowing the last: start at the top and scroll to the current stop; make
// sure the zone card is visible first; speed it up and let a tap skip it; maybe
// faster for further stops. The numbers below are all four of those, and they
// are the half of the shot that can be asserted without eyes.
//
// // Web twin: gujarati-coach/src/test/journey-intro-scroll.test.ts.

describe('the shot is capped, which is what makes further mean faster', () => {
  it('takes the same time past the cap, however much further it goes', () => {
    // THIS IS THE "faster for further stops" BEHAVIOUR, and it is the reason
    // neither platform uses its own smooth scroll: both get SLOWER the further
    // they travel. Past the cap the shot is a fixed length of time, so a longer
    // run is simply a quicker one.
    const cap = INTRO_SCROLL.maxMs;
    expect(introScrollDurationMs(4000)).toBe(cap);
    expect(introScrollDurationMs(12000)).toBe(cap);
    // Six zones down travels three times as far as two zones down, in the same
    // time, which is three times the speed.
    expect(introScrollDurationMs(3600)).toBe(cap);
  });

  it('stays proportional below the cap, so a short hop is not a slow one', () => {
    expect(introScrollDurationMs(2000)).toBe(2000 * INTRO_SCROLL.msPerPx);
    expect(introScrollDurationMs(2000)).toBeLessThan(INTRO_SCROLL.maxMs);
  });

  it('never drops below the floor, so a nudge is still a shot', () => {
    // A 60px hop at the raw rate would be 15ms, which is one frame: a jump
    // wearing an animation's name.
    expect(introScrollDurationMs(60)).toBe(INTRO_SCROLL.minMs);
    expect(introScrollDurationMs(0)).toBe(INTRO_SCROLL.minMs);
  });

  it('reads a backwards distance as a distance', () => {
    // The shot only ever travels down today. Feeding it a negative would
    // otherwise clamp to the floor and look like a deliberate short hop.
    expect(introScrollDurationMs(-4000)).toBe(INTRO_SCROLL.maxMs);
  });
});

describe('the timings both platforms share', () => {
  it('are exactly this shape', () => {
    // Exact-shape, the STALL_PLACEMENT idiom: the twin asserts the same object,
    // so a value edited on one platform fails on the other.
    expect(INTRO_SCROLL).toEqual({
      holdMs: 700,
      msPerPx: 0.25,
      minMs: 320,
      maxMs: 900,
      leadMin: 140,
      leadMax: 260,
      leadFraction: 0.3,
    });
  });

  it('hold long enough to actually read the zone card', () => {
    // The whole reason the hold exists. Anything under about half a second is
    // a stutter rather than a beat, and the owner asked to SEE the card.
    expect(INTRO_SCROLL.holdMs).toBeGreaterThanOrEqual(500);
  });
});

describe('where the stop lands in the viewport', () => {
  it('sits about a third down, clamped at both ends', () => {
    expect(introScrollLead(900)).toBe(260); // 270 clamped to the ceiling
    expect(introScrollLead(700)).toBe(210);
    expect(introScrollLead(400)).toBe(140); // 120 lifted to the floor
  });

  it('never frames the stop under whatever is pinned at the top (build 17)', () => {
    // The journey's zone board pins at the inset and stands 253 tall there on
    // a Dynamic Island phone; the cap is 260. Every current card's top landed
    // under the board, stop 1's most of all. The clearance wins over the cap.
    expect(introScrollLead(900, 315)).toBe(315);
    // And costs nothing when the plain lead already clears it.
    expect(introScrollLead(900, 100)).toBe(260);
    expect(introScrollLead(400, 0)).toBe(140);
  });

  it('never leads by more than a short viewport can spare', () => {
    // A lead taller than the viewport would scroll the stop off the top.
    for (const h of [320, 480, 640, 812, 1024]) {
      expect(introScrollLead(h)).toBeLessThan(h);
    }
  });
});

describe('the ease', () => {
  it('starts where it starts and ends where it ends', () => {
    expect(introScrollEase(0)).toBe(0);
    expect(introScrollEase(1)).toBe(1);
    expect(introScrollEase(0.5)).toBeCloseTo(0.5, 6);
  });

  it('accelerates away from the zone card and decelerates onto the stop', () => {
    // Cubic in-out rather than a plain ease-out, because the shot has a subject
    // at BOTH ends: a linear departure reads as the page being yanked.
    expect(introScrollEase(0.25)).toBeLessThan(0.25);
    expect(introScrollEase(0.75)).toBeGreaterThan(0.75);
  });

  it('clamps rather than overshooting', () => {
    // A frame clock can hand it a value past 1 when a frame is late, and an
    // unclamped cubic would sail past the stop and come back.
    expect(introScrollEase(1.4)).toBe(1);
    expect(introScrollEase(-0.3)).toBe(0);
  });
});
