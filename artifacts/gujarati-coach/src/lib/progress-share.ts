// The ONE web share invocation for a learner's progress (build 26, the
// owner's option A: share the stats, not a badge).
//
// Shaped after lib/referral-share.ts, which is the house pattern for a web
// share: navigator.share where it exists, and a caller-supplied fallback
// everywhere it does not (desktop Firefox, older Chrome), because the
// consolation belongs to whichever surface is asking.

/**
 * What a learner posts from the Progress screen.
 *
 * ONE LINE, IN THE QUIZ'S VOICE. The Bolo Quiz has shared a plain text line
 * through the share sheet since long before this ("I scored 5/5 on today's
 * Bolo Quiz! 🦜 #BoloLanguage 🔥 12-day streak!"), and a second dialect of
 * Bolo's share copy would read as a different app. Same bird, same hashtag,
 * same place for the streak.
 *
 * THE STREAK IS ONLY WORTH SAYING FROM TWO DAYS UP, the threshold the quiz
 * already uses: a one day streak is not a streak, it is a day.
 *
 * A LEARNER WITH NOTHING YET STILL GETS A LINE. The button is on the screen
 * from the first visit, and "I've mastered 0 phrases" is worse than saying
 * nothing about the count at all.
 *
 * TWIN: artifacts/bolo-mobile/lib/progressShare.ts. Web and mobile are
 * hand-maintained twins here, so change both or neither.
 */
export function progressShareMessage({
  languageName,
  phrasesMastered,
  streakDays,
}: {
  languageName?: string | null;
  phrasesMastered: number;
  streakDays: number;
}): string {
  const language = languageName?.trim() || "a new language";
  const body =
    phrasesMastered > 0
      ? `I've mastered ${phrasesMastered} ${language} ${
          phrasesMastered === 1 ? "phrase" : "phrases"
        } on Bolo!`
      : `I'm learning ${language} on Bolo!`;
  const streak = streakDays >= 2 ? ` 🔥 ${streakDays}-day streak!` : "";
  return `${body} 🦜 #BoloLanguage${streak}`;
}

/** Copies the line. Resolves false when the clipboard is unavailable. */
export async function copyProgressMessage(message: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the browser's share sheet with the progress line.
 *
 * @param fallback Runs instead when the browser has no share sheet at all.
 */
export async function shareProgress(
  message: string,
  fallback?: () => void | Promise<void>,
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.share) {
    await fallback?.();
    return;
  }
  try {
    await navigator.share({ text: message });
  } catch {
    // A dismissed share sheet is not an error.
  }
}
