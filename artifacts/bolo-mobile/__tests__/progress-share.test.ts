import { progressShareMessage } from '../lib/progressShare';

/**
 * The Progress share line (build 26, the owner's option A).
 *
 * ITS TWIN IS PINNED IDENTICALLY on web, in
 * gujarati-coach/src/test/progress-share.test.ts. The two builders are
 * hand-maintained copies, so the expectations are written out in full in both
 * files rather than shared: if one drifts, the other file fails and says so.
 */
describe('progressShareMessage', () => {
  it('leads with the mastered count and the language', () => {
    expect(
      progressShareMessage({
        languageName: 'Hindi',
        phrasesMastered: 47,
        streakDays: 0,
      }),
    ).toBe("I've mastered 47 Hindi phrases on Bolo! 🦜 #BoloLanguage");
  });

  it('says phrase, not phrases, for exactly one', () => {
    expect(
      progressShareMessage({
        languageName: 'Tamil',
        phrasesMastered: 1,
        streakDays: 0,
      }),
    ).toBe("I've mastered 1 Tamil phrase on Bolo! 🦜 #BoloLanguage");
  });

  it('adds the streak from two days up, after the hashtag as the quiz does', () => {
    expect(
      progressShareMessage({
        languageName: 'Hindi',
        phrasesMastered: 47,
        streakDays: 12,
      }),
    ).toBe("I've mastered 47 Hindi phrases on Bolo! 🦜 #BoloLanguage 🔥 12-day streak!");
  });

  // A single day is not a streak, it is a day. Same threshold bolo-quiz uses.
  it('says nothing about a one day streak', () => {
    expect(
      progressShareMessage({
        languageName: 'Hindi',
        phrasesMastered: 3,
        streakDays: 1,
      }),
    ).toBe("I've mastered 3 Hindi phrases on Bolo! 🦜 #BoloLanguage");
  });

  // The button is on the screen from the first launch, so day one has a line.
  it('never posts a zero, it posts an honest start', () => {
    expect(
      progressShareMessage({
        languageName: 'Bengali',
        phrasesMastered: 0,
        streakDays: 0,
      }),
    ).toBe("I'm learning Bengali on Bolo! 🦜 #BoloLanguage");
  });

  it('still reads as a sentence before the language has loaded', () => {
    expect(
      progressShareMessage({
        languageName: null,
        phrasesMastered: 0,
        streakDays: 4,
      }),
    ).toBe("I'm learning a new language on Bolo! 🦜 #BoloLanguage 🔥 4-day streak!");
  });
});
