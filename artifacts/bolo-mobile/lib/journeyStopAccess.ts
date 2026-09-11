import type { JourneyStopTarget } from '@workspace/api-client-react';

export function ownsJourneyStop(stops: readonly JourneyStopTarget[] | undefined, target: JourneyStopTarget): boolean {
  return !!stops?.some(s => s.kind === target.kind && s.languageCode === target.languageCode &&
    (s.kind === 'lesson' ? s.lessonGroupId === target.lessonGroupId : s.journey === target.journey && s.zone === target.zone));
}

/** Topics are stable across databases; numeric category IDs are not. */
export function journeyStopCategorySlug(target: JourneyStopTarget): string | undefined {
  const journeys = [
    ['greetings', 'family', 'numbers', 'food', 'everyday', 'feelings'],
    ['travel', 'shopping', 'time', 'work', 'health', 'festivals'],
  ];
  return journeys[target.journey - 1]?.[target.zone - 1];
}
