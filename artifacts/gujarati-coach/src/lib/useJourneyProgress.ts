// Journey progress for surfaces OUTSIDE /journey (the home boarding-pass
// hero). Reuses the exact six per-zone lesson-group queries the journey page
// fires — react-query dedupes/caches them, so home warms the map and vice
// versa — and mirrors its station ordering + current-stop rules. Read-only
// presentation data: every failure mode (plain-locked 402, network error,
// still loading) degrades to `current: null` and the caller falls back to
// generic copy. Never throws, never gates anything.
import {
  useListCategoryLessonGroups,
  type LessonGroupList,
  type LessonGroupSummary,
} from "@workspace/api-client-react";
import { JOURNEY_ZONES } from "@/lib/journeyLines";
import { planZoneRows } from "@/lib/journey-rows";

function stageRank(g: LessonGroupSummary): number {
  return g.stage === "sentence" ? 1 : 0;
}

export interface JourneyCurrentStop {
  /** Geographic zone name from the line table (e.g. "Anand"). */
  geoName: string;
  zoneIndex: number;
  /**
   * 1-based stop number within the zone, AS THE MAP NUMBERS IT: the tracing and
   * story rows are stops a learner counts, so they count here too. See
   * planZoneRows for why this cannot be the graded index.
   */
  stopNumber: number;
  /** Rows in the zone, again as the map draws them, not lesson groups. */
  stopCount: number;
  masteredCount: number;
  phraseCount: number;
  /** True when the learner has attempted this stop before (vs a fresh start). */
  started: boolean;
}

/**
 * One zone as the one-pager map's legend draws it (build 20). Counted from the
 * same six payloads as `current`, so the map and the boarding pass cannot
 * disagree about where the learner is. Mobile twin: lib/useJourneyProgress.ts.
 */
export interface JourneyZoneProgress {
  zoneIndex: number;
  geoName: string;
  /** Rows the journey draws for this zone: graded stops plus tracing and story. */
  stopCount: number;
  /** Graded stops in the zone, before the two spliced rows. */
  gradedCount: number;
  /** Graded stops finished (completed or tested out). */
  doneCount: number;
  /** The current stop's row number when it sits in this zone, else null. */
  currentStopNumber: number | null;
  /** Every graded stop finished. Never true for an empty zone. */
  allDone: boolean;
  /** Every graded stop locked: the learner may not enter this zone yet. */
  locked: boolean;
  /** The zone's topic as the line table titles it ("Greetings & Manners"). */
  title: string;
  /**
   * Phrases mastered and phrases on offer, summed over the zone's graded
   * stops (mobile build 22, here build 23: the Progress page's journey card
   * draws a bar per zone). A planLocked stop reports zero phrases, so a free
   * learner's total is the total their plan can reach, which is the honest
   * denominator.
   */
  masteredCount: number;
  phraseCount: number;
}

export interface JourneyProgress {
  /** The stop Bolo is waiting at, or null when unknown (loading/locked/error). */
  current: JourneyCurrentStop | null;
  /** Per-zone progress in journey order; empty while loading, locked or errored. */
  zones: JourneyZoneProgress[];
  doneCount: number;
  totalCount: number;
  isLoading: boolean;
  /**
   * True when no boardable stop exists but the line continues into stops the
   * caller's plan cannot see (planLocked groups). The boarding pass renders
   * an upgrade nudge instead of the generic "continue" copy — the honest
   * reading of "nothing to board".
   */
  planBlocked: boolean;
}

export function useJourneyProgress(
  lang: string,
  zoneGeoNames: readonly string[],
): JourneyProgress {
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, lang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, lang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, lang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, lang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, lang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, lang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  const isLoading = zoneQueries.some((q) => q.isLoading);
  if (isLoading || zoneQueries.some((q) => q.isError)) {
    return {
      current: null,
      zones: [],
      doneCount: 0,
      totalCount: 0,
      isLoading,
      planBlocked: false,
    };
  }

  let doneCount = 0;
  let totalCount = 0;
  let anyPlanGated = false;
  let current: JourneyCurrentStop | null = null;
  const zones: JourneyZoneProgress[] = [];
  zoneQueries.forEach((q, i) => {
    const groups = [...((q.data as LessonGroupList | undefined)?.lessonGroups ?? [])].sort(
      (a, b) => stageRank(a) - stageRank(b) || (a.position ?? 0) - (b.position ?? 0),
    );
    // THE NUMBER THE MAP WILL SHOW, not the index in the payload. The hero and
    // the map are seen back to back and were disagreeing on BOTH platforms: the
    // map splices a tracing row and a story row into every zone and renumbers
    // the run. Fixed on mobile first (2026-08-27) and found here by the parity
    // sweep, not by a report.
    const rowPlan = planZoneRows({
      lang,
      zoneIndex: i,
      gradedCount: groups.length,
    });
    let zoneDone = 0;
    let zoneMastered = 0;
    let zonePhrases = 0;
    let zoneCurrentStopNumber: number | null = null;
    groups.forEach((g, gi) => {
      totalCount += 1;
      zoneMastered += g.masteredCount ?? 0;
      zonePhrases += g.phraseCount ?? 0;
      if (g.status === "completed" || g.status === "tested_out") {
        doneCount += 1;
        zoneDone += 1;
      }
      // S2 map honesty: a planLocked group has ZERO phrases the caller's plan
      // can practice (the server already reports it status "locked"); it can
      // never be the boarding-pass target. Free-tier content policy: sentence
      // stops are no longer skipped by stage — Hindi Fare Zone 1's sentence
      // stops serve free, so planLocked is the single plan authority here.
      if (g.planLocked === true) {
        anyPlanGated = true;
      }
      if (
        current === null &&
        g.planLocked !== true &&
        (g.status === "unlocked" || g.status === "in_progress")
      ) {
        current = {
          geoName: zoneGeoNames[i] ?? "",
          zoneIndex: i,
          stopNumber: rowPlan.rowNumberOfGraded(gi),
          stopCount: rowPlan.rowCount,
          masteredCount: g.masteredCount ?? 0,
          phraseCount: g.phraseCount ?? 0,
          started: (g.attemptedCount ?? 0) > 0,
        };
        zoneCurrentStopNumber = current.stopNumber;
      }
    });
    zones.push({
      zoneIndex: i,
      geoName: zoneGeoNames[i] ?? "",
      stopCount: groups.length > 0 ? rowPlan.rowCount : 0,
      gradedCount: groups.length,
      doneCount: zoneDone,
      currentStopNumber: zoneCurrentStopNumber,
      // Mirrors the journey's zoneAllDone and zoneGateLocked, both of which
      // count off the graded stations only and treat an empty zone as neither.
      allDone: groups.length > 0 && zoneDone === groups.length,
      locked: groups.length > 0 && groups.every((g) => g.status === "locked"),
      title: JOURNEY_ZONES[i]?.title ?? "",
      masteredCount: zoneMastered,
      phraseCount: zonePhrases,
    });
  });

  return {
    current,
    zones,
    doneCount,
    totalCount,
    isLoading: false,
    planBlocked: current === null && anyPlanGated,
  };
}
