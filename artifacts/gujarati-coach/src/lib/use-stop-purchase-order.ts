import { useQueries } from '@tanstack/react-query';
import { getListCategoryLessonGroupsQueryOptions, type JourneyStopTarget } from '@workspace/api-client-react';
import { JOURNEY_CATEGORY_SLUGS, orderedZoneStops, nextUnownedStop, sameJourneyStop } from '@/lib/journey-stop-order';

/** Show the same purchase sequence the server enforces, without another wire format. */
export function useStopPurchaseOrder(target: JourneyStopTarget, categories: readonly { id: number; slug: string }[] | undefined, owned: readonly JourneyStopTarget[] | undefined) {
  const zones = JOURNEY_CATEGORY_SLUGS.slice(0, target.journey).flatMap((slugs, j) => slugs.flatMap((slug, z) => {
    if (j === 0 && z === 0) return []; // All of Journey 1 Zone 1 is already free.
    const category = categories?.find(c => c.slug === slug);
    return category ? [{ id: category.id, journey: j + 1, zone: z + 1 }] : [];
  }));
  const queries = useQueries({ queries: zones.map(z => getListCategoryLessonGroupsQueryOptions(z.id, target.languageCode)) });
  const ready = categories != null && owned != null && queries.every(q => q.isSuccess);
  const stops = zones.flatMap((z, i) => orderedZoneStops(target.languageCode, z.journey, z.zone,
    (queries[i]?.data?.lessonGroups ?? []).filter(g => (g.phraseCount ?? 0) > 0 || g.chaiUnlockable === true).flatMap(g => g.id == null ? [] : [{ id: g.id, position: g.position, stage: g.stage }])));
  const nextStop = ready ? nextUnownedStop(stops, owned!) : undefined;
  return { ready, nextStop, canBuy: !!nextStop && sameJourneyStop(nextStop, target),
    isError: queries.some(q => q.isError), retry: () => { for (const q of queries) void q.refetch(); } };
}
