// ANSWER BACK, THE CONTENT: which lines the keeper says, and which reply answers them.
//
// Owner brief, 2026-09-14: Answer Back shares Last Call's converted slots
// (stop-play.ts). At the elder's stall the keeper SAYS a line, three reply cards
// are shown, and the learner speaks one. Exchanges must be built ONLY from
// phrases already in the stop's lesson group, so every clip is one the
// synthesize cache already holds and nothing new is generated or spoken.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE PAIR TABLE BELOW WAS AUTHORED BY AN AGENT FROM EXISTING GLOSSES, AND IT
// IS UNREVIEWED BY A SPEAKER, like the rest of the library. It was written by
// reading the English glosses of India's journey 1 zone 1 (Greetings &
// Manners) in lib/db src/data/curatedLessons.json, curatedSentencesC1Rollout.json,
// curatedSentencesC1.json and seedData.ts GUJARATI_LESSONS, and pairing only
// exchanges a person would actually have. Nothing here says whether a given
// language's reply is the idiomatic one; it says the ENGLISH meanings fit.
// ═══════════════════════════════════════════════════════════════════════════
//
// THE BRIEF ASSUMED ONE SHARED ENGLISH SKELETON ACROSS ALL 22 LANGUAGES. THE
// DATA DOES NOT HAVE ONE. Read 2026-09-14: phrase 0 of greetings is "hello" in
// 17 languages and "are you well?" in another; by phrase 9 the most common
// gloss is shared by two languages; the sentence rollout's glosses agree across
// languages mostly on the first one. So this does not key on position or on one
// gloss per slot. It keys on CONCEPTS: each concept is a small set of gloss
// forms seen in the library ("thank you", "thanks", "many thanks", ...), and a
// pair joins a prompt concept to the concepts that answer it. That is still
// "define the pairs once by English gloss, resolve per language", just with
// the aliases the real glosses need.
//
// HOW A GLOSS IS READ (glossReading):
//  1. lowercased, curly apostrophes straightened, parentheticals dropped
//     ("How are you? (polite)" reads as "how are you?");
//  2. split into ALTERNATIVES on a spaced slash or a semicolon, which is how
//     the library writes two meanings ("Excuse me / Sorry", "hello; greetings").
//     An unspaced slash is one meaning ("sir/ma'am") and is left alone;
//  3. each alternative split into CLAUSES on , . ! ?, with a bare form of
//     address ("sir", "friend", "uncle") dropped, so "How are you, sir?" is
//     one clause; an alternative addressed to the keeper's own title
//     (KEEPER_OWN_TITLES) is never a PROMPT, though it may still be a reply;
//  4. a PROMPT concept must match an alternative's LAST clause, because the
//     line a keeper ends on is the line you answer ("Hello, how are you?" is a
//     how-are-you, "How are you? I am fine." answers itself and is no prompt);
//  5. a REPLY concept may match any clause of an alternative with no question
//     in it, or the FIRST clause of one that has ("I am fine, and how are
//     you?" is a fine reply);
//  6. either role also matches the whole alternative with its clauses joined,
//     which is how a handful of full sentences are aliased on purpose
//     ("sorry i came late").
//
// Pinned by bolo-mobile __tests__/answer-back.test.ts and gujarati-coach
// src/test/answer-back.test.ts. Import-free, for the reason on stop-play.ts.

/** The fields of a served Phrase this module reads. The generated Phrase satisfies it. */
export interface AnswerBackPhrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
}

export interface AnswerBackExchange<P extends AnswerBackPhrase = AnswerBackPhrase> {
  /** What the keeper says. Audio only on screen. */
  promptPhrase: P;
  /** The one card that answers it. Scored through the attempts path as this phrase. */
  replyPhrase: P;
  /** Two cards that do NOT answer it, from the same group. */
  distractors: [P, P];
  /** True when the reply is the prompt said back ("Good morning" to "Good morning"). */
  echo: boolean;
}

/** An exchange count below this and the stop plays as Last Call instead (owner ruling). */
export const ANSWER_BACK_MIN_EXCHANGES = 3;
/** A round is up to this many exchanges (owner brief). */
export const ANSWER_BACK_ROUND_SIZE = 5;

