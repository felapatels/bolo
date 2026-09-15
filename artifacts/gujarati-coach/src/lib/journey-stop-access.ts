import type { JourneyStopTarget } from '@workspace/api-client-react';
import type { ConvertedPlayKind } from '@workspace/script-trace';

/**
 * How the map plays a bought lesson stop, when it plays it as a game
 * (planStopPlay). It rides the upgrade link beside the target, never inside it:
 * JourneyStopTarget is the server's contract and a play kind is the map's.
 * Mobile twin: the `play` and `stop` params in journey.tsx and paywall.tsx.
 */
export type JourneyStopPlay = { play: ConvertedPlayKind; stop?: string };

export function ownsJourneyStop(stops: readonly JourneyStopTarget[] | undefined, target: JourneyStopTarget): boolean {
  return !!stops?.some(s => s.kind === target.kind && s.languageCode === target.languageCode &&
    (s.kind === 'lesson' ? s.lessonGroupId === target.lessonGroupId : s.journey === target.journey && s.zone === target.zone));
}

/** One target travels from the map through the existing upgrade screen. */
export function journeyStopUpgradeHref(target: JourneyStopTarget, play?: JourneyStopPlay): string {
  const params = new URLSearchParams({ reason: 'journey_stop', lang: target.languageCode, stopKind: target.kind, journey: String(target.journey), zone: String(target.zone) });
  if (target.lessonGroupId != null) params.set('lessonGroupId', String(target.lessonGroupId));
  if (play && target.kind === 'lesson') {
    params.set('play', play.play);
    if (play.stop) params.set('stop', play.stop);
  }
  return `/upgrade?${params}`;
}
/** The play kind on an upgrade link, or undefined for a stop played as itself. */
export function journeyStopPlayFromSearch(search: string): JourneyStopPlay | undefined {
  const p = new URLSearchParams(search);
  const play = p.get('play');
  if (play !== 'last_call' && play !== 'answer_back') return undefined;
  const stop = p.get('stop');
  return { play, ...(stop ? { stop } : {}) };
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
export function rememberJourneyStop(target: JourneyStopTarget, play?: JourneyStopPlay): void {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ search: journeyStopUpgradeHref(target, play).split('?')[1], expires: Date.now() + 60 * 60 * 1000 })); } catch { /* Storage can be unavailable in private browsing. */ }
}
export function takeJourneyStopReturn(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw); const target = journeyStopFromSearch(saved.search);
    // The play kind comes back too, or a stop bought after topping up opens in
    // practice while the map plays it as a game.
    return target && saved.expires > Date.now() ? journeyStopUpgradeHref(target, journeyStopPlayFromSearch(saved.search)) : null;
  } catch { return null; }
}
