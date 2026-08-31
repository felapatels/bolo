/**
 * Answering a question with a GESTURE instead of a tap.
 *
 * The owner's ruling, 2026-08-31: stop building "select an answer from the
 * following". Answers should be drawn, dragged or slashed. Two of the three
 * mechanics named (slash the wrong answers, circle the right one) reduce to
 * the same question, which nothing in this app could answer: given a stroke
 * the finger drew and the boxes the cards occupy, WHICH CARD DID THEY MEAN?
 *
 * PURE GEOMETRY, NO REACT, NO GESTURE LIBRARY. It takes a polyline and some
 * rectangles and returns a decision, so it is testable to the pixel without a
 * device, which matters here: a gesture that is wrong by a few points is the
 * kind of bug that only shows up under a real thumb on a real phone.
 *
 * WHY NOT lib/script-trace, WHICH ALREADY SCORES A DRAWN STROKE. Its capture
 * transfers and its scoring does not, and the difference is the whole reason
 * this file exists. `scoreGlyph` compares a drawing against AUTHORED REFERENCE
 * STROKES for a letter, and `scoreCoverage` asks how much of a glyph's
 * interior the strokes reached. Neither has any meaning for "did this loop go
 * around the third card". What DOES transfer is the shape of the captured
 * data: a plain array of points, which is what these functions take.
 *
 * THE WEB TWIN OF artifacts/bolo-mobile/lib/gestureAnswer.ts.
 * Web and mobile are hand-maintained twins, so change both or neither; the
 * expectations are written out in full in both test files, so a drift in one
 * fails the other.
 */

export type GesturePoint = { x: number; y: number };

/**
 * A target's box in the same coordinate space as the stroke.
 *
 * Deliberately the shape RN's `onLayout` already hands you
 * (`LayoutRectangle`), and the shape a DOM `getBoundingClientRect` reduces to,
 * so neither platform has to convert before calling.
 */
export type GestureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Where a target's centre sits. The point a loop has to enclose. */
function centreOf(rect: GestureRect): GesturePoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Do two segments cross?
 *
 * Orientation test rather than solving for an intersection point, because the
 * point is never wanted and the division to find it is what introduces the
 * precision bugs. Collinear overlap counts as crossing: a slash drawn exactly
 * along a card's edge did touch that card, and telling the learner it missed
 * would be a lie they cannot see.
 */