// ── The concepts ────────────────────────────────────────────────────────────
// Each alias is written already normalised (see normaliseClause). A trailing
// "*" makes it a prefix, used only where the library's glosses carry a name
// ("my name is raj", "my name is ...").

const CONCEPTS = {
  hello: ['hello', 'hi', 'hey there', 'hello there', 'greetings', 'greeting', 'respectful greeting', 'a respectful greeting', 'respectful greetings', 'respectful hello', 'i greet you', 'hello to you', 'salutation'],
  how_are_you: ['how are you', 'how are you all', 'how are you doing', 'how are you today', 'how are things', 'how are things today', 'how is it going', "how's it going", "what's up", 'what is up', "what's going on", 'and how are you', 'and you', 'how about you'],
  are_you_well: ['are you well', 'are you all well', 'are you fine', 'are you okay', 'are you quite well'],
  i_am_fine: ['i am fine', "i'm fine", 'i am well', 'i am okay', 'i am doing well', "i'm doing well", 'i am fine too', 'all is well', 'everything is fine', 'everything is well', 'i am fine here', 'i am fine today', 'yes i am fine'],
  thank_you: ['thank you', 'thanks', 'thank you very much', 'many thanks', 'thank you all', 'thank you to you', 'thanks to you', 'i thank you', 'i am grateful'],
  youre_welcome: ["you're welcome", 'you are welcome', 'you are most welcome', "you're always welcome", 'very welcome', 'with pleasure', 'no problem', "it's nothing"],
  sorry: ['sorry', 'i am sorry', 'forgive me', 'please forgive me', 'pardon me', 'i beg your pardon', 'sorry i came late', 'sorry i am late', 'sorry i got late', 'sorry i was late'],
  no_problem: ['no problem', "it's okay", 'it is okay', "it's fine", 'it is fine', "don't worry", "it's nothing", 'never mind'],
  what_is_your_name: ['what is your name', "what's your name", "how's your name"],
  my_name_is: ['my name is*'],
  nice_to_meet_you: ['nice to meet you', 'glad to meet you', 'pleasure', 'nice to see you', 'it was a real pleasure to meet you'],
  good_morning: ['good morning', 'good morning to you'],
  good_afternoon: ['good afternoon'],
  good_evening: ['good evening'],
  good_night: ['good night'],
  good_day: ['good day'],
  goodbye: ['goodbye', 'good bye', 'bye', 'bye-bye', 'farewell', 'goodbye polite'],
  see_you_again: ['see you again', 'see you later', 'see you soon', 'see you tomorrow', "let's meet again", 'let us meet again', 'we will meet again', "let's meet", 'see you'],
  come_again: ['come again', 'please come again', 'keep coming'],
  take_care: ['take care', 'be well', 'stay well', 'take care on your way', 'have a good journey', 'have a good trip'],
  welcome_in: ['welcome', 'please come in', 'come in', 'please come', 'please come inside', 'come inside', 'please welcome'],
  please_sit: ['please sit', 'please sit down', 'sit down', 'please sit here'],
  may_i_come_in: ['may i come in'],
  can_you_help: ['can you help', 'can you help please', 'can you help kindly'],
  need_help: ['do you need help', 'do you want my help'],
  i_will_help: ['i will help'],
  have_you_eaten: ['have you eaten'],
  yes: ['yes', 'yes sir', "yes ma'am"],
  no: ['no'],
  // Not 'excuse me': in this library it is glossed beside 'sorry' far more
  // often than as a call for attention, and 'Yes' is no answer to an apology.
  attention: ['listen', 'please listen'],
  well_wishes: ['congratulations', 'well done', 'best wishes', 'good luck', 'happy birthday', 'bless you', 'god bless', 'may god bless you', 'may god keep you happy', 'stay happy', 'be happy', 'stay healthy', 'get well soon', 'have a nice day', 'have a good day', 'have a pleasant day'],
  peace_be_upon_you: ['peace be upon you'],
  peace_reply: ['and peace be upon you too', 'and peace be upon you'],
} as const satisfies Record<string, readonly string[]>;

