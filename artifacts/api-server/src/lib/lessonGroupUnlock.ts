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
  // YOU CANNOT GATE ON A MEASUREMENT YOU HAVE DECLINED TO TAKE.
  //
  // False for a language whose speechCapability is 'unsupported' (Bodo and
  // Manipuri as of 2026-08-28). Those learners get the listen-record-compare
  // ear-training flow instead of scoring, and BOTH clients deliberately return
  // before createAttempt: web practice.tsx, mobile practice/[id].tsx, each
  // commented "no score, no band, no XP". Correct on its own terms.
  //
  // The consequence was not designed. Both doors out of a group need a score:
  // `completed` needs bestScore >= MASTERY_THRESHOLD on 80% of its phrases, and
  // `tested_out` needs the server-signed evaluation token that only the scoring
  // route issues. With no attempt rows and no tokens, neither can ever happen,
  // so group two locked forever. A learner picked Bodo, was told honestly that
  // it is listening-only, and hit a wall at the second stop with no route past
  // it. Found by tracing 2026-08-28.
  //
  // So the sequential gate simply does not apply where nothing is scored.
  // Completion and tested_out still latch normally if they ever do occur, which
  // is what makes this safe to switch back on the day recognition arrives.
  speechScored: boolean = true,
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
    previousClears = !speechScored || completed || testedOut;
  }
  return out;
}

// Test-out assessment composition (approved proposal): sample up to
// TESTOUT_SAMPLE_SIZE phrases from the group's rows accessible to the caller;
// pass requires a full-credit band (five-band perfect|great, i.e. the frozen
// legacy 'nailed' boundary of score >= 80) on at least
// ceil(TESTOUT_PASS_RATIO * sampleSize) of them.
export const TESTOUT_SAMPLE_SIZE = 5;
// RAISED FROM 0.8 TO 1 ON 2026-08-25, on the owner's instruction that a
// test-out "should be a bit harder and require band 4 or 5 for all answers".
// The BAND half of that was already true: isFullCreditBand is perfect|great,
// the top two of five, and always has been. The ratio was the only thing that
// let a slip through, so this is the change that actually bites: 5 of 5 at a
// stop, every answer of the sample at a zone.
export const TESTOUT_PASS_RATIO = 1;

export function testoutRequiredCorrect(sampleSize: number): number {
  return Math.ceil(TESTOUT_PASS_RATIO * sampleSize);
}

// Chunk 4: zone test-out sizing. Distinct from the stop-level constant: a
// zone assessment samples one phrase per contributing station, capped here.
// The stop-level TESTOUT_SAMPLE_SIZE stays 5 and is untouched.
// Stations a zone assessment may draw from. Unchanged.
export const ZONE_TESTOUT_SAMPLE_CAP = 10;

// TWO PHRASES PER STATION, NOT ONE, from 2026-08-25: "testing out of a zone
// shouldn't only be one phrase from each stop". One phrase per station let a
// learner skip a whole zone on a single lucky draw per stop. Stations with
// only one plan-visible phrase still contribute one; nothing is ever padded
// with a repeat.
export const ZONE_TESTOUT_PER_STATION = 2;

// The PHRASE ceiling, which is what the request body and the sample are
// bounded by. Named separately from the station cap because the two stopped
// being the same number the moment a station could contribute twice.
export const ZONE_TESTOUT_PHRASE_CAP =
  ZONE_TESTOUT_SAMPLE_CAP * ZONE_TESTOUT_PER_STATION;

// Chunk 4 cross-zone gate: a zone (one category in one language) is complete
// when EVERY group in it is completed or tested_out. Latch rows are honored
// first, the live ratio second, exactly like deriveGroupStatuses. Pure.
export function isZoneComplete(
  groups: GroupForUnlock[],
  stats: Map<number, PhraseStats>,
  testedOutGroupIds: Set<number>,
  completedGroupIds: Set<number>,
): boolean {
  if (groups.length === 0) return false;
  return groups.every(
    (g) =>
      completedGroupIds.has(g.id) ||
      testedOutGroupIds.has(g.id) ||
      isGroupCompleted(g.phraseIds, stats),
  );
}
