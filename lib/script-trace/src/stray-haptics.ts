/**
 * "Buzz harder the further off the line they go."
 *
 * Requested 2026-08-23. The decision that shapes everything here is that the
 * feedback is GRADUAL rather than a single alarm at a threshold: a learner who
 * is drifting should feel it building while they can still correct, not get
 * one buzz once they are already lost.
 *
 * PURE, and shared, for the usual reason. Web and mobile keep two
 * hand-maintained tracing screens, so a rule written in either would be a
 * second definition within a week and the two would disagree about when a
 * learner is off course. What is platform-specific is only how a level is
 * PLAYED: expo-haptics on the phone, navigator.vibrate on the web.
 *
 * No clock is read in here. Callers pass the time in, which is what keeps this
 * module testable and free of the platform.
 */
import type { StrokePoint } from "./stroke-scoring";
import { SHAPE_TOLERANCE } from "./stroke-scoring";

/**
 * Distance beyond tolerance at which the buzz is at full strength.
 *
 * On the 0-100 canvas, SHAPE_TOLERANCE (8) is roughly "still on the letter".
 * 22 units past that is most of a letter's width away, which is as wrong as
 * the feedback needs to distinguish: everything past it is simply "lost".
 */
export const STRAY_FULL = 22;

/** How far a point is from the nearest point on the guide, in canvas units. */
export function distanceToGuide(
  point: StrokePoint,
  guide: readonly StrokePoint[],
): number {
  let best = Infinity;
  for (const g of guide) {
    const dx = point.x - g.x;
    const dy = point.y - g.y;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : Math.sqrt(best);
}

/**
 * How far off course, 0 on the line through 1 completely lost.
 *
 * Zero while inside tolerance, on purpose. A learner tracing accurately must
 * feel NOTHING, or the buzz stops carrying information and becomes texture.
 */
export function strayIntensity(
  point: StrokePoint,
  guide: readonly StrokePoint[],
  tolerance: number = SHAPE_TOLERANCE,
): number {
  if (guide.length === 0) return 0;
  const over = distanceToGuide(point, guide) - tolerance;
  if (over <= 0) return 0;
  return Math.min(1, over / STRAY_FULL);
}

/** What a haptic engine can actually express. 0 is silence. */
export type StrayLevel = 0 | 1 | 2 | 3;

export function strayLevel(intensity: number): StrayLevel {
  if (intensity <= 0) return 0;
  if (intensity < 0.34) return 1;
  if (intensity < 0.67) return 2;
  return 3;
}

/** How often a sustained level repeats, in ms. Worse means more insistent. */
const REPEAT_MS: Record<StrayLevel, number> = { 0: 0, 1: 420, 2: 260, 3: 150 };

/**
 * Decides when to fire, so a 60fps pointer stream does not become a 60Hz buzz.
 *
 * Two rules, and the first is why this is not a plain interval. A RISING level
 * fires at once, because the whole point is to feel yourself getting worse in
 * time to correct it. A level that is merely holding repeats on an interval
 * that shortens as it worsens, so "quite far off" and "lost" differ in rhythm
 * as well as in strength.
 *
 * Dropping back to on-course goes silent immediately and resets, so the next
 * drift is felt as a fresh mistake rather than a continuation.
 */
export class StrayBuzzer {
  private level: StrayLevel = 0;
  private lastFiredAt = 0;

  /** The level to play now, or null to stay quiet. */
  next(intensity: number, nowMs: number): StrayLevel | null {
    const level = strayLevel(intensity);

    if (level === 0) {
      this.level = 0;
      return null;
    }
    if (level > this.level) {
      this.level = level;
      this.lastFiredAt = nowMs;
      return level;
    }
    this.level = level;
    if (nowMs - this.lastFiredAt >= REPEAT_MS[level]) {
      this.lastFiredAt = nowMs;
      return level;
    }
    return null;
  }

  /** Between strokes and between letters, so nothing carries over. */
  reset(): void {
    this.level = 0;
    this.lastFiredAt = 0;
  }
}

/**
 * Vibration pattern for a level, in ms, for navigator.vibrate().
 *
 * The web has one knob, duration, so strength is expressed as length. Kept
 * here rather than in the web app so the two platforms' ideas of "level 3"
 * are defined in the same file.
 */
export const STRAY_VIBRATE_MS: Record<StrayLevel, number> = {
  0: 0,
  1: 12,
  2: 25,
  3: 45,
};