export type AnswerBackConcept = keyof typeof CONCEPTS;

/** Every greeting that opens a meeting. Any of them answers any other (good night is a farewell, not here). */
const GREETINGS: readonly AnswerBackConcept[] = ['hello', 'good_morning', 'good_afternoon', 'good_evening', 'good_day'];

/**
 * THE PAIR TABLE. A prompt concept, and the concepts that answer it, in order
 * of preference: the first reply concept a group holds a phrase for is the
 * card that is marked right, and EVERY listed concept is kept off the wrong
 * cards, so "Hello" is never offered as the wrong answer to "Good morning".
 *
 * `preferEcho`: saying the line back IS the natural answer ("Good morning" to
 * "Good morning"), so when the prompt is itself a valid reply it is the right
 * card, and a different greeting in the group is merely not a distractor.
 * Echoes count toward the minimum, but pickAnswerBackRound puts every
 * non-echo exchange first, because an echo can be answered by ear alone.
 */
export const ANSWER_BACK_PAIRS: readonly {
  prompt: AnswerBackConcept;
  replies: readonly AnswerBackConcept[];
  preferEcho?: boolean;
}[] = [
  { prompt: 'hello', replies: GREETINGS, preferEcho: true },
  { prompt: 'good_morning', replies: ['good_morning', ...GREETINGS], preferEcho: true },
  { prompt: 'good_afternoon', replies: ['good_afternoon', ...GREETINGS], preferEcho: true },
  { prompt: 'good_evening', replies: ['good_evening', ...GREETINGS], preferEcho: true },
  { prompt: 'good_day', replies: ['good_day', ...GREETINGS], preferEcho: true },
  { prompt: 'good_night', replies: ['good_night', 'goodbye', 'see_you_again'], preferEcho: true },
  { prompt: 'how_are_you', replies: ['i_am_fine'] },
  { prompt: 'are_you_well', replies: ['i_am_fine', 'yes'] },
  { prompt: 'thank_you', replies: ['youre_welcome'] },
  { prompt: 'sorry', replies: ['no_problem'] },
  { prompt: 'what_is_your_name', replies: ['my_name_is'] },
  { prompt: 'nice_to_meet_you', replies: ['nice_to_meet_you'], preferEcho: true },
  { prompt: 'peace_be_upon_you', replies: ['peace_reply'] },
  { prompt: 'goodbye', replies: ['see_you_again', 'take_care', 'goodbye'] },
  { prompt: 'see_you_again', replies: ['goodbye', 'see_you_again'] },
  // NOT see_you_again or goodbye. Heard in the simulator 2026-09-14, Hindi stop
  // 6: the keeper said "फिर आना" (Come again) and the game marked "फिर मिलते हैं"
  // (See you later) right; the owner, a speaker: "the answer is not any of
  // these". A farewell does not answer an invitation back. Thank you is kept
  // as the supervisor's reading, not yet a speaker's.
  { prompt: 'come_again', replies: ['thank_you'] },
  { prompt: 'take_care', replies: ['thank_you', 'goodbye', 'see_you_again'] },
  { prompt: 'welcome_in', replies: ['thank_you'] },
  { prompt: 'please_sit', replies: ['thank_you'] },
  { prompt: 'may_i_come_in', replies: ['welcome_in', 'yes'] },
  { prompt: 'can_you_help', replies: ['i_will_help', 'yes'] },
  { prompt: 'need_help', replies: ['yes', 'no'] },
  { prompt: 'have_you_eaten', replies: ['yes', 'no'] },
  { prompt: 'attention', replies: ['yes'] },
  { prompt: 'well_wishes', replies: ['thank_you'] },
];

// ── Reading a gloss ─────────────────────────────────────────────────────────

/** Bare forms of address a clause can be dropped for ("How are you, sir?"). */
const ADDRESS_CLAUSES = new Set([
  'sir', "ma'am", 'madam', "sir/ma'am", 'friend', 'friends', 'brother', 'sister', 'mom', 'dad', 'uncle', 'aunty', 'auntie',
  'teacher', 'everyone', 'children', 'guest', 'grandma', 'grandpa', 'dear', 'my friend', 'ji',
]);

