// Journey progress for surfaces OUTSIDE /journey (the home boarding-pass
// hero). Port of the web hook (gujarati-coach/src/lib/useJourneyProgress.ts).
// Reuses the exact six per-zone lesson-group queries the journey screen
// fires — react-query dedupes/caches them, so home warms the map and vice
// versa — and mirrors its station ordering + current-stop rules. Read-only
// presentation data: every failure mode (plain-locked 402, network error,
// still loading) degrades to `current: null` and the caller falls back to
// generic copy. Never throws, never gates anything.
//
// Entitlement note: the web hook reads `isAllAccess`; the mobile entitlements
// context exposes the same plan bit as `isPlus` (plan === 'plus').
import {
  useListCategoryLessonGroups,
  type LessonGroupList,
  type LessonGroupSummary,
} from '@workspace/api-client-react';
import { JOURNEY_ZONES } from '@/lib/journeyLines';
import { useEntitlements } from '@/contexts/EntitlementsContext';

function stageRank(g: LessonGroupSummary): number {
  return g.stage === 'sentence' ? 1 : 0;
}

export interface JourneyCurrentStop {
  /** Geographic zone name from the line table (e.g. "Anand"). */
  geoName: string;
  zoneIndex: number;
  /** 1-based stop number within the zone. */
  stopNumber: number;
  /** Stations in the zone. */
  stopCount: number;
  masteredCount: number;
  phraseCount: number;
  /** True when the learner has attempted this stop before (vs a fresh start). */
  started: boolean;
}

export interface JourneyProgress {
  /** The stop Bolo is waiting at, or null when unknown (loading/locked/error). */
  current: JourneyCurrentStop | null;
  doneCount: number;
  totalCount: number;
  isLoading: boolean;
}

export function useJourneyProgress(
  lang: string,
  zoneGeoNames: readonly string[],
): JourneyProgress {
  const { isPlus } = useEntitlements();
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, lang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, lang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, lang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, lang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, lang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, lang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  const isLoading = zoneQueries.some((q) => q.isLoading);
  if (isLoading || zoneQueries.some((q) => q.isError)) {
    return { current: null, doneCount: 0, totalCount: 0, isLoading };
  }

  let doneCount = 0;
  let totalCount = 0;
  let current: JourneyCurrentStop | null = null;
  zoneQueries.forEach((q, i) => {
    const groups = [...((q.data as LessonGroupList | undefined)?.lessonGroups ?? [])].sort(
      (a, b) => stageRank(a) - stageRank(b) || (a.position ?? 0) - (b.position ?? 0),
    );
    groups.forEach((g, gi) => {
      totalCount += 1;
      if (g.status === 'completed' || g.status === 'tested_out') doneCount += 1;
      if (
        current === null &&
        (g.status === 'unlocked' || g.status === 'in_progress') &&
        !(g.stage === 'sentence' && !isPlus)
      ) {
        current = {
          geoName: zoneGeoNames[i] ?? '',
          zoneIndex: i,
          stopNumber: gi + 1,
          stopCount: groups.length,
          masteredCount: g.masteredCount ?? 0,
          phraseCount: g.phraseCount ?? 0,
          started: (g.attemptedCount ?? 0) > 0,
        };
      }
    });
  });

  return { current, doneCount, totalCount, isLoading: false };
}
