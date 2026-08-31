/**
 * What a learner posts from the Progress screen.
 *
 * ONE LINE, IN THE QUIZ'S VOICE. The Bolo Quiz has shared a plain text line
 * through the OS sheet since long before this ("I scored 5/5 on today's Bolo
 * Quiz! 🦜 #BoloLanguage 🔥 12-day streak!", games/bolo-quiz.tsx), and a
 * second dialect of Bolo's share copy would read as a different app. Same
 * bird, same hashtag, same place for the streak.
 *
 * THE STREAK IS ONLY WORTH SAYING FROM TWO DAYS UP, the threshold the quiz
 * already uses: a one day streak is not a streak, it is a day.
 *
 * A LEARNER WITH NOTHING YET STILL GETS A LINE. The button is on the screen
 * from the first launch, and "I've mastered 0 phrases" is worse than saying
 * nothing about the count at all.
 *
 * TWIN: artifacts/gujarati-coach/src/lib/progress-share.ts. Web and mobile
 * are hand-maintained twins here, so change both or neither.
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
  const language = languageName?.trim() || 'a new language';
  const body =
    phrasesMastered > 0
      ? `I've mastered ${phrasesMastered} ${language} ${
          phrasesMastered === 1 ? 'phrase' : 'phrases'
        } on Bolo!`
      : `I'm learning ${language} on Bolo!`;
  const streak = streakDays >= 2 ? ` 🔥 ${streakDays}-day streak!` : '';
  return `${body} 🦜 #BoloLanguage${streak}`;
}