/**
 * REGION: what THIS app's English glosses call the keeper when a line is said
 * TO him. India's keeper is Chacha-ji, an uncle.
 *
 * THE KEEPER-TITLE RULE (Europe parity review, 2026-09-15, review-parity-europe.md
 * finding 1): a line addressed to the keeper's own title is never the keeper's
 * line. The comma rule above drops ", grandma", so on Europe's Ukrainian stop 6
 * "How are you, grandma?" read as how_are_you and the grandmother asked it of
 * the learner in every round. It stays a valid REPLY (the learner saying it to
 * her is exactly right), so only promptConceptsOf reads this.
 *
 * Evidence for India's entry, grep of lib/db/src/data/*.json 2026-09-15: the one
 * gloss that addresses an uncle is Gujarati C1 greetings "How are you, uncle?"
 * (curatedSentencesC1.json). No gloss says "chacha", "chacha-ji" or "kaka", and
 * neither is in ADDRESS_CLAUSES, so such a line could never be read as a prompt
 * anyway. Left out on purpose: "ji" and "sir", which address anyone, and the
 * keeper saying "sir" to a learner is a separate question (finding 2).
 * An entry must also be in ADDRESS_CLAUSES or it never reaches addressedTo;
 * both clients' answer-back.test.ts pin that.
 */
export const KEEPER_OWN_TITLES: ReadonlySet<string> = new Set(['uncle']);

/** Lowercase, straight apostrophes, letters/digits/apostrophe/slash/hyphen and single spaces only. */
export function normaliseClause(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\.\.\.|\u2026/g, ' ')
    .replace(/[^\p{L}\p{N}'\/\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Alternative {
  clauses: string[];
  joined: string;
  hasQuestion: boolean;
  /** The address clauses dropped from it, kept for the keeper-title rule (KEEPER_OWN_TITLES). */
  addressedTo: string[];
}

/** An English gloss as alternatives of clauses. Exported for the pins. */
export function glossReading(english: string): Alternative[] {
  const cleaned = english.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\([^)]*\)/g, ' ');
  return cleaned
    .split(/\s+\/\s+|;/)
    .map((alt) => {
      const hasQuestion = alt.includes('?');
      const all = alt
        .split(/[,.!?]/)
        .map(normaliseClause)
        .filter((c) => c.length > 0);
      const clauses = all.filter((c) => !ADDRESS_CLAUSES.has(c));
      const addressedTo = all.filter((c) => ADDRESS_CLAUSES.has(c));
      return { clauses, joined: clauses.join(' '), hasQuestion, addressedTo };
    })
    .filter((a) => a.clauses.length > 0);
}

function aliasMatches(alias: string, clause: string): boolean {
  return alias.endsWith('*') ? clause.startsWith(alias.slice(0, -1)) : clause === alias;
}

function conceptMatches(concept: AnswerBackConcept, clause: string): boolean {
  return (CONCEPTS[concept] as readonly string[]).some((a) => aliasMatches(a, clause));
}

const ALL_CONCEPTS = Object.keys(CONCEPTS) as AnswerBackConcept[];

/**
 * A sentence is only usable when it is made of formulae and nothing else:
 * "Hello, how are you?" is two formulae, "Hello, I am going to school." is a
 * greeting glued to a story, and offering the story half as a reply to
 * "Welcome, please come inside." is not a conversation anyone has (the first
 * resolver pass did exactly that, "Thank you, you called me.", 2026-09-14).
 */
function allFormulae(alt: Alternative): boolean {
  return alt.clauses.every((cl) => ALL_CONCEPTS.some((c) => conceptMatches(c, cl)));
}

