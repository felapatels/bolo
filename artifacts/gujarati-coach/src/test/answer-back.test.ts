// ANSWER BACK'S CONTENT: the pair table, the resolver and the card detector.
//
// Owner brief, 2026-09-14: exchanges come ONLY from the stop's own lesson group,
// resolved by English gloss, and a group with fewer than three plays as Last
// Call. @workspace/script-trace answer-back.ts is the one implementation; these
// pins are its rules plus real Hindi zone 1 glosses, so an edit to the table
// that quietly empties India's first stop fails here first.
//
// Twin of bolo-mobile __tests__/answer-back.test.ts, case for case.
//
// Written 2026-09-14 and NOT YET RUN (typecheck only while developing, per
// CLAUDE.md). Runs with the full web suite before the next publish.
import { describe, it, expect } from 'vitest';
import {
  ANSWER_BACK_MIN_EXCHANGES,
  ANSWER_BACK_PAIRS,
  ANSWER_BACK_ROUND_SIZE,
  answerBackExchangesFor,
  answerBackTakeOutcome,
  canPlayAnswerBack,
  detectChosenCard,
  glossReading,
  pickAnswerBackRound,
  promptConceptsOf,
  replyConceptsOf,
  similarityRatio,
  normaliseLatinForMatch,
  type AnswerBackPhrase,
} from '@workspace/script-trace';

let nextId = 1;
const ph = (nativeScript: string, romanized: string, english: string): AnswerBackPhrase => ({
  id: nextId++,
  nativeScript,
  romanized,
  english,
});

// India, Hindi, greetings, curated phrases 0 to 9 and 30 to 39: the first and
// last phrase-stage stops of journey 1 zone 1, as lib/db seeds them
// (curatedLessons.json, partitioned in tens by backfillLessonGroups.ts).
const HINDI_STOP_1 = [
  ph('नमस्ते', 'namaste', 'Hello'),
  ph('धन्यवाद', 'dhanyavaad', 'Thank you'),
  ph('माफ़ कीजिए', 'maaf kijiye', 'Excuse me / Sorry'),
  ph('कृपया', 'kripya', 'Please'),
  ph('सुप्रभात', 'suprabhaat', 'Good morning'),
  ph('शुभ रात्रि', 'shubh raatri', 'Good night'),
  ph('कैसे हैं?', 'kaise hain?', 'How are you?'),
  ph('आपका स्वागत है', 'aapka swagat hai', 'You’re welcome'),
  ph('शुभ संध्या', 'shubh sandhya', 'Good evening'),
  ph('फिर मिलेंगे', 'phir milenge', 'See you again'),
];
const HINDI_STOP_4 = [
  ph('सावधान', 'saavdhaan', 'Be careful'),
  ph('ध्यान दो', 'dhyaan do', 'Pay attention'),
  ph('शाबाश', 'shaabaash', 'Well done'),
  ph('बधाई', 'badhaai', 'Congratulations'),
  ph('स्वस्थ रहो', 'swasth raho', 'Stay healthy'),
  ph('आराम से', 'aaraam se', 'Take it easy / Slowly'),
  ph('फिक्र मत करो', 'fikr mat karo', "Don't worry"),
  ph('जाइए', 'jaaiye', 'Please go'),
  ph('रुको', 'ruko', 'Stop / Wait'),
  ph('शुक्रिया', 'shukriya', 'Thanks'),
];

const byEnglish = (list: AnswerBackPhrase[], english: string) => list.find((p) => p.english === english)!;

describe('reading a gloss', () => {
  it('drops parentheticals, splits spaced slashes and semicolons, keeps sir/ma\'am whole', () => {
    expect(glossReading('How are you? (polite)').map((a) => a.clauses)).toEqual([['how are you']]);
    expect(glossReading('Excuse me / Sorry').map((a) => a.clauses)).toEqual([['excuse me'], ['sorry']]);
    expect(glossReading('hello; greetings').map((a) => a.clauses)).toEqual([['hello'], ['greetings']]);
    expect(glossReading("Thank you, sir/ma'am").map((a) => a.clauses)).toEqual([['thank you']]);
  });

  it('straightens a curly apostrophe, so the library\'s two spellings of you\'re welcome agree', () => {
    expect(replyConceptsOf('You’re welcome').has('youre_welcome')).toBe(true);
    expect(replyConceptsOf("you're welcome").has('youre_welcome')).toBe(true);
  });

  it('reads a keeper\'s line by its LAST clause, and a line that answers itself as no prompt', () => {
    expect(promptConceptsOf('Hello, how are you?').has('how_are_you')).toBe(true);
    expect(promptConceptsOf('How are you? I am fine.').has('how_are_you')).toBe(false);
  });

  it('refuses a sentence that glues a formula to a story, in either role', () => {
    expect(replyConceptsOf('Thank you, you called me.').size).toBe(0);
    expect(promptConceptsOf('Hello, I am going to school.').size).toBe(0);
  });

  it('lets a reply carry a question after its answer', () => {
    expect(replyConceptsOf('I am fine, and how are you?').has('i_am_fine')).toBe(true);
  });

  it('reads a name as a prefix', () => {
    expect(replyConceptsOf('My name is Raj.').has('my_name_is')).toBe(true);
    expect(replyConceptsOf('My name is ...').has('my_name_is')).toBe(true);
  });

  it('never reads "excuse me" alone as a call for attention: it sits beside "sorry" in this library', () => {
    expect(promptConceptsOf('Sorry / Excuse me').has('attention')).toBe(false);
  });
});

