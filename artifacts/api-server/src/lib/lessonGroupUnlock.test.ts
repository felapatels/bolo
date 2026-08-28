/**
 * Sequential unlock, and the case where the gate must stand down.
 *
 * Bodo and Manipuri carry speechCapability 'unsupported': both clients give
 * those learners the listen-record-compare ear-training flow and deliberately
 * never create an attempt row. Nothing was wrong with that. What nobody
 * designed was the consequence: `completed` needs mastery on 80% of a group's
 * phrases and `tested_out` needs the server-signed evaluation token that only
 * the scoring route issues, so with no attempts and no tokens BOTH doors out of
 * group one were shut and the journey locked forever. Traced 2026-08-28.
 *
 * These pin both halves: the gate stands down where nothing is scored, and it
 * behaves exactly as before everywhere else.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { deriveGroupStatuses, isGroupCompleted } from "./lessonGroupUnlock";
import type { PhraseStats } from "./progressMetrics";

const GROUPS = [
  { id: 1, position: 1, phraseIds: [10, 11, 12, 13, 14] },
  { id: 2, position: 2, phraseIds: [20, 21, 22, 23, 24] },
  { id: 3, position: 3, phraseIds: [30, 31, 32, 33, 34] },
];

/** No attempts at all, which is exactly what an unscored language produces. */
const NO_STATS = new Map<number, PhraseStats>();

function masteredStats(phraseIds: number[]): Map<number, PhraseStats> {
  return new Map(
    phraseIds.map((id) => [id, { bestScore: 90, attemptCount: 1, mastered: true }]),
  );
}

test("scored language: the gate holds, and group two stays locked with no mastery", () => {
  const statuses = deriveGroupStatuses(GROUPS, NO_STATS, new Set(), new Set(), true);

  assert.equal(statuses.get(1), "unlocked");
  assert.equal(statuses.get(2), "locked");
  assert.equal(statuses.get(3), "locked");
});

test("omitting the flag behaves exactly as a scored language", () => {
  // Every existing caller that has not been threaded yet must keep the old
  // behaviour, so the default is the safe one.
  const withDefault = deriveGroupStatuses(GROUPS, NO_STATS, new Set(), new Set());
  const explicit = deriveGroupStatuses(GROUPS, NO_STATS, new Set(), new Set(), true);

  assert.deepEqual([...withDefault], [...explicit]);
});

test("UNSCORED language: every group opens, with no attempts anywhere", () => {
  // THE REGRESSION THIS FILE EXISTS FOR. Before 2026-08-28 groups 2 and 3 came
  // back 'locked' here and there was no route in the product that could ever
  // open them.
  const statuses = deriveGroupStatuses(GROUPS, NO_STATS, new Set(), new Set(), false);

  assert.equal(statuses.get(1), "unlocked");
  assert.equal(statuses.get(2), "unlocked");
  assert.equal(statuses.get(3), "unlocked");
});

test("unscored language: a group with attempts still reads in_progress", () => {
  // Ear-training records nothing today, so this branch is unreachable from the
  // app. It is pinned anyway: if a later change starts logging ear-training
  // attempts, the status must be the honest one rather than a flat 'unlocked'.
  const stats = new Map<number, PhraseStats>([
    [20, { bestScore: null, attemptCount: 3, mastered: false }],
  ]);
  const statuses = deriveGroupStatuses(GROUPS, stats, new Set(), new Set(), false);

  assert.equal(statuses.get(2), "in_progress");
});

test("unscored language: completion and tested_out still latch", () => {
  // This is what makes the stand-down safe to reverse. The day recognition
  // arrives for one of these languages, real progress is already recorded in
  // the same shape, so flipping the flag back gives a coherent journey rather
  // than a reset one.
  const statuses = deriveGroupStatuses(
    GROUPS,
    masteredStats(GROUPS[0].phraseIds),
    new Set([2]),
    new Set(),
    false,
  );

  assert.equal(statuses.get(1), "completed");
  assert.equal(statuses.get(2), "tested_out");
  assert.equal(statuses.get(3), "unlocked");
});

test("the stand-down changes ONLY the gate, never the completion ratio", () => {
  // isGroupCompleted is untouched by any of this: four of five is 0.8 and
  // passes, three of five does not. If this ever drifts, the flag has started
  // meaning "count it as done", which is not what it means.
  assert.equal(isGroupCompleted(GROUPS[0].phraseIds, masteredStats([10, 11, 12, 13])), true);
  assert.equal(isGroupCompleted(GROUPS[0].phraseIds, masteredStats([10, 11, 12])), false);
  assert.equal(isGroupCompleted([], NO_STATS), false);
});
