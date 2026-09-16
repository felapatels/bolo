/**
 * A concept is an English string, and the corpus does not agree on which one.
 *
 * The scene graph names a concept in English and each language resolves it
 * against the phrases it already teaches, which only works while every language
 * writes that concept the same way. It does not.
 *
 * MEASURED AGAINST PRODUCTION, 2026-08-23:
 *
 *   father   21 languages    mother   21 languages
 *   Dad       1 language     Mom       1 language
 *
 * and the one language is GUJARATI, which is the flagship. Gujarati was
 * authored first and separately (the web artifact is still called
 * gujarati-coach), so its English wording never matched the twenty-one written
 * later. Left alone, the family book skips two of its five scenes in the one
 * language the app is named after and runs in full everywhere else.
 *
 * So a concept carries the spellings it accepts rather than a single string.
 * The alternative was rewriting production rows, which is a data migration
 * against the database nothing in this repo migrates, to fix a wording problem.
 *
 * MATCHED CASE-INSENSITIVELY AND TRIMMED, because the corpus stores display
 * text: "Dad", "Mom", "How are you?" are what the rows actually say.
 *
 * ---------------------------------------------------------------------------
 * MEASURED ACROSS ALL SIX REPOS, 2026-09-15, and this is why the literal list
 * below stopped being enough.
 *
 * The list was written against INDIA's gloss wording. Every fork inherited it
 * whole, and every fork words the same ideas differently, so a concept the
 * corpus plainly teaches read as ABSENT and the storybook skipped the scene.
 * Counting scene-and-language pairs lost to wording rather than to content:
 *
 *   Africa    "Sorry, excuse me" with a COMMA costs 30 pairs, because the list
 *             only accepted the slash form. "rice, a meal" and "rice or a meal"
 *             cost 36 more.
 *   SEA       rice and sorry alone are 62 of 163 scene-language misses.
 *   East      every one of the ten languages writes "Rice, and also a meal" and
 *             "father-in-law (wife's father)". Zero exact rows for either.
 *   Europe    French cards its nouns with an article: "a bowl", "a spoon",
 *             "some rice", "the water". Polish seeds "Hi" where the books say
 *             hello.
 *
 * So the matcher gained RULES as well as literals. Each rule below is a shape
 * the seed content actually uses, named with the fork that motivated it, and
 * each one only ever strips material that says WHO is speaking, HOW politely,
 * or WHICH one is meant. Material that names a DIFFERENT THING is never
 * stripped, because a scene's three lines have to stay three real choices:
 *
 *   "good night"      is NOT the concept `night`. Both are concepts, and
 *                     photo-3 puts good night and good morning on one board.
 *   "you're welcome"  is NOT the concept `welcome`. door-5 and thali-5 use
 *                     welcome as the ARRIVAL greeting: their outcomes swing the
 *                     gate open again and sit down to eat with you.
 *   "fried rice"      is NOT the concept `rice`. A dish is not an ingredient,
 *                     and no general rule can tell a narrowing qualifier from a
 *                     compound that names another food.
 *   "price"           is NOT the concept `rice`. Nothing here matches on a
 *                     shared substring; every rule ends in an exact comparison.
 *   "Spoon small"     is NOT the concept `spoon`. The Serbian row carries its
 *                     own hint saying so: it is the diminutive, a teaspoon.
 *   "I am sorry"      is NOT the concept `sorry`, and that is the conservative
 *                     call rather than an oversight. The 2026-08-30 note below
 *                     already refuses full sentences as aliases; adding a
 *                     subject and a verb turns a word into one. It costs
 *                     Europe's j1z5-courtyard in Bulgarian, which is named in
 *                     the report rather than quietly recovered.
 */
