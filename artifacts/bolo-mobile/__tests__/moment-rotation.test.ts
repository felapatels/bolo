import { MOMENT_ROTATION, momentRotationIndex } from '@/lib/momentRotation';

// THE HOME MOMENT ROTATES, AND SNAPS BACK WHEN NEWS ARRIVES.
//
// The card fetched limit=1 and drew entry zero forever, so a learner who opened
// home twice in a minute saw the same line both times and the card looked static
// while friends were busy. Work queue item 6, asked for in chat 7.
//
// The index is a pure function precisely so the interesting behaviour, the
// reset, can be asserted without a timer or a render in the way.
//
// // Web twin: gujarati-coach/src/test/moment-rotation.test.ts.

describe('the moment rotation', () => {
  it('cycles through the entries and wraps', () => {
    expect(momentRotationIndex(4, 0)).toBe(0);
    expect(momentRotationIndex(4, 3)).toBe(3);
    expect(momentRotationIndex(4, 4)).toBe(0);
    expect(momentRotationIndex(4, 9)).toBe(1);
  });

  it('never indexes past a short list', () => {
    // The feed can return fewer than the limit, and an index past the end
    // would blank the card rather than throw, which is the worst shape of bug:
    // it looks like "no friend activity".
    expect(momentRotationIndex(1, 7)).toBe(0);
    expect(momentRotationIndex(2, 7)).toBe(1);
  });

  it('answers 0 for an empty feed instead of dividing by zero', () => {
    expect(momentRotationIndex(0, 5)).toBe(0);
  });

  it('holds long enough to be a door rather than a slot machine', () => {
    // This line is a door, not something to read. A door that changes while a
    // thumb is travelling toward it is worse than a static one, which is why
    // the hold is longer than the journey fact strip's 6s.
    expect(MOMENT_ROTATION.holdMs).toBeGreaterThan(6000);
    expect(MOMENT_ROTATION.fadeMs).toBeLessThan(MOMENT_ROTATION.holdMs);
  });

  it('is exactly this shape', () => {
    expect(MOMENT_ROTATION).toEqual({ limit: 4, holdMs: 7000, fadeMs: 260 });
  });
});
