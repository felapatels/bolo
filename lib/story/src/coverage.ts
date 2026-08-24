/**
 * How many of the 22 languages carry each concept, measured against PRODUCTION
 * on 2026-08-24.
 *
 * WHY THIS IS DATA AND NOT A COMMENT. A book is only as wide as its narrowest
 * concept: name one word a language lacks and resolveScene() returns null, the
 * story stop vanishes in that language, and NOTHING FAILS. Nobody would notice
 * until a learner did. Holding the measurement here lets a test refuse a book
 * that names a concept the corpus does not have, which is the only way authoring
 * 120 lines by hand is safe.
 *
 * ONLY CONCEPTS AT 18 OR MORE ARE LISTED, because that is the floor the owner
 * chose on 2026-08-24 and anything below it is not authorable. The trade was
 * explicit: the 36 concepts shared by all 22 languages are numbers, greetings
 * and relatives, and books built from them cannot be funny. Dropping to 18
 * buys "how much is this?", "congratulations", "sorry", "goodbye", "fork",
 * "rice" and the weekdays, which is where the comedy lives, at the cost of a
 * book running in 18 to 22 languages rather than always 22.
 *
 * THE CORPUS HAS NO WHIMSY, and it is worth writing down so nobody looks again:
 * there is no cow, dog, cat, bird or elephant in ANY language, and "dance"
 * exists in five. This is a phrasebook for visiting family. The joke has to come
 * from saying an ordinary thing at the wrong moment, not from a funny noun.
 *
 * REGENERATE, never hand-edit, when the corpus changes:
 *   psql "$DATABASE_URL_PROD" -At -c "with k as (select lower(btrim(english)) c,
 *     count(distinct language_code) n from phrases where stage='phrase'
 *     group by 1) select c, n from k where n>=18 order by c;"
 */
export const CONCEPT_COVERAGE: Record<string, number> = {
  "bowl": 18,
  "brother": 20,
  "come": 18,
  "congratulations": 19,
  "daughter": 21,
  "day": 20,
  "eight": 22,
  "eighteen": 22,
  "eleven": 22,
  "evening": 19,
  "family": 22,
  "father": 21,
  "father-in-law": 19,
  "fifteen": 22,
  "five": 22,
  "fork": 19,
  "four": 22,
  "fourteen": 22,
  "friday": 20,
  "good evening": 18,
  "good morning": 22,
  "good news": 20,
  "good night": 22,
  "goodbye": 19,
  "grandfather": 21,
  "grandmother": 20,
  "grandson": 18,
  "hello": 22,
  "here": 22,
  "how are you?": 21,
  "how much is this?": 19,
  "husband": 22,
  "knife": 21,
  "monday": 20,
  "morning": 19,
  "mother": 21,
  "mother-in-law": 18,
  "night": 21,
  "nine": 22,
  "nineteen": 22,
  "no": 22,
  "now": 21,
  "one": 22,
  "plate": 21,
  "please": 22,
  "rice": 18,
  "salt": 22,
  "saturday": 18,
  "seven": 22,
  "seventeen": 22,
  "sister": 20,
  "six": 22,
  "sixteen": 22,
  "son": 22,
  "son-in-law": 18,
  "sorry": 19,
  "spoon": 22,
  "sunday": 19,
  "ten": 22,
  "thank you": 22,
  "there": 21,
  "thirteen": 22,
  "three": 22,
  "thursday": 19,
  "today": 22,
  "tomorrow": 19,
  "tuesday": 20,
  "twelve": 22,
  "twenty": 22,
  "two": 22,
  "water": 22,
  "wednesday": 19,
  "welcome": 21,
  "wife": 22,
  "yes": 22,
  "yesterday": 19,
};

/** The floor a book's concepts must clear. Owner ruling, 2026-08-24. */
export const MIN_CONCEPT_COVERAGE = 18;

/**
 * How many languages a book runs in: its NARROWEST concept.
 *
 * Not an average and not the widest. One missing word takes the whole scene
 * with it, so the weakest link is the honest number.
 */
export function bookCoverage(concepts: readonly string[]): number {
  let min = 22;
  for (const concept of concepts) {
    const n = CONCEPT_COVERAGE[concept.trim().toLowerCase()] ?? 0;
    if (n < min) min = n;
  }
  return min;
}
