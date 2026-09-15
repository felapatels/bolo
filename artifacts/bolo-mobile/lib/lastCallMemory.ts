// LAST CALL'S BEST SCORE, KEPT ON THE DEVICE.
//
// Owner brief, 2026-09-14 (slice 1): "N passengers aboard", best score kept on
// device, one key per language and lesson group. It is DISPLAY state only:
// gating, mastery and XP all come from the attempts the round records through
// the same path practice uses, so losing this key costs a learner a personal
// best and nothing else.
//
// Shape follows closeoutMemory.ts in the two ways that matter for a tiny value:
// a namespaced per-language key, and read-modify-write rather than a blind
// write, so a slower earlier save can never overwrite a higher best. It skips
// closeoutMemory's hydrated render cache because nothing reads this during
// render on a path that cannot wait one AsyncStorage read.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const lastCallBestKey = (lang: string, lessonGroupId: number) =>
  `bolo.lastCallBest:${lang}:${lessonGroupId}`;

/** A stored value that is not a non-negative integer is treated as absent, never trusted. */
export function parseLastCallBest(raw: string | null): number | null {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export async function loadLastCallBest(lang: string, lessonGroupId: number): Promise<number | null> {
  try {
    return parseLastCallBest(await AsyncStorage.getItem(lastCallBestKey(lang, lessonGroupId)));
  } catch {
    return null;
  }
}

/**
 * Keep the higher of the stored best and this round's boarded count. Returns
 * the best after the write and whether this round set it. Best-effort: a
 * storage failure still answers from what was read, so the end card can draw.
 */
export async function saveLastCallBest(
  lang: string,
  lessonGroupId: number,
  aboard: number,
): Promise<{ best: number; isNewBest: boolean }> {
  const key = lastCallBestKey(lang, lessonGroupId);
  let stored: number | null = null;
  try {
    stored = parseLastCallBest(await AsyncStorage.getItem(key));
  } catch {
    stored = null;
  }
  const isNewBest = aboard > 0 && (stored === null || aboard > stored);
  const best = Math.max(stored ?? 0, aboard);
  if (isNewBest) {
    try {
      await AsyncStorage.setItem(key, String(best));
    } catch {
      // Best-effort, as above.
    }
  }
  return { best, isNewBest };
}