const CONCEPT_ALIASES: Record<string, readonly string[]> = {
  father: ["dad"],
  mother: ["mom"],
  // MEASURED AGAINST PRODUCTION, 2026-08-30 (build 25). The greetings book's
  // FIRST page names "how much is this?", and Gujarati's corpus writes the
  // idea as "How much is it?" / "How much?" / "How much does this cost?" —
  // zero exact rows. A paying account therefore opened the book to the
  // deliberate corpus-thin blank on page one, in the flagship language (the
  // owner's tester, iPhone, 1.0.6). Same drift for "sorry", which Gujarati
  // writes paired with excuse me. Full sentences ("How much is it? I need
  // more.") are deliberately NOT aliases: a concept resolves to a phrase a
  // learner can answer with, not a monologue.
  "how much is this?": ["how much is it?", "how much?", "how much does this cost?"],
  // Kept although CLAUSE_SEPARATORS now reaches both of these on its own: they
  // are the rows the 2026-08-30 measurement actually names, and a literal that
  // says which production row it came from outlives a rule someone narrows.
  sorry: ["sorry / excuse me", "excuse me / sorry"],
  // "kal" means both tomorrow and yesterday, which is why Hindi, Urdu and
  // Dogri all write the card as the pair; resolving the concept to it is
  // correct, not a compromise. The clause rule now resolves `yesterday` to the
  // same row, which is the other half of the same fact and was worth 8 pairs in
  // India's seed. Checked before it was allowed: no scene names tomorrow and
  // yesterday together, so the pair row never fills two of one board's lines.
  tomorrow: ["tomorrow / yesterday"],
  goodbye: ["bye"],
  // MEASURED IN EUROPE'S SEED, 2026-09-15. Eight of the twenty-two languages
  // card the greeting as "Hi" and never as "Hello": Polish "Cześć", Bosnian
  // "Ćao", Croatian "Bok", Czech "Ahoj", Estonian "Tere", Hungarian "Szia",
  // Latvian "Sveiki", Lithuanian "Labas". Same shape as goodbye/bye above, and
  // accepted for the same reason.
  hello: ["hi"],
  congratulations: [
    "congratulations / best wishes",
    "congratulations to you",
    "heartfelt congratulations",
    "congratulations, best wishes on success",
  ],
  // MEASURED IN INDIA'S SEED, 2026-09-15. The thali's bowl is a katori, and
  // Gujarati (વાટકી, vaatki), Dogri and Hindi all card it as "Small bowl".
  // A LITERAL rather than a rule that strips size words: "small bowl" is the
  // vessel the scene hands over, while Serbian's "Spoon small" is a teaspoon
  // and says so in its own hint. One of those is the thing and one is not, and
  // no general rule separates them.
  bowl: ["small bowl"],
  // MEASURED IN AFRICA'S SEED, 2026-09-15. Igbo and Swahili card the thali's
  // knife by its job. Literals for the same reason as "small bowl": a leading
  // modifier can narrow ("table knife") or replace ("fried rice"), and only
  // reading the row tells you which.
  knife: ["eating knife", "table knife"],
  // MEASURED IN AFRICA'S SEED, 2026-09-15. Eight of the ten languages write
  // which grandfather, with no bracket for GLOSS_TAILS to find: "grandfather
  // fatherside" (ha, ig, so, ti, yo) and "grandfather fathers side" (am, sw,
  // zu). Same idea the bracketed East rows carry, spelled without the bracket.
  grandfather: [
    "grandfather fatherside",
    "grandfather motherside",
    "grandfather fathers side",
    "grandfather mothers side",
  ],
  // MEASURED IN EUROPE'S SEED, 2026-09-15. Albanian runs the pair together
  // with no separator for CLAUSE_SEPARATORS to split on, where nine African and
  // five Latin American languages write "grandson, or nephew".
  grandson: ["grandson nephew"],
};

/**
 * One row, two glosses. Split here and any clause may name the concept.
 *
 * MEASURED, 2026-09-15: this is the single highest-value rule in the file.
 *   "Sorry, excuse me"        Africa (5 langs), SEA (6), LATAM (1)
 *   "rice, a meal"            Africa; "Rice, and also a meal" East (all 10)
 *   "rice or a meal"          Africa (ha, yo, zu); "rice or meal" (arz)
 *   "grandson, or nephew"     Africa (9), SEA (3), LATAM (5)
 *   "plate / dish"            India (ml); "cup / bowl" (doi); "bowl / cup" (hi)
 *   "food; rice"              India (sa)
 *   "tomorrow / yesterday"    India (gu, hi, ur), for `yesterday`
 *   "grandson / grandchild"   India (kn); "aunt / mother-in-law" (kn)
 *
 * " or " is a separator and " and " deliberately is NOT: "bread and butter" is
 * one thing with two halves, where "rice or a meal" is one word with two
 * readings. A hyphen is not a separator either, which is what keeps
 * "father-in-law" from resolving `father`.
 */
const CLAUSE_SEPARATORS = /\s*(?:\/|;|,|\bor\b)\s*/;

/**
 * Trailing words that say who is speaking or how politely, never what is said.
 *
 * MEASURED, 2026-09-15, every entry taken from a row that exists:
 *   polite / politely / formal / formally / informal / informally / colloquial
 *   / casual / kindly   "Hello politely" (Europe bg, it, lt), "sorry (casual)"
 *                       (SEA th), "thank you kindly" (Europe bs, de, mk, sr,
 *                       sl), "please formal" (Europe fr)
 *   male / female / man / woman / men / women
 *                       "sorry male" (Europe fr), "welcome male" (it),
 *                       "yes (said by men)" (SEA km)
 *   sir / madam         "good morning madam", "good morning sir" (Europe fr)
 *   short / alt         "congratulations short" (Europe lt)
 *   greeting            "Good morning greeting" (SEA km, Africa sw)
 *
 * ONE tag is stripped, not a tail of them, so "thank you very much man" stays
 * "thank you very much" and does not become `thank you`. An intensified phrase
 * is a different phrase; a register tag is the same phrase said to a different
 * person.
 */