/** Concepts a phrase can be SAID AS by the keeper (rules 4 and 6 in the header). */
export function promptConceptsOf(english: string): Set<AnswerBackConcept> {
  const out = new Set<AnswerBackConcept>();
  for (const alt of glossReading(english)) {
    // The keeper-title rule (KEEPER_OWN_TITLES, Europe parity review 2026-09-15):
    // a line said TO the keeper is never said BY the keeper. Here, where the
    // keeper's role is read, rather than in pickAnswerBackRound or the round
    // reducer: dropping it there would leave the map's exchange count
    // (canPlayAnswerBack, AnswerBackProbe) counting a line no round deals, so a
    // stop could qualify on 3 and play 2. replyConceptsOf is left alone on purpose.
    if (alt.addressedTo.some((a) => KEEPER_OWN_TITLES.has(a))) continue;
    const joinedHit = ALL_CONCEPTS.filter((c) => conceptMatches(c, alt.joined));
    joinedHit.forEach((c) => out.add(c));
    if (joinedHit.length > 0 || !allFormulae(alt)) continue;
    const last = alt.clauses[alt.clauses.length - 1]!;
    for (const c of ALL_CONCEPTS) if (conceptMatches(c, last)) out.add(c);
  }
  return out;
}

/** Concepts a phrase can ANSWER WITH (rules 5 and 6 in the header). */
export function replyConceptsOf(english: string): Set<AnswerBackConcept> {
  const out = new Set<AnswerBackConcept>();
  for (const alt of glossReading(english)) {
    const joinedHit = ALL_CONCEPTS.filter((c) => conceptMatches(c, alt.joined));
    joinedHit.forEach((c) => out.add(c));
    if (joinedHit.length > 0 || !allFormulae(alt)) continue;
    const candidates = alt.hasQuestion ? [alt.clauses[0]!] : alt.clauses;
    for (const c of ALL_CONCEPTS) if (candidates.some((cl) => conceptMatches(c, cl))) out.add(c);
  }
  return out;
}

/**
 * Clauses that may ride along in a composite reply without changing what it
 * answers: "I am fine, thank you.", "Hello, I am fine.", "See you later, best
 * wishes." Anything else alongside the answer makes it a different line
 * ("Nice to meet you, let's meet again." is not how anyone answers "Good
 * night, take care on your way.", which the second resolver pass offered).
 */
const RIDE_ALONG: readonly AnswerBackConcept[] = ['thank_you', 'hello', 'yes', 'well_wishes', 'take_care'];

/**
 * The STRICT reading used to pick the right card: the phrase answers with one
 * of `wanted`, and every other clause in it is a ride-along. The loose reading
 * (replyConceptsOf) is still what keeps a phrase off the wrong cards, so a
 * line that half answers is neither marked right nor offered as wrong.
 */
export function answersCleanly(english: string, wanted: readonly AnswerBackConcept[]): boolean {
  for (const alt of glossReading(english)) {
    if (wanted.some((c) => conceptMatches(c, alt.joined))) return true;
    if (!allFormulae(alt)) continue;
    const candidates = alt.hasQuestion ? [alt.clauses[0]!] : alt.clauses;
    if (!candidates.some((cl) => wanted.some((c) => conceptMatches(c, cl)))) continue;
    const allowed = [...wanted, ...RIDE_ALONG];
    if (alt.clauses.every((cl) => allowed.some((c) => conceptMatches(c, cl)))) return true;
  }
  return false;
}

// ── Telling a spoken reply apart from the other cards ───────────────────────
// No similarity helper was importable by both clients: the api-server's
// pronunciationGuards.ts normalizeLatin / normalizeNative / similarity are
// server-only, and letter-stops.ts keeps its editDistance private. These are a
// deliberate small copy of the server's two normalisers (same folds, same
// Indic mark handling) so a card is chosen by the same idea of "the same
// words" the scorer uses. If the server's folds move, move these.

/** Server normalizeLatin, restated: romanisation spelling variants fold together. */
export function normaliseLatinForMatch(text: string): string {
  let s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
  for (const [re, to] of [
    [/chh/g, 'ch'],
    [/w/g, 'v'],
    [/ee/g, 'i'],
    [/oo/g, 'u'],
  ] as const) {
    s = s.replace(re, to);
  }
  return s.replace(/(.)\1+/g, '$1');
}