describe('the pair table', () => {
  it('names only concepts that exist, and every pair has a reply', () => {
    for (const pair of ANSWER_BACK_PAIRS) {
      expect(pair.replies.length).toBeGreaterThan(0);
    }
    expect(ANSWER_BACK_PAIRS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('answerBackExchangesFor, real Hindi stops', () => {
  it('Hindi stop 1: thank you is answered with you\'re welcome, and the greetings are said back', () => {
    const ex = answerBackExchangesFor(HINDI_STOP_1);
    const thanks = ex.find((e) => e.promptPhrase.english === 'Thank you')!;
    expect(thanks.replyPhrase.english).toBe('You’re welcome');
    expect(thanks.echo).toBe(false);
    const morning = ex.find((e) => e.promptPhrase.english === 'Good morning')!;
    expect(morning.echo).toBe(true);
    // "How are you?" has no "I am fine" in this group, so it is not an exchange.
    expect(ex.some((e) => e.promptPhrase.english === 'How are you?')).toBe(false);
    expect(ex).toHaveLength(6);
    expect(canPlayAnswerBack(HINDI_STOP_1)).toBe(true);
  });

  it('never offers another greeting as the WRONG answer to a greeting', () => {
    const morning = answerBackExchangesFor(HINDI_STOP_1).find((e) => e.promptPhrase.english === 'Good morning')!;
    const wrong = morning.distractors.map((d) => d.english);
    expect(wrong).not.toContain('Hello');
    expect(wrong).not.toContain('Good evening');
  });

  it('Hindi stop 4: three well-wishes, each answered with thanks', () => {
    const ex = answerBackExchangesFor(HINDI_STOP_4);
    expect(ex.map((e) => [e.promptPhrase.english, e.replyPhrase.english])).toEqual([
      ['Well done', 'Thanks'],
      ['Congratulations', 'Thanks'],
      ['Stay healthy', 'Thanks'],
    ]);
    expect(ex).toHaveLength(ANSWER_BACK_MIN_EXCHANGES);
  });

  it('Hindi stop 6 as production served it: "Come again" is never answered with "See you later"', () => {
    // Lesson group 122, read off the live round in the simulator 2026-09-14. The
    // keeper said "फिर आना" and the old table marked "फिर मिलते हैं" right; the
    // owner, a speaker: "the answer is not any of these". That was the stop's only
    // non-echo exchange, so without it the stop plays as Last Call (ledger X103).
    // The last gloss is verbatim as served, Hindi word and all (ledger X104).
    const stop6 = [
      ph('फिर मिलते हैं', 'phir milte hain', 'See you later'),
      ph('सुनिए', 'suniye', 'Listen / Excuse me'),
      ph('प्रणाम', 'pranaam', 'Respectful greeting'),
      ph('फिर आना', 'phir aana', 'Come again'),
      ph('सुनो', 'suno', 'Listen'),
      ph('आओ', 'aao', 'Come'),
      ph('बैठिए', 'baithiye', 'Please sit'),
      ph('बैठो', 'baitho', 'Sit'),
      ph('खेलिए', 'kheliye', 'Please play'),
      ph('जल्दी आओ', 'jaldi aao', 'Come जल्दी / Come soon'),
    ];
    const ex = answerBackExchangesFor(stop6);
    expect(ex.some((e) => e.promptPhrase.english === 'Come again')).toBe(false);
    expect(ex.every((e) => e.echo)).toBe(true);
    expect(canPlayAnswerBack(stop6)).toBe(false);
  });

  it('holds its own rules on every exchange: a right reply, two wrong ones, all from the group', () => {
    for (const group of [HINDI_STOP_1, HINDI_STOP_4]) {
      const ids = new Set(group.map((p) => p.id));
      for (const e of answerBackExchangesFor(group)) {
        const cards = [e.replyPhrase, ...e.distractors];
        expect(new Set(cards.map((c) => c.id)).size).toBe(3);
        for (const c of [e.promptPhrase, ...cards]) expect(ids.has(c.id)).toBe(true);
        // A wrong card never carries any concept the prompt's pairs accept.
        const promptConcepts = promptConceptsOf(e.promptPhrase.english);
        const accepted = new Set(
          ANSWER_BACK_PAIRS.filter((pair) => promptConcepts.has(pair.prompt)).flatMap((pair) => [...pair.replies]),
        );
        for (const d of e.distractors) {
          expect(d.id).not.toBe(e.promptPhrase.id);
          expect([...replyConceptsOf(d.english)].filter((c) => accepted.has(c))).toEqual([]);
        }
      }
    }
  });

  it('never puts two cards a transcript could not tell apart on one screen', () => {
    const group = [
      ph('धन्यवाद', 'dhanyavaad', 'Thank you'),
      ph('आपका स्वागत है', 'aapka swagat hai', 'You are welcome'),
      ph('आपका स्वागत हैं', 'aapka swagat hain', 'Hello'),
      ph('अलविदा', 'alvida', 'Goodbye'),
      ph('कृपया', 'kripya', 'Please'),
    ];
    const thanks = answerBackExchangesFor(group).find((e) => e.promptPhrase.english === 'Thank you')!;
    expect(thanks.distractors.map((d) => d.english)).not.toContain('Hello');
  });

  it('builds nothing from a group with no conversational pairs, which then plays as Last Call', () => {
    const numbers = [ph('एक', 'ek', 'one'), ph('दो', 'do', 'two'), ph('तीन', 'teen', 'three'), ph('चार', 'chaar', 'four')];
    expect(answerBackExchangesFor(numbers)).toEqual([]);
    expect(canPlayAnswerBack(numbers)).toBe(false);
  });

  it('skips an exchange that cannot find two wrong cards', () => {
    expect(answerBackExchangesFor([ph('धन्यवाद', 'dhanyavaad', 'Thank you'), ph('आपका स्वागत है', 'aapka swagat hai', "You're welcome")])).toEqual([]);
  });
});

describe('pickAnswerBackRound', () => {
  it('takes at most five, every non-echo exchange before any echo', () => {
    const round = pickAnswerBackRound(answerBackExchangesFor(HINDI_STOP_1));
    expect(round.length).toBeLessThanOrEqual(ANSWER_BACK_ROUND_SIZE);
    expect(round[0]!.echo).toBe(false);
    const firstEcho = round.findIndex((e) => e.echo);
    expect(round.slice(firstEcho).every((e) => e.echo)).toBe(true);
  });
});

describe('which card was spoken', () => {
  const cards = [
    byEnglish(HINDI_STOP_1, 'You’re welcome'),
    byEnglish(HINDI_STOP_1, 'Hello'),
    byEnglish(HINDI_STOP_1, 'Excuse me / Sorry'),
  ];

  it('picks the card the native transcript matches', () => {
    expect(detectChosenCard({ transcript: 'नमस्ते', transcriptRomanized: 'namaste' }, cards).chosen?.english).toBe('Hello');
    expect(detectChosenCard({ transcript: 'आपका स्वागत है', transcriptRomanized: '' }, cards).chosen?.english).toBe(
      'You’re welcome',
    );
  });

  it('matches on romanisation alone when the script has none (a Latin transcript is its own)', () => {
    expect(detectChosenCard({ transcript: 'maaf kijiye', transcriptRomanized: '' }, cards).chosen?.english).toBe(
      'Excuse me / Sorry',
    );
  });

  it('chooses nothing from an empty or unrelated transcript', () => {
    expect(detectChosenCard({ transcript: '', transcriptRomanized: '' }, cards).chosen).toBeNull();
    expect(detectChosenCard({ transcript: 'xyzzy plugh', transcriptRomanized: 'xyzzy plugh' }, cards).chosen).toBeNull();
  });

  it('uses the server\'s romanisation folds', () => {
    expect(normaliseLatinForMatch('kem chho')).toBe(normaliseLatinForMatch('kem cho'));
    expect(similarityRatio('abc', 'abc')).toBe(1);
    expect(similarityRatio('', 'abc')).toBe(0);
  });
});

describe('answerBackTakeOutcome', () => {
  it('nocatch is always a re-ask', () => {
    expect(answerBackTakeOutcome({ band: 'nocatch', chosenId: 2, rightId: 1 })).toBe('nocatch');
  });
  it('a clearly different card is wrong even on a passing band', () => {
    expect(answerBackTakeOutcome({ band: 'pass', chosenId: 2, rightId: 1 })).toBe('wrong_card');
    expect(answerBackTakeOutcome({ band: 'fail', chosenId: 2, rightId: 1 })).toBe('wrong_card');
  });
  it('the right card, or no clear card, goes by the band', () => {
    expect(answerBackTakeOutcome({ band: 'pass', chosenId: 1, rightId: 1 })).toBe('pass');
    expect(answerBackTakeOutcome({ band: 'fail', chosenId: 1, rightId: 1 })).toBe('fail');
    expect(answerBackTakeOutcome({ band: 'pass', chosenId: null, rightId: 1 })).toBe('pass');
    expect(answerBackTakeOutcome({ band: 'fail', chosenId: null, rightId: 1 })).toBe('fail');
  });
});
