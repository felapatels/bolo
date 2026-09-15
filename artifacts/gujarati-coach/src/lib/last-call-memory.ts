// LAST CALL'S BEST SCORE, KEPT IN THE BROWSER.
//
// Web twin of bolo-mobile lib/lastCallMemory.ts (Last Call slice 2,
// 2026-09-14). Owner brief: "N passengers aboard", best score kept locally,
// one key per language and lesson group. It is DISPLAY state only: gating,
// mastery and XP all come from the attempts the round records through the same
// path practice uses, so losing this key costs a learner a personal best and
// nothing else.
//
// SAME KEY STRING AS MOBILE, so the two read alike (the pattern
// last-played-game.ts set). Same read-modify-write, so a stale tab can never
// overwrite a higher best another tab wrote. SYNCHRONOUS where mobile is async,
// and that is the only difference: localStorage has no await, and wrapping it
// in a promise would only add a render where the end card has no best to show.

export const lastCallBestKey = (lang: string, lessonGroupId: number) =>
  `bolo.lastCallBest:${lang}:${lessonGroupId}`;

/** A stored value that is not a non-negative integer is treated as absent, never trusted. */
export function parseLastCallBest(raw: string | null): number | null {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export function loadLastCallBest(lang: string, lessonGroupId: number): number | null {
  try {
    return parseLastCallBest(localStorage.getItem(lastCallBestKey(lang, lessonGroupId)));
  } catch {
    // Private mode or blocked storage: no best, never a crash.
    return null;
  }
}

/**
 * Keep the higher of the stored best and this round's boarded count. Returns
 * the best after the write and whether this round set it. Best-effort: a
 * storage failure still answers from what was read, so the end card can draw.
 */
export function saveLastCallBest(
  lang: string,
  lessonGroupId: number,
  aboard: number,
): { best: number; isNewBest: boolean } {
  const key = lastCallBestKey(lang, lessonGroupId);
  let stored: number | null = null;
  try {
    stored = parseLastCallBest(localStorage.getItem(key));
  } catch {
    stored = null;
  }
  const isNewBest = aboard > 0 && (stored === null || aboard > stored);
  const best = Math.max(stored ?? 0, aboard);
  if (isNewBest) {
    try {
      localStorage.setItem(key, String(best));
    } catch {
      // Best-effort, as above.
    }
  }
  return { best, isNewBest };
}