/** Server normalizeNative, restated: letters only, joiners, nukta and nasal spellings folded. */
export function normaliseNativeForMatch(text: string): string {
  return text
    .replace(/[\u200C\u200D]/g, '')
    .normalize('NFC')
    .replace(/[\u0901\u0902]/g, '')
    .replace(/[\u0919\u091E\u0923\u0928\u092E]\u094D/g, '')
    .replace(/[^\p{L}]/gu, '')
    .toLowerCase();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** 0..1 similarity of two ALREADY normalised strings. Empty against anything non-empty is 0. */
export function similarityRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/** Best evidence that `heard` is this card: native against native, roman against roman. */
export function cardMatchScore(
  heard: { transcript: string; transcriptRomanized?: string | null },
  card: Pick<AnswerBackPhrase, 'nativeScript' | 'romanized'>,
): number {
  const scores: number[] = [];
  const tNative = normaliseNativeForMatch(heard.transcript);
  const cNative = normaliseNativeForMatch(card.nativeScript);
  if (tNative && cNative) scores.push(similarityRatio(tNative, cNative));
  const cRoman = normaliseLatinForMatch(card.romanized);
  // transcriptRomanized is "" for scripts with no clean romanisation (Perso-
  // Arabic, Meetei Mayek); a Latin transcript is its own romanisation.
  for (const r of [heard.transcriptRomanized ?? '', heard.transcript]) {
    const tRoman = normaliseLatinForMatch(r);
    if (tRoman && cRoman) scores.push(similarityRatio(tRoman, cRoman));
  }
  return scores.length ? Math.max(...scores) : 0;
}

/** Below this, a transcript is not evidence for any card. TUNING PENDING, unmeasured. */
export const ANSWER_BACK_MIN_MATCH = 0.5;
/** The winning card must beat the runner-up by this much to count as chosen. TUNING PENDING. */
export const ANSWER_BACK_MATCH_MARGIN = 0.1;

/**
 * Which card the learner spoke, or null when the transcript cannot tell. Null
 * is not a wrong answer: answerBackTakeOutcome then trusts the scorer's band
 * for the right card, which is what practice would have done.
 */
export function detectChosenCard<P extends AnswerBackPhrase>(
  heard: { transcript: string; transcriptRomanized?: string | null },
  cards: readonly P[],
): { chosen: P | null; scores: { id: number; score: number }[] } {
  const scores = cards.map((c) => ({ id: c.id, score: cardMatchScore(heard, c) }));
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < ANSWER_BACK_MIN_MATCH) return { chosen: null, scores };
  if (second && top.score - second.score < ANSWER_BACK_MATCH_MARGIN) return { chosen: null, scores };
  return { chosen: cards.find((c) => c.id === top.id) ?? null, scores };
}

/** What a scored take means for the round. `band` is the screen's pass/fail/nocatch reading of practice's band. */
export type AnswerBackTakeOutcome = 'pass' | 'wrong_card' | 'fail' | 'nocatch';

export function answerBackTakeOutcome(input: {
  band: 'pass' | 'fail' | 'nocatch';
  chosenId: number | null;
  rightId: number;
}): AnswerBackTakeOutcome {
  if (input.band === 'nocatch') return 'nocatch';
  // A clearly different card is the wrong answer even if the scorer was
  // generous: the scorer only ever compared the take against the right reply.
  if (input.chosenId !== null && input.chosenId !== input.rightId) return 'wrong_card';
  return input.band === 'pass' ? 'pass' : 'fail';
}

// ── The resolver ────────────────────────────────────────────────────────────

/** Two cards this alike cannot be told apart by a transcript, so they never share a screen. */
const CONFUSABLE_ROMAN = 0.75;

function confusable(a: AnswerBackPhrase, b: AnswerBackPhrase): boolean {
  if (normaliseNativeForMatch(a.nativeScript) === normaliseNativeForMatch(b.nativeScript)) return true;
  const ra = normaliseLatinForMatch(a.romanized);
  const rb = normaliseLatinForMatch(b.romanized);
  return !!ra && !!rb && similarityRatio(ra, rb) >= CONFUSABLE_ROMAN;
}

