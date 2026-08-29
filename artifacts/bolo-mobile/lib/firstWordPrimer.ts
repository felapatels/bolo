import AsyncStorage from '@react-native-async-storage/async-storage';

// THE FIRST-WORD LIGHTBOX, build 19. Owner, 2026-08-29: "I wanna add a light
// box triggered after any user's first word completion right before they see
// their score. I want to say great job trying your first word, scoring will
// get more accurate as you progress. As you learn more Bolo learns more and
// is able to score you more accurately." And: "Make sure it doesn't interfere
// with the first badge celebration."
//
// WHEN. Once, on the first scored attempt. "First" is judged two ways and
// both must agree: this device has not shown it (AsyncStorage), and the
// language's progress summary, when the cache holds one, reports zero
// attempts. A learner who already practised on another phone has a count
// there and is not told this is their first word; a learner whose summary
// has not loaded yet is judged by the device alone, which errs towards
// showing it once rather than never.
//
// ORDER. The practice screen holds the score reveal AND any badge the
// attempt unlocked behind the lightbox, then releases both together when it
// is dismissed: score card first, badge celebration over it, exactly the
// stacking a second attempt gets today. The lightbox never sits on top of
// the badge and the badge never sits on top of the lightbox.
//
// Web twin: artifacts/gujarati-coach/src/lib/first-word-primer.ts.

export const FIRST_WORD_PRIMER_KEY = 'bolo.firstWordPrimerSeen';

export const FIRST_WORD_PRIMER_COPY = {
  title: 'Your first word!',
  body: 'Great job trying your first word. Scoring gets more accurate as you go: as you learn more, Bolo learns more about how you sound, and can score you more accurately.',
  cta: 'Show me my score',
} as const;

export async function loadFirstWordPrimerSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FIRST_WORD_PRIMER_KEY)) === 'yes';
  } catch {
    // Unreadable storage reads as "seen": a learner who cannot be tracked
    // gets no lightbox rather than one on every attempt.
    return true;
  }
}

export async function saveFirstWordPrimerSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_WORD_PRIMER_KEY, 'yes');
  } catch {
    // Best-effort; the in-session hold still applies.
  }
}

/**
 * The decision, pure. `totalAttempts` is the language's count from the
 * progress summary, or undefined when the cache has none.
 */
export function shouldShowFirstWordPrimer(input: {
  seenOnDevice: boolean;
  totalAttempts: number | undefined;
}): boolean {
  if (input.seenOnDevice) return false;
  if (input.totalAttempts !== undefined && input.totalAttempts > 0) return false;
  return true;
}
