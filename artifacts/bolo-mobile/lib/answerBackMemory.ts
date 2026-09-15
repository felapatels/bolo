// ANSWER BACK'S BEST STARS, KEPT ON THE DEVICE.
//
// Owner brief, 2026-09-14: a star for a perfect run, best stars kept on
// device. The twin of lastCallMemory.ts in every way that matters (a namespaced
// per-language, per-group key; read-modify-write so a slower earlier save can
// never lower a best), and for the same reason it is DISPLAY state only:
// gating, mastery and XP come from the attempts the round records through the
// practice path, so losing this key costs a learner a star and nothing else.
//
// Web twin: gujarati-coach src/lib/answer-back-memory.ts, same key string.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseLastCallBest } from '@/lib/lastCallMemory';

export const answerBackBestKey = (lang: string, lessonGroupId: number) =>
  `bolo.answerBackStars:${lang}:${lessonGroupId}`;

/**
 * Keep the higher of the stored stars and this round's. Returns the best after
 * the write and whether this round set it. Best-effort: a storage failure
 * still answers from what was read, so the end card can draw.
 */
export async function saveAnswerBackStars(
  lang: string,
  lessonGroupId: number,
  stars: number,
): Promise<{ best: number; isNewBest: boolean }> {
  const key = answerBackBestKey(lang, lessonGroupId);
  let stored: number | null = null;
  try {
    // Same non-negative-integer parse Last Call trusts; a second copy of it
    // would be the second definition CLAUDE.md warns about.
    stored = parseLastCallBest(await AsyncStorage.getItem(key));
  } catch {
    stored = null;
  }
  const isNewBest = stars > 0 && (stored === null || stars > stored);
  const best = Math.max(stored ?? 0, stars);
  if (isNewBest) {
    try {
      await AsyncStorage.setItem(key, String(best));
    } catch {
      // Best-effort, as above.
    }
  }
  return { best, isNewBest };
}