/**
 * Every exchange one lesson group can play, in the group's own order. Pure and
 * deterministic: the screen shuffles, and the journey map only needs a count.
 */
export function answerBackExchangesFor<P extends AnswerBackPhrase>(phrases: readonly P[]): AnswerBackExchange<P>[] {
  const replyConcepts = new Map(phrases.map((p) => [p.id, replyConceptsOf(p.english)]));
  const out: AnswerBackExchange<P>[] = [];
  for (const prompt of phrases) {
    const promptConcepts = promptConceptsOf(prompt.english);
    const wanted: AnswerBackConcept[] = [];
    let preferEcho = false;
    // SAYING THE LINE BACK is only an answer when the pair lists the prompt's
    // own concept among its replies ("See you later" to "See you later"), and
    // only for a one-formula line: echoing "Thank you very much, have a nice
    // day." or "Come in, hello." back at the keeper is not a conversation (both
    // came out of the first resolver pass, 2026-09-14).
    let echoOk = false;
    for (const pair of ANSWER_BACK_PAIRS) {
      if (!promptConcepts.has(pair.prompt)) continue;
      if (pair.preferEcho) preferEcho = true;
      if (pair.replies.includes(pair.prompt)) echoOk = true;
      for (const r of pair.replies) if (!wanted.includes(r)) wanted.push(r);
    }
    echoOk = echoOk && glossReading(prompt.english).some((alt) => alt.clauses.length === 1);
    if (wanted.length === 0) continue;
    const isValid = (q: P) => wanted.some((c) => replyConcepts.get(q.id)!.has(c));

    // The right card: the prompt itself for an echo pair, otherwise the first
    // preferred concept a DIFFERENT phrase answers with, and the prompt itself
    // again only when nothing else in the group does.
    let reply: P | undefined = echoOk && preferEcho && isValid(prompt) ? prompt : undefined;
    for (const c of reply ? [] : wanted) {
      reply = phrases.find((q) => q.id !== prompt.id && answersCleanly(q.english, [c]));
      if (reply) break;
    }
    if (!reply && echoOk && isValid(prompt)) reply = prompt;
    if (!reply) continue;
    const right = reply;

    // Distractors: never a valid reply, never the prompt, never confusable
    // with the right card or each other. Reply-shaped phrases first, so the
    // wrong cards look like answers rather than like obvious non-answers.
    const pool = phrases.filter((q) => q.id !== prompt.id && q.id !== right.id && !isValid(q) && !confusable(q, right));
    const ordered = [
      ...pool.filter((q) => replyConcepts.get(q.id)!.size > 0),
      ...pool.filter((q) => replyConcepts.get(q.id)!.size === 0),
    ];
    const picked: P[] = [];
    for (const q of ordered) {
      if (picked.length === 2) break;
      if (picked.some((d) => confusable(d, q))) continue;
      picked.push(q);
    }
    if (picked.length < 2) continue;
    out.push({ promptPhrase: prompt, replyPhrase: right, distractors: [picked[0]!, picked[1]!], echo: right.id === prompt.id });
  }
  return out;
}

/** True when a group has enough exchanges to be played as Answer Back at all. */
export function canPlayAnswerBack(phrases: readonly AnswerBackPhrase[]): boolean {
  return answerBackExchangesFor(phrases).length >= ANSWER_BACK_MIN_EXCHANGES;
}

/**
 * The round: up to ANSWER_BACK_ROUND_SIZE exchanges, non-echo first. `shuffle`
 * is injected so the pins stay deterministic; the screens pass a real one.
 */
export function pickAnswerBackRound<P extends AnswerBackPhrase>(
  exchanges: readonly AnswerBackExchange<P>[],
  shuffle: <T>(items: readonly T[]) => T[] = (items) => [...items],
): AnswerBackExchange<P>[] {
  const mixed = shuffle(exchanges);
  return [...mixed.filter((e) => !e.echo), ...mixed.filter((e) => e.echo)].slice(0, ANSWER_BACK_ROUND_SIZE);
}
