import type { JourneyStopTarget } from '@workspace/api-client-react';

export function ownsJourneyStop(stops: readonly JourneyStopTarget[] | undefined, target: JourneyStopTarget): boolean {
  return !!stops?.some(s => s.kind === target.kind && s.languageCode === target.languageCode &&
    (s.kind === 'lesson' ? s.lessonGroupId === target.lessonGroupId : s.journey === target.journey && s.zone === target.zone));
}

/** One target travels from the map through the existing upgrade screen. */
export function journeyStopUpgradeHref(target: JourneyStopTarget): string {
  const params = new URLSearchParams({ reason: 'journey_stop', lang: target.languageCode, stopKind: target.kind, journey: String(target.journey), zone: String(target.zone) });
  if (target.lessonGroupId != null) params.set('lessonGroupId', String(target.lessonGroupId));
  return `/upgrade?${params}`;
}
export function journeyStopFromSearch(search: string): JourneyStopTarget | null {
  const p = new URLSearchParams(search);
  const kind = p.get('stopKind'); const languageCode = p.get('lang');
  const journey = Number(p.get('journey')); const zone = Number(p.get('zone')); const lessonGroupId = Number(p.get('lessonGroupId'));
  if (!languageCode || !['lesson', 'story', 'trace', 'letter'].includes(kind ?? '') || ![1, 2].includes(journey) || !Number.isInteger(zone) || zone < 1 || zone > 6 || (kind === 'lesson' && (!Number.isInteger(lessonGroupId) || lessonGroupId < 1))) return null;
  return { kind: kind as JourneyStopTarget['kind'], languageCode, journey, zone, ...(kind === 'lesson' ? { lessonGroupId } : {}) };
}

// Checkout returns home. Keep a scoped, expiring link back to this stop.
const RETURN_KEY = 'bolo:journey-stop-purchase-return';
export function rememberJourneyStop(target: JourneyStopTarget): void {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ search: journeyStopUpgradeHref(target).split('?')[1], expires: Date.now() + 60 * 60 * 1000 })); } catch { /* Storage can be unavailable in private browsing. */ }
}
export function takeJourneyStopReturn(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw); const target = journeyStopFromSearch(saved.search);
    return target && saved.expires > Date.now() ? journeyStopUpgradeHref(target) : null;
  } catch { return null; }
}