const GLOSS_TAILS: readonly string[] = [
  "polite",
  "politely",
  "formal",
  "formally",
  "informal",
  "informally",
  "colloquial",
  "casual",
  "kindly",
  "male",
  "female",
  "man",
  "woman",
  "men",
  "women",
  "sir",
  "madam",
  "short",
  "alt",
  "greeting",
];

/**
 * Leading words that point at a thing without naming a different one.
 *
 * MEASURED IN EUROPE'S SEED, 2026-09-15, and French is most of the reason it
 * exists: it cards its nouns with the article attached where the other
 * twenty-one card them bare. "a bowl", "a fork", "a knife", "a plate",
 * "a spoon", "some salt", "some rice", "the water", "the family" are all one
 * language's whole holding of a concept the books need. German writes "The
 * spoon" and "The night"; Croatian, Czech, German, French and five Africa and
 * LATAM languages write "my grandfather" and "my grandson".
 *
 * "at night" is deliberately NOT here. An article points at the thing; "at"
 * turns it into when something happens, which is a different line to say.
 */
const GLOSS_HEADS: readonly string[] = ["a", "an", "the", "some", "my"];

/**
 * Display text reduced to the form everything else compares against.
 *
 * Curly apostrophes are the corpus's own ("father's father" is written with U+2019
 * in five repos), and a trailing "!" or "." is decoration: LATAM cards the
 * concept `good news` as "Good news!" in five of its six languages. A trailing
 * "?" is KEPT, because "how much is this?" is a concept and the question mark
 * is part of how the corpus writes it.
 */
function normaliseGloss(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[!.]+$/, "")
    .trim();
}

/** Strip every bracketed group: "father-in-law (wife's father)" is one idea. */
function withoutBrackets(text: string): string | null {
  if (!/[([]/.test(text)) return null;
  const out = text.replace(/\s*[([][^)\]]*[)\]]\s*/g, " ").replace(/\s+/g, " ").trim();
  return out.length > 0 && out !== text ? out : null;
}

function withoutHead(text: string): string | null {
  for (const head of GLOSS_HEADS) {
    if (text.startsWith(`${head} `)) return text.slice(head.length + 1).trim();
  }
  return null;
}

function withoutTail(text: string): string | null {
  for (const tail of GLOSS_TAILS) {
    if (text.endsWith(` ${tail}`)) return text.slice(0, -(tail.length + 1)).trim();
  }
  return null;
}

/**
 * Every reading of one corpus gloss that still names the same idea.
 *
 * A fixpoint rather than a fixed order, because the rules compose and the
 * corpus stacks them: East writes 'Rice, and also "a meal"' (clause, then
 * quotes), Europe writes "Good morning, grandma" (clause) and "sorry (polite)"
 * (bracket), and a French row could plausibly card "the spoon polite". The
 * reducers only ever SHORTEN, so the set cannot grow without bound; the cap is
 * belt and braces against a reducer someone later writes that does not.
 */
function glossReadings(english: string): string[] {
  const seen = new Set<string>([normaliseGloss(english)]);
  const queue = [...seen];
  while (queue.length > 0 && seen.size < 64) {
    const text = queue.shift()!;
    const next: (string | null)[] = [
      withoutBrackets(text),
      withoutHead(text),
      withoutTail(text),
      ...text.split(CLAUSE_SEPARATORS),
    ];
    for (const raw of next) {
      if (raw == null) continue;
      const reading = normaliseGloss(raw);
      if (reading.length === 0 || seen.has(reading)) continue;
      seen.add(reading);
      queue.push(reading);
    }
  }
  return [...seen];
}

/**
 * Every English spelling that resolves a concept, the canonical one first.
 *
 * THE LITERALS ONLY. The rules above cannot be enumerated (no finite list
 * derives "rice, a meal" from "rice"), so this is no longer the whole answer
 * and it is no longer what decides a lookup: `matchesConcept` is. The server's
 * query stopped prefiltering on this list on 2026-09-15 for exactly that
 * reason, and filters its language's phrase rows through `matchesConcept`
 * instead, so the query and the engine still cannot answer differently.
 */
export function conceptSpellings(concept: string): string[] {
  const key = normaliseGloss(concept);
  return [key, ...(CONCEPT_ALIASES[key] ?? [])];
}

/**
 * True when an English phrase text names this concept.
 *
 * THE ONE DEFINITION. Both the server's lookup and any test's `has` go through
 * this, so a concept cannot mean one thing in the corpus query and another in
 * the engine.
 */
export function matchesConcept(concept: string, english: string): boolean {
  const spellings = new Set(conceptSpellings(concept));
  return glossReadings(english).some((reading) => spellings.has(reading));
}