function segmentsCross(
  a1: GesturePoint,
  a2: GesturePoint,
  b1: GesturePoint,
  b2: GesturePoint,
): boolean {
  const cross = (o: GesturePoint, p: GesturePoint, q: GesturePoint): number =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const onSegment = (o: GesturePoint, p: GesturePoint, q: GesturePoint): boolean =>
    Math.min(o.x, q.x) <= p.x &&
    p.x <= Math.max(o.x, q.x) &&
    Math.min(o.y, q.y) <= p.y &&
    p.y <= Math.max(o.y, q.y);

  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(a1, b1, a2)) return true;
  if (d2 === 0 && onSegment(a1, b2, a2)) return true;
  if (d3 === 0 && onSegment(b1, a1, b2)) return true;
  if (d4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

/** True when the point is inside the box, edges included. */
function rectContains(rect: GestureRect, p: GesturePoint): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

/**
 * SLASH: did this stroke cut through the box?
 *
 * True when any segment of the stroke crosses any edge of the rectangle, and
 * also when the whole stroke lies INSIDE the box, which crosses no edge at all
 * and is what a short flick within one big card looks like.
 *
 * A single tap is not a slash. One point cannot cut anything, and treating it
 * as a hit would make every mis-tap an answer.
 */
export function strokeCrossesRect(
  stroke: readonly GesturePoint[],
  rect: GestureRect,
): boolean {
  if (stroke.length < 2) return false;

  const corners: GesturePoint[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];

  for (let i = 0; i < stroke.length - 1; i++) {
    const p = stroke[i]!;
    const q = stroke[i + 1]!;
    if (rectContains(rect, p) || rectContains(rect, q)) return true;
    for (let c = 0; c < 4; c++) {
      if (segmentsCross(p, q, corners[c]!, corners[(c + 1) % 4]!)) return true;
    }
  }
  return false;
}

/** Within a hair of the same place, in whatever units the caller measured in. */
function nearlyAt(p: GesturePoint, q: GesturePoint): boolean {
  return Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
}

/**
 * The shortest distance, squared, from a point to a SEGMENT of the stroke.
 *
 * SEGMENTS, NOT THE SAMPLED POINTS, and the difference decides answers. A
 * slash is captured as however many points the touch pipeline happened to
 * emit, so measuring to the points alone means a long fast stroke with two
 * samples reads as far from everything it passed straight through. Measured
 * that way, a slash from the left edge through the first card to the second
 * card's near edge picks the SECOND card, because both sampled points sit
 * further from the first card's middle than from the second's. Along the path
 * it drew, it goes through the first card's exact centre. Sampling density
 * must not change which card the learner is judged to have picked.
 */
function distanceSqToSegment(
  p: GesturePoint,
  a: GesturePoint,
  b: GesturePoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
}

/**
 * How much of a full turn the stroke winds around a point.
 *
 * THE WINDING ANGLE, NOT A RAY CAST, AND THAT IS THE WHOLE DESIGN. Ray casting
 * answers "is this point inside the polygon", which needs the polygon closed and
 * says yes to a stroke that merely wandered past. A learner circling an answer
 * draws an OPEN loop with a gap where they lifted their finger, and the honest
 * question is "did they go around it", which is what the accumulated turn
 * measures. A near-complete circle answers yes and a lazy arc answers no,
 * without either being closed for them.
 */
function windingTurns(stroke: readonly GesturePoint[], about: GesturePoint): number {
  let total = 0;
  for (let i = 0; i < stroke.length - 1; i++) {
    const a = stroke[i]!;
    const b = stroke[i + 1]!;
    // A POINT SITTING ON THE CENTRE HAS NO ANGLE, and atan2(0, 0) answers 0
    // rather than saying so, which silently invents most of a turn. Skipping
    // the step is the honest reading: a finger that went through the middle
    // did not go around anything.
    if (nearlyAt(a, about) || nearlyAt(b, about)) continue;
    const a1 = Math.atan2(a.y - about.y, a.x - about.x);
    const a2 = Math.atan2(b.y - about.y, b.x - about.x);
    let d = a2 - a1;
    // Take the short way round, so one step can never claim most of a turn.
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.abs(total) / (2 * Math.PI);
}

/**
 * How much of a turn counts as having circled something.
 *
 * Not a full turn. Nobody closes a circle they drew with a fingertip around a
 * card they are looking at, and demanding one would reject the gesture most
 * learners actually make. Three quarters is comfortably more than the half turn
 * a stroke passing straight along one side accumulates.
 */
export const CIRCLE_TURNS = 0.75;

/** CIRCLE: did this stroke go around the box? */
export function strokeEnclosesRect(
  stroke: readonly GesturePoint[],
  rect: GestureRect,
): boolean {
  if (stroke.length < 3) return false;
  return windingTurns(stroke, centreOf(rect)) >= CIRCLE_TURNS;
}

/**
 * Which target a stroke picked, or null when it picked none.
 *
 * ONE ANSWER, NEVER TWO. A sloppy loop can enclose a neighbour as well, and a
 * long slash can cut three cards, so the winner is the target whose CENTRE the
 * stroke came closest to. Returning the first match instead would make the
 * answer depend on the order the cards happen to be laid out in, which is the
 * kind of bug that reproduces on one screen size and not another.
 *
 * `null` is a normal outcome and not an error: a learner who drew across empty
 * space has not answered yet, and the caller should let them draw again rather
 * than marking anything.
 */
export function pickTargetByStroke<T>(
  stroke: readonly GesturePoint[],
  targets: readonly { id: T; rect: GestureRect }[],
  mode: "slash" | "circle",
): T | null {
  const test = mode === "circle" ? strokeEnclosesRect : strokeCrossesRect;
  let best: { id: T; distance: number } | null = null;

  for (const target of targets) {
    if (!test(stroke, target.rect)) continue;
    const c = centreOf(target.rect);
    let nearest = Infinity;
    if (stroke.length === 1) {
      nearest = (stroke[0]!.x - c.x) ** 2 + (stroke[0]!.y - c.y) ** 2;
    }
    for (let i = 0; i < stroke.length - 1; i++) {
      const d = distanceSqToSegment(c, stroke[i]!, stroke[i + 1]!);
      if (d < nearest) nearest = d;
    }
    if (best === null || nearest < best.distance) {
      best = { id: target.id, distance: nearest };
    }
  }
  return best === null ? null : best.id;
}
