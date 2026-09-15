// ANSWER BACK'S BEST STARS, KEPT IN THE BROWSER.
//
// Web twin of bolo-mobile lib/answerBackMemory.ts (2026-09-14). Owner brief: a
// star for a perfect run, best stars kept locally, one key per language and
// lesson group. DISPLAY state only, as Last Call's best is: gating, mastery and
// XP come from the attempts the round records through the practice path.
//
// SAME KEY STRING AS MOBILE, and the same synchronous read-modify-write
// last-call-memory.ts uses, for the reasons written there.

import { parseLastCallBest } from "@/lib/last-call-memory";

export const answerBackBestKey = (lang: string, lessonGroupId: number) =>
  `bolo.answerBackStars:${lang}:${lessonGroupId}`;

/** Keep the higher of the stored stars and this round's. Best-effort, never throws. */
export function saveAnswerBackStars(
  lang: string,
  lessonGroupId: number,
  stars: number,
): { best: number; isNewBest: boolean } {
  const key = answerBackBestKey(lang, lessonGroupId);
  let stored: number | null = null;
  try {
    // Last Call's non-negative-integer parse, reused rather than restated.
    stored = parseLastCallBest(localStorage.getItem(key));
  } catch {
    stored = null;
  }
  const isNewBest = stars > 0 && (stored === null || stars > stored);
  const best = Math.max(stored ?? 0, stars);
  if (isNewBest) {
    try {
      localStorage.setItem(key, String(best));
    } catch {
      // Private mode or blocked storage: the end card still draws.
    }
  }
  return { best, isNewBest };
}
