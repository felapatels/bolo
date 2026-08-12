// The single source of truth for how large a topic's phrase set may grow, and
// for the one counting rule every ceiling check uses.
//
// Why this module exists: the manual "Add more phrases" endpoint and the
// background replenisher bound the same AI cost, and they used to count
// different things. The replenisher's trigger asked "how many phrases can this
// learner SEE?" while its executor asked "how many phrase rows EXIST?". On
// live Hindi data (40 rows, 8 visible to Free) those differ by 5x, so Free
// background top-ups fired and then always bailed. One ceiling, one counting
// basis, read by both paths and reported to clients, or that bug class repeats.
import { featuresForPlan, type Plan } from "./entitlements";

// The ceiling counts rows VISIBLE TO THE CALLER'S TIER, phrase stage only.
// Sentence-stage rows are a separate, Plus-only stage and are never counted:
// this bounds the phrase stage.
//
// Family resolves to the `plus` plan per-request (family membership grants the
// owner's Plus features rather than a distinct plan value), so Family gets the
// same 60 as All-Access without needing its own entry here.
export const PHRASE_CEILINGS: Record<Plan, number> = {
  free: 20,
  one_language: 20,
  plus: 60,
};

export function phraseCeilingForPlan(plan: Plan): number {
  return PHRASE_CEILINGS[plan];
}

// How many manual appends one learner may make per rolling hour, on every
// tier. Per user rather than per topic, so switching topics does not reset it.
export const MANUAL_APPENDS_PER_HOUR = 10;

// The rows a ceiling counts. Rows the caller cannot see do not count against
// the caller's ceiling, which is the whole point of the visible-row basis.
export function visiblePhraseRows<
  T extends { premium: boolean | null; stage: string | null },
>(rows: T[], plan: Plan): T[] {
  const canAccessPremium = featuresForPlan(plan).extendedLibrary;
  return rows.filter(
    (r) => r.stage === "phrase" && (canAccessPremium || !r.premium),
  );
}

export function countVisiblePhrases(
  rows: { premium: boolean | null; stage: string | null }[],
  plan: Plan,
): number {
  return visiblePhraseRows(rows, plan).length;
}

// How many more phrases this caller may add to a topic right now. Never
// negative. A request is clamped to this rather than refused outright near the
// boundary: at 18 visible with a batch of 3, the learner gets 2.
export function remainingHeadroom(visibleCount: number, plan: Plan): number {
  return Math.max(0, phraseCeilingForPlan(plan) - visibleCount);
}
