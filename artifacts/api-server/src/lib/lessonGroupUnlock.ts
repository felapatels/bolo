// D1a Slice 2: sequential lesson-group unlock derivation.
//
// Unlock state is DERIVED at read time from real signals — no stored counters:
//   - completed: >= COMPLETION_RATIO of the group's phrases have
//     bestScore >= MASTERY_THRESHOLD (the attempts-based mastery signal that
//     already drives masteredCount on the read endpoints; per decision (a),
//     NOT the FSRS stability signal, which stays the review scheduler).
//   - tested_out: the only persisted state (lesson_group_progress rows) —
//     the learner passed the test-out assessment for the group.
//   - unlocked: first group by position, or previous group completed or
//     tested out. in_progress: unlocked with at least one attempted phrase.
//   - locked: everything else.
//
// Monotonicity ("never re-locks"): bestScore only rises and tested_out rows
// are never deleted — but the group DENOMINATOR can grow (the replenisher
// appends fresh phrases to the last under-cap phrase group), which would
// dilute a completed group's ratio below the threshold. So `completed` is
// LATCHED: the read endpoint persists a lesson_group_progress row the first
// time completion is observed, and the derivation honors persisted
// completed/tested_out rows regardless of the current ratio.
//
// Entitlement precedence is handled by the CALLER: the deny* gates run before
// any unlock computation, so unlock state can never grant access that
// entitlements deny.
import type { PhraseStats } from "./progressMetrics";

export type LessonGroupStatus =
  | "locked"
  | "unlocked"
  | "in_progress"
  | "completed"
  | "tested_out";

// A group is completed when at least this share of its phrases are mastered.
export const COMPLETION_RATIO = 0.8;

export interface GroupForUnlock {
  id: number;
  position: number;
  phraseIds: number[];
}

export function isGroupCompleted(
  phraseIds: number[],
  stats: Map<number, PhraseStats>,
): boolean {
  if (phraseIds.length === 0) return false;
  const mastered = phraseIds.filter((id) => stats.get(id)?.mastered).length;
  return mastered / phraseIds.length >= COMPLETION_RATIO;
}

/**
 * Derives the unlock status of every group in one (language, category).
 * `groups` MUST be ordered by position ascending. `testedOutGroupIds` are the
 * persisted tested_out rows for this user.
 */
export function deriveGroupStatuses(
  groups: GroupForUnlock[],
  stats: Map<number, PhraseStats>,
  testedOutGroupIds: Set<number>,
  // Persisted completion latch: groups that were EVER observed completed stay
  // completed even if replenishment later grew their denominator.
  completedGroupIds: Set<number> = new Set(),
): Map<number, LessonGroupStatus> {
  const out = new Map<number, LessonGroupStatus>();
  let previousClears = true; // first group is always unlocked
  for (const g of groups) {
    const completed =
      completedGroupIds.has(g.id) || isGroupCompleted(g.phraseIds, stats);
    const testedOut = testedOutGroupIds.has(g.id);
    let status: LessonGroupStatus;
    if (completed) {
      status = "completed";
    } else if (testedOut) {
      status = "tested_out";
    } else if (previousClears) {
      const attempted = g.phraseIds.some(
        (id) => (stats.get(id)?.attemptCount ?? 0) > 0,
      );
      status = attempted ? "in_progress" : "unlocked";
    } else {
      status = "locked";
    }
    out.set(g.id, status);
    previousClears = completed || testedOut;
  }
  return out;
}

// Test-out assessment composition (approved proposal): sample up to
// TESTOUT_SAMPLE_SIZE phrases from the group's rows accessible to the caller;
// pass requires band 'nailed' (score >= 80) on at least
// ceil(TESTOUT_PASS_RATIO * sampleSize) of them.
export const TESTOUT_SAMPLE_SIZE = 5;
export const TESTOUT_PASS_RATIO = 0.8;

export function testoutRequiredCorrect(sampleSize: number): number {
  return Math.ceil(TESTOUT_PASS_RATIO * sampleSize);
}
