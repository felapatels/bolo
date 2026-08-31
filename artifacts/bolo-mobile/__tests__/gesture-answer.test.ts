import {
  CIRCLE_TURNS,
  pickTargetByStroke,
  strokeCrossesRect,
  strokeEnclosesRect,
  type GesturePoint,
  type GestureRect,
} from '../lib/gestureAnswer';

/**
 * Answering by gesture: the geometry under "slash the wrong ones" and
 * "circle the right one" (the owner's ruling, 2026-08-31).
 *
 * ITS TWIN IS PINNED IDENTICALLY on web, in
 * gujarati-coach/src/test/gesture-answer.test.ts. The two modules are
 * hand-maintained copies, so the expectations are written out in full in both
 * files: if one drifts, the other file fails and says so.
 *
 * A four-up board, laid out the way a picker actually is. Coordinates are
 * whatever space the caller measured in; these are points.
 */
const CARDS: { id: string; rect: GestureRect }[] = [
  { id: 'a', rect: { x: 20, y: 20, width: 120, height: 80 } },
  { id: 'b', rect: { x: 180, y: 20, width: 120, height: 80 } },
  { id: 'c', rect: { x: 20, y: 140, width: 120, height: 80 } },
  { id: 'd', rect: { x: 180, y: 140, width: 120, height: 80 } },
];

/** A rough hand-drawn loop around a rect, open where a finger lifts. */
function loopAround(rect: GestureRect, radius = 90): GesturePoint[] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const pts: GesturePoint[] = [];
  // Stops short of a full turn on purpose: nobody closes a circle they drew
  // with a fingertip.
  for (let deg = 0; deg <= 330; deg += 15) {
    const r = (deg * Math.PI) / 180;
    pts.push({ x: cx + radius * Math.cos(r), y: cy + radius * Math.sin(r) });
  }
  return pts;
}

describe('slashing', () => {
  it('a stroke straight through a card cuts it', () => {
    expect(strokeCrossesRect([{ x: 0, y: 60 }, { x: 160, y: 60 }], CARDS[0]!.rect)).toBe(true);
  });

  it('a stroke through empty space cuts nothing', () => {
    expect(strokeCrossesRect([{ x: 0, y: 125 }, { x: 320, y: 125 }], CARDS[0]!.rect)).toBe(false);
  });

  // A short flick inside one big card crosses no edge at all, and it is
  // obviously a slash at that card.
  it('a flick that stays inside the card still counts', () => {
    expect(strokeCrossesRect([{ x: 60, y: 50 }, { x: 100, y: 70 }], CARDS[0]!.rect)).toBe(true);
  });

  // One point cannot cut anything, and treating a tap as a slash would make
  // every mis-tap an answer.
  it('a single point is not a slash', () => {
    expect(strokeCrossesRect([{ x: 60, y: 50 }], CARDS[0]!.rect)).toBe(false);
    expect(strokeCrossesRect([], CARDS[0]!.rect)).toBe(false);
  });

  // Drawn exactly along the top edge. They touched it; saying otherwise is a
  // lie the learner cannot see.
  it('a stroke along the card edge counts as touching it', () => {
    expect(strokeCrossesRect([{ x: 0, y: 20 }, { x: 200, y: 20 }], CARDS[0]!.rect)).toBe(true);
  });
});

describe('circling', () => {
  it('a loop around a card encloses it', () => {
    expect(strokeEnclosesRect(loopAround(CARDS[0]!.rect), CARDS[0]!.rect)).toBe(true);
  });

  it('a loop around one card does not enclose its neighbour', () => {
    expect(strokeEnclosesRect(loopAround(CARDS[0]!.rect), CARDS[3]!.rect)).toBe(false);
  });

  // The case a ray cast gets wrong: a stroke that merely wandered past.
  it('a straight line through a card is not a circle around it', () => {
    expect(
      strokeEnclosesRect(
        [{ x: 0, y: 60 }, { x: 80, y: 60 }, { x: 160, y: 60 }],
        CARDS[0]!.rect,
      ),
    ).toBe(false);
  });

  it('an arc that gives up early is not a circle', () => {
    const lazy = loopAround(CARDS[0]!.rect).slice(0, 8); // about a fifth of a turn
    expect(strokeEnclosesRect(lazy, CARDS[0]!.rect)).toBe(false);
  });

  // Three quarters, not a full turn, because a finger-drawn loop is open.
  it('does not demand a closed circle', () => {
    expect(CIRCLE_TURNS).toBeLessThan(1);
    expect(CIRCLE_TURNS).toBeGreaterThan(0.5);
  });
});

describe('picking one answer', () => {
  it('a slash across two cards picks the one it came nearest the middle of', () => {
    // Crosses card a fully and clips the very edge of card b.
    const stroke = [{ x: 0, y: 60 }, { x: 185, y: 60 }];
    expect(pickTargetByStroke(stroke, CARDS, 'slash')).toBe('a');
  });

  it('a loop picks the card it went around', () => {
    expect(pickTargetByStroke(loopAround(CARDS[2]!.rect), CARDS, 'circle')).toBe('c');
  });

  // Not an error. They have not answered yet, and the caller lets them draw
  // again rather than marking anything.
  it('a stroke across empty space picks nothing', () => {
    const stroke = [{ x: 0, y: 125 }, { x: 320, y: 125 }];
    expect(pickTargetByStroke(stroke, CARDS, 'slash')).toBeNull();
  });

  it('an empty board picks nothing rather than throwing', () => {
    expect(pickTargetByStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }], [], 'slash')).toBeNull();
  });
});
