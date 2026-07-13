import type { Badge } from '@workspace/api-client-react';

// A locked badge is "close" when the learner is at least this far toward it, so
// we can highlight the goals within realistic reach — mirrors the web gallery.
export const NEAR_THRESHOLD = 0.6;

// How far the learner is toward unlocking a badge, clamped to [0, 1].
export function progressRatio(badge: Badge): number {
  if (badge.progressTarget <= 0) return 0;
  return Math.min(1, badge.progressCurrent / badge.progressTarget);
}

// The still-locked badge the learner is closest to unlocking, or null when
// every badge is earned. Ties are broken by the smaller remaining count so the
// most concretely-within-reach goal wins. Mirrors the web findNearestLockedBadge.
export function findNearestLockedBadge(
  badges: Badge[] | undefined,
): Badge | null {
  if (!badges) return null;
  let best: Badge | null = null;
  let bestRatio = -1;
  for (const badge of badges) {
    if (badge.earned) continue;
    const ratio = progressRatio(badge);
    const remaining = badge.progressTarget - badge.progressCurrent;
    if (
      ratio > bestRatio ||
      (best !== null &&
        ratio === bestRatio &&
        remaining < best.progressTarget - best.progressCurrent)
    ) {
      best = badge;
      bestRatio = ratio;
    }
  }
  return best;
}
