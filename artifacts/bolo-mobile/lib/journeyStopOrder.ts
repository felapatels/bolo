import { storyBookFor, storyStopIndexIn } from '@workspace/story';
import { traceStopFor, traceStopIndexIn, letterStopFor, letterStopIndexIn } from '@workspace/script-trace';
import type { JourneyStopTarget } from '@workspace/api-client-react';

export const JOURNEY_CATEGORY_SLUGS: readonly (readonly string[])[] = [
  ['greetings', 'family', 'numbers', 'food', 'everyday', 'feelings'],
  ['travel', 'shopping', 'time', 'work', 'health', 'festivals'],
];

/** Same insertion order as both journey maps: lessons, tracing, story, letters. */
export function orderedZoneStops(languageCode: string, journey: number, zone: number, groups: readonly { id: number; position?: number; stage?: string | null }[]): JourneyStopTarget[] {
  const stops: JourneyStopTarget[] = [...groups]
    .sort((a, b) => Number(a.stage === 'sentence') - Number(b.stage === 'sentence') || (a.position ?? 0) - (b.position ?? 0))
    .map(g => ({ kind: 'lesson', languageCode, journey, zone, lessonGroupId: g.id }));
  if (!stops.length) return stops;
  const trace = traceStopFor(languageCode, journey, zone);
  const traceIndex = trace ? traceStopIndexIn(stops.length, journey, zone) : null;
  if (traceIndex != null) stops.splice(traceIndex, 0, { kind: 'trace', languageCode, journey, zone });
  const story = storyBookFor(journey, zone);
  const storyIndex = story ? storyStopIndexIn(stops.length, journey, zone, traceIndex) : null;
  if (storyIndex != null) stops.splice(storyIndex, 0, { kind: 'story', languageCode, journey, zone });
  if (letterStopFor(languageCode, journey, zone)) stops.splice(letterStopIndexIn(stops.length, journey, zone, traceIndex, storyIndex), 0, { kind: 'letter', languageCode, journey, zone });
  return stops;
}

export function sameJourneyStop(a: JourneyStopTarget, b: JourneyStopTarget): boolean {
  return a.kind === b.kind && a.languageCode === b.languageCode &&
    (a.kind === 'lesson' ? a.lessonGroupId === b.lessonGroupId : a.journey === b.journey && a.zone === b.zone);
}
export function nextUnownedStop(stops: readonly JourneyStopTarget[], owned: readonly JourneyStopTarget[]): JourneyStopTarget | undefined {
  return stops.find(s => !owned.some(o => sameJourneyStop(s, o)));
}
