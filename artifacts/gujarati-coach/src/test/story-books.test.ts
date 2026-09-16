// The book registry: one storybook per fare zone, the free taste, and the
// concept aliases that keep Gujarati from losing two scenes to a spelling.
//
// WHY THESE ASSERTIONS EXIST. Every one of them is a fact measured against the
// production corpus on 2026-08-23, and every one of them is silent if it breaks:
// a book whose concepts a language lacks does not throw, it renders a shorter
// story, which is exactly what the engine is designed to do for a thin corpus.
// So the difference between "designed for" and "broken" is only ever a test.
import { describe, test, expect } from "vitest";
import {
  bookConcepts,
  bookScenePrefix,
  endingStillId,
  STORY_ART_DIR,
  storyStillPath,
  GREETINGS_ENDINGS,
  outcomeStillId,
  storyEnding,
  bookCoverage,
  CONCEPT_COVERAGE,
  MIN_CONCEPT_COVERAGE,
  conceptSpellings,
  fittingChoice,
  GREETINGS_SCENES,
  isStoryTeaserBook,
  matchesConcept,
  STORY_BOOKS,
  storyBookById,
  storyBookFor,
  storyStopIndexIn,
  storyTeaserConcepts,
  storyTeaserScenes,
  FAMILY_SCENES,
  STORY_BOOKS,
  STORY_TEASER_END,
  STORY_TEASER_SCENES,
} from "@workspace/story";

describe("the registry", () => {
  test("no two books claim the same zone", () => {
    const keys = STORY_BOOKS.map((b) => `${b.journey}:${b.zone}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("ids are unique and resolvable", () => {
    const ids = STORY_BOOKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of STORY_BOOKS) expect(storyBookById(b.id)).toBe(b);
  });

  test("the taste is journey 1 zone 1, and the family table is zone 2", () => {
    expect(storyBookFor(1, 1)?.scenes).toBe(GREETINGS_SCENES);
    expect(storyBookFor(1, 2)?.scenes).toBe(FAMILY_SCENES);
  });

  test("every journey 1 zone has a book, and journey 2 has none", () => {
    // INVERTED 2026-08-24. This used to assert that zone 6 had NO book, on the
    // measurement that not one Feelings concept reaches even twenty languages.
    // That measurement still holds and the book works around it: the photograph
    // book is ABOUT feelings and its LINES are "sorry", "congratulations",
    // "thank you" and "family", which the corpus does carry. The theme comes
    // from the pictures, which cost nothing per language.
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      expect(storyBookFor(1, zone), `zone ${zone} must have a book`).not.toBeNull();
    }
    // Journey 2 still has none, and not for want of writing: four of its six
    // categories hold zero phrase rows in every language.
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      expect(storyBookFor(2, zone)).toBeNull();
    }
  });

  test("a zone with no book is null, not an empty book", () => {
    // Journey 2 has four categories with no phrase rows at all, so it must read
    // as "no story stop here" rather than as a stop that opens onto nothing.
    expect(storyBookFor(2, 1)).toBeNull();
    expect(storyBookFor(9, 9)).toBeNull();
  });
});

describe("every book is playable", () => {
  for (const book of STORY_BOOKS) {
    test(`${book.id}: three choices a scene, exactly one of them fits`, () => {
      for (const scene of book.scenes) {
        expect(scene.choices).toHaveLength(3);
        expect(scene.choices.filter((c) => c.fits)).toHaveLength(1);
        expect(fittingChoice(scene)).not.toBeNull();
      }
    });

    test(`${book.id}: scene ids are unique and every next exists`, () => {
      const ids = book.scenes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const scene of book.scenes) {
        for (const choice of scene.choices) {
          if (choice.next === null) continue;
          expect(ids).toContain(choice.next);
        }
      }
    });

    test(`${book.id}: every scene is reachable from the start, and it ends`, () => {
      expect(book.scenes.map((s) => s.id)).toContain(book.startId);
      const seen = new Set<string>([book.startId]);
      const queue = [book.startId];
      while (queue.length) {
        const id = queue.shift();
        const scene = book.scenes.find((s) => s.id === id);
        for (const c of scene?.choices ?? []) {
          if (c.next && !seen.has(c.next)) {
            seen.add(c.next);
            queue.push(c.next);
          }
        }
      }
      expect(seen.size).toBe(book.scenes.length);
      // A book with no ending would loop a learner forever; the engine's cycle
      // guard would stop it, but silently and mid-story.
      expect(
        book.scenes.some((s) => s.choices.some((c) => c.next === null)),
      ).toBe(true);
    });

    test(`${book.id}: every choice carries a media rendering`, () => {
      for (const scene of book.scenes) {
        expect(scene.media.length).toBeGreaterThan(0);
        expect(scene.situation.trim().length).toBeGreaterThan(0);
      }
    });
  }
});

describe("every book names concepts the corpus actually carries", () => {
  // THE GUARD RAIL FOR 90 HAND-AUTHORED LINES. A book is only as wide as its
  // narrowest concept: name one word a language lacks and resolveScene()
  // returns null, the story stop vanishes in that language, and NOTHING FAILS.
  // Nobody would find out until a learner did.
  //
  // This replaced a literal list of the eight concepts shared by all 22
  // languages. That list was right for one book and became a straitjacket for
  // six: the owner set the floor at 18 languages on 2026-08-24 precisely so the
  // books could use "how much is this?", "congratulations" and "sorry", none of
  // which reach 22.
  for (const book of STORY_BOOKS) {
    test(`${book.id}: every concept is in the measured corpus`, () => {
      for (const concept of bookConcepts(book)) {
        const n = CONCEPT_COVERAGE[concept.trim().toLowerCase()];
        expect(
          n,
          `${book.id} names "${concept}", which is not in CONCEPT_COVERAGE at all`,
        ).toBeDefined();
        expect(
          n,
          `${book.id} names "${concept}", carried by only ${n} languages`,
        ).toBeGreaterThanOrEqual(MIN_CONCEPT_COVERAGE);
      }
    });
  }

  test("every book runs in at least the floor, and says how many", () => {
    for (const book of STORY_BOOKS) {
      const n = bookCoverage(bookConcepts(book));
      expect(n).toBeGreaterThanOrEqual(MIN_CONCEPT_COVERAGE);
      expect(n).toBeLessThanOrEqual(22);
    }
  });

  test("the free-taste book is the WIDEST, because it is the shop window", () => {
    // A taste that is missing in a language is worse than no stop at all: it is
    // the first thing a Free learner meets. It need not be all 22, since the
    // corpus cannot offer a funny book at 22, but nothing may be narrower.
    const taste = bookCoverage(bookConcepts(storyBookFor(1, 1)!));
    for (const book of STORY_BOOKS) {
      expect(bookCoverage(bookConcepts(book))).toBeLessThanOrEqual(taste);
    }
  });
});

describe("every consequence is authored", () => {
  // The outcome IS the game. A choice without one shows the setup picture again
  // and reads as a broken tap rather than a missing asset.
  for (const book of STORY_BOOKS) {
    test(`${book.id}: all fifteen choices carry an outcome`, () => {
      for (const scene of book.scenes) {
        for (const choice of scene.choices) {
          expect(
            choice.outcome?.situation,
            `${book.id} ${scene.id} "${choice.concept}" has no consequence`,
          ).toBeTruthy();
        }
      }
    });
  }

  test("no two choices in one scene share a consequence", () => {
    // Two identical outcomes means two identical pictures, and the branch is
    // invisible again for that pair.
    for (const book of STORY_BOOKS) {
      for (const scene of book.scenes) {
        const outcomes = scene.choices.map((c) => c.outcome?.situation);
        expect(new Set(outcomes).size).toBe(outcomes.length);
      }
    }
  });
});

describe("the concept aliases", () => {
  test("father also answers to Dad, and mother to Mom", () => {
    // Gujarati is the ONE language of twenty-two that writes these as "Dad" and
    // "Mom", and it is the flagship. Without this the family book skips two of
    // its five scenes in the language the app is named after.
    expect(conceptSpellings("father")).toContain("dad");
    expect(conceptSpellings("mother")).toContain("mom");
    // Build 25, measured against production: the greetings book's first page
    // blanked for paying Gujarati accounts because the corpus writes these
    // ideas differently; and kal means both tomorrow and yesterday, which is
    // why three languages card them as the pair.
    expect(conceptSpellings("how much is this?")).toContain("how much is it?");
    expect(conceptSpellings("sorry")).toContain("sorry / excuse me");
    expect(conceptSpellings("tomorrow")).toContain("tomorrow / yesterday");
    expect(conceptSpellings("goodbye")).toContain("bye");
    expect(conceptSpellings("congratulations")).toContain("congratulations / best wishes");
    expect(matchesConcept("sorry", " Sorry / Excuse me ")).toBe(true);
    expect(matchesConcept("how much is this?", "How much is it?")).toBe(true);
    expect(matchesConcept("father", "Dad")).toBe(true);
    expect(matchesConcept("mother", " Mom ")).toBe(true);
  });

  test("the canonical spelling comes first and still matches", () => {
    expect(conceptSpellings("father")[0]).toBe("father");
    expect(matchesConcept("father", "Father")).toBe(true);
  });

  test("an alias does not make unrelated concepts equal", () => {
    expect(matchesConcept("father", "mother")).toBe(false);
    expect(matchesConcept("water", "salt")).toBe(false);
  });

  test("a concept with no alias is just itself", () => {
    // STILL THE LITERAL LIST, and now deliberately NOT the whole answer.
    // conceptSpellings enumerates the aliases; the matching RULES added on
    // 2026-09-15 cannot be enumerated (no finite list derives "rice, a meal"
    // from "rice"), so matchesConcept is what decides a lookup and the server
    // stopped prefiltering its query on this list the same day.
    expect(conceptSpellings("water")).toEqual(["water"]);
    expect(matchesConcept("water", "the water")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The matching RULES, added 2026-09-15 after a census of all six repos' seed
// content. The old literal list was written against India's gloss wording;
// every fork inherited it and words the same ideas differently, so a concept
// the corpus plainly teaches read as ABSENT and the storybook skipped a scene
// the language could have drawn. Each case below names the fork whose content
// motivated the rule, and each rejection names the near-miss it refuses.
describe("the matching rules, and what they refuse", () => {
  test("a clause of a two-gloss row names the concept", () => {
    // Africa (5 langs), SEA (6) and LATAM (1) all card the apology with a
    // COMMA where the literal list only held the slash form. That one comma
    // cost Africa 30 scene-language pairs.
    expect(matchesConcept("sorry", "Sorry, excuse me")).toBe(true);
    // East writes every one of its ten languages this way.
    expect(matchesConcept("rice", 'Rice, and also "a meal"')).toBe(true);
    expect(matchesConcept("rice", "Rice, and also a meal")).toBe(true);
    // Africa: ha, yo, zu. " or " is a separator; " and " is not.
    expect(matchesConcept("rice", "rice or a meal")).toBe(true);
    expect(matchesConcept("grandson", "grandson, or nephew")).toBe(true);
    // India: Malayalam's plate, Dogri's bowl, Sanskrit's rice.
    expect(matchesConcept("plate", "plate / dish")).toBe(true);
    expect(matchesConcept("bowl", "cup / bowl")).toBe(true);
    expect(matchesConcept("rice", "food; rice")).toBe(true);
    // THE OTHER HALF OF THE kal ROW, which was already an alias for tomorrow
    // and had never resolved yesterday. Worth 8 pairs in India's seed, and
    // safe because no scene names tomorrow and yesterday together.
    expect(matchesConcept("yesterday", "tomorrow / yesterday")).toBe(true);
    expect(matchesConcept("tomorrow", "tomorrow / yesterday")).toBe(true);
  });

  test("a bracketed qualifier says which one, not which thing", () => {
    // East, all ten languages, and SEA and LATAM alongside them.
    expect(matchesConcept("father-in-law", "father-in-law (wife's father)")).toBe(true);
    expect(matchesConcept("grandfather", "grandfather (mother's father)")).toBe(true);
    // SEA: Thai's register pair, Khmer's speaker-gender pair.
    expect(matchesConcept("sorry", "Sorry (polite)")).toBe(true);
    expect(matchesConcept("yes", "Yes (said by men)")).toBe(true);
  });

  test("an article points at the thing without naming another", () => {
    // Europe, and French is most of the reason: it cards its nouns with the
    // article attached where the other twenty-one card them bare.
    expect(matchesConcept("bowl", "a bowl")).toBe(true);
    expect(matchesConcept("spoon", "a spoon")).toBe(true);
    expect(matchesConcept("rice", "some rice")).toBe(true);
    expect(matchesConcept("night", "The night")).toBe(true);
    expect(matchesConcept("grandfather", "my grandfather")).toBe(true);
    expect(matchesConcept("family", "my family")).toBe(true);
  });

  test("a trailing register tag says who is speaking, not what", () => {
    // Europe: bg, it and lt tag the register rather than writing it twice.
    expect(matchesConcept("hello", "Hello politely")).toBe(true);
    expect(matchesConcept("please", "please formal")).toBe(true);
    expect(matchesConcept("sorry", "sorry male")).toBe(true);
    expect(matchesConcept("good morning", "Good morning madam")).toBe(true);
    expect(matchesConcept("thank you", "thank you kindly")).toBe(true);
    // SEA (km) and Africa (sw) both label the greeting as a greeting.
    expect(matchesConcept("good morning", "Good morning greeting")).toBe(true);
    // ONE tag, not a tail of them: an intensified phrase is a different phrase.
    expect(matchesConcept("thank you", "thank you very much man")).toBe(false);
  });

  test("the rules compose, because the corpus stacks them", () => {
    expect(matchesConcept("good morning", "Good morning, grandma")).toBe(true);
    expect(matchesConcept("spoon", "The spoon polite")).toBe(true);
    expect(matchesConcept("good news", "Good news!")).toBe(true);
  });

  // THE REFUSALS. Every one of these is a real row in a real fork's seed that
  // a looser rule would have swallowed, and each would have put two of one
  // board's three lines on the same phrase, or the wrong line on the board.
  test("a shared word is not a match", () => {
    expect(matchesConcept("rice", "price")).toBe(false);
    expect(matchesConcept("rice", "prices")).toBe(false);
    expect(matchesConcept("father", "grandfather")).toBe(false);
    // The hyphen is not a clause separator, which is the whole reason
    // father-in-law does not resolve `father`. table-3 and thali-2 both rely
    // on it.
    expect(matchesConcept("father", "father-in-law")).toBe(false);
    expect(matchesConcept("son", "son-in-law")).toBe(false);
  });

  test("a narrowing compound names a different thing", () => {
    // SEA, Africa and East all card "fried rice", and it is not the rice the
    // thali scene hands over. No general rule separates a qualifier that
    // narrows from a compound that replaces, so none is attempted.
    expect(matchesConcept("rice", "fried rice")).toBe(false);
    expect(matchesConcept("rice", "rice porridge")).toBe(false);
    expect(matchesConcept("rice", "coconut rice")).toBe(false);
    // Serbian's row says so in its own hint: кашка is the diminutive, a
    // teaspoon. "small bowl" IS allowed, as a named literal, because a katori
    // is the vessel the thali scene uses. Reading the row is what tells them
    // apart, which is why one is a literal and neither is a rule.
    expect(matchesConcept("spoon", "Spoon small")).toBe(false);
    expect(matchesConcept("bowl", "Small bowl")).toBe(true);
  });

  test("two ideas never collapse onto one concept", () => {
    // photo-3 puts good night and good morning on one board, and yard-3 uses
    // `night` to answer when you are leaving. Three distinct lines.
    expect(matchesConcept("night", "good night")).toBe(false);
    expect(matchesConcept("night", "at night")).toBe(false);
    expect(matchesConcept("good night", "good morning")).toBe(false);
    // door-5 and thali-5 use `welcome` as the ARRIVAL greeting: their outcomes
    // swing the gate open again and sit down to eat with you. The reply to
    // thanks is a different line, and Europe seeds it in nine languages.
    expect(matchesConcept("welcome", "you are welcome")).toBe(false);
    expect(matchesConcept("welcome", "you're welcome")).toBe(false);
    // Adding a subject and a verb makes a sentence, and the 2026-08-30 note
    // already refuses sentences as aliases. This is the conservative call and
    // it costs Europe's j1z5-courtyard in Bulgarian, which is reported rather
    // than quietly recovered.
    expect(matchesConcept("sorry", "I am sorry")).toBe(false);
  });

  test("hello answers to Hi, the way goodbye already answered to Bye", () => {
    // Eight of Europe's twenty-two card the greeting only as "Hi": Polish
    // "Cześć", Bosnian "Ćao", Croatian "Bok", Czech "Ahoj", Estonian "Tere",
    // Hungarian "Szia", Latvian "Sveiki", Lithuanian "Labas".
    expect(matchesConcept("hello", "Hi")).toBe(true);
    expect(matchesConcept("goodbye", "Bye")).toBe(true);
    // Not every short greeting, though: these are separate rows and separate
    // ideas, and yard-5 puts hello and goodbye on one board.
    expect(matchesConcept("hello", "Bye")).toBe(false);
    expect(matchesConcept("goodbye", "Hi")).toBe(false);
    expect(matchesConcept("hello", "Good day")).toBe(false);
  });

  test("the fork wordings that motivated each rule", () => {
    // One case per fork, named, so a fork that renarrows a rule sees whose
    // content it broke.
    // INDIA, Gujarati: the katori, and the kal row's other half.
    expect(matchesConcept("bowl", "Small bowl")).toBe(true);
    expect(matchesConcept("yesterday", "tomorrow / yesterday")).toBe(true);
    // SEA, Thai: 30 pairs to one comma, and rice in eight of ten languages.
    expect(matchesConcept("sorry", "Sorry, excuse me")).toBe(true);
    expect(matchesConcept("rice", 'Rice, and also "a meal"')).toBe(true);
    // EAST, all ten: the bracketed relation.
    expect(matchesConcept("grandfather", "Grandfather (father's father)")).toBe(true);
    // AFRICA: the side qualifier with no bracket, and the knife by its job.
    expect(matchesConcept("grandfather", "Grandfather fathers side")).toBe(true);
    expect(matchesConcept("grandfather", "Grandfather fatherside")).toBe(true);
    expect(matchesConcept("knife", "Table knife")).toBe(true);
    expect(matchesConcept("grandson", "grandson or nephew")).toBe(true);
    // EUROPE, French: the article, which is its whole holding of five concepts.
    expect(matchesConcept("plate", "a plate")).toBe(true);
    expect(matchesConcept("salt", "some salt")).toBe(true);
    // LATAM: the exclamation mark, in five of six languages.
    expect(matchesConcept("good news", "Good news!")).toBe(true);
  });
});

describe("the free taste", () => {
  test("it is the WHOLE zone 1 book, and nothing from any other", () => {
    // Widened from one scene on 2026-08-24. One scene never reached the
    // finished book, which is the only screen that shows what is being sold:
    // your choices become a book you keep. A taste that stops before the point
    // is made is a smaller ask, not a cheaper one.
    const taste = storyBookFor(1, 1)!;
    const paid = storyBookFor(1, 2)!;
    expect(STORY_TEASER_SCENES).toBe(taste.scenes.length);
    expect(isStoryTeaserBook(taste)).toBe(true);
    expect(isStoryTeaserBook(paid)).toBe(false);
    expect(storyTeaserScenes(taste)).toHaveLength(taste.scenes.length);
    expect(storyTeaserScenes(paid)).toHaveLength(0);
  });

  test("finishing the taste still leaves FIVE of the six books shut", () => {
    // This replaces "the taste is only part of one book", which could not
    // survive the widening. The unit of the taste is now a BOOK, so this is
    // what stops it quietly becoming a free game: the giveaway is one sixth of
    // the library, and the other five open nothing at all without paying.
    const taste = storyBookFor(1, 1)!;
    expect(storyTeaserConcepts(taste)).toEqual(bookConcepts(taste));
    const shut = STORY_BOOKS.filter((b) => !isStoryTeaserBook(b));
    expect(shut).toHaveLength(5);
    for (const book of shut) expect(storyTeaserConcepts(book)).toEqual([]);
  });

  test("a paid book offers no concepts to a caller who has not paid", () => {
    expect(storyTeaserConcepts(storyBookFor(1, 2)!)).toEqual([]);
  });

  test("the end-of-taste beat says the story is unfinished, not that it failed", () => {
    expect(STORY_TEASER_END.title).toMatch(/story/i);
    expect(STORY_TEASER_END.cta).toMatch(/subscribe/i);
    // Copy canon: "All-Access", never "Plus". And no em dashes, anywhere.
    const all = Object.values(STORY_TEASER_END).join(" ");
    expect(all).not.toMatch(/Plus/);
    expect(all).not.toMatch(/—/);
  });
});

describe("bookConcepts", () => {
  test("deduplicates, so one query fetches the whole book's vocabulary", () => {
    // Deduplication is the property under test, not how much a given book
    // happens to repeat itself. A book whose fifteen slots are fifteen
    // different words is legitimate; two slots naming the same word must still
    // produce one entry, which is what makes the corpus lookup a single query.
    for (const book of STORY_BOOKS) {
      const concepts = bookConcepts(book);
      expect(new Set(concepts).size).toBe(concepts.length);
      const slots = book.scenes.flatMap((sc) => sc.choices).length;
      expect(concepts.length).toBeLessThanOrEqual(slots);
    }
    const repeated = bookConcepts(storyBookFor(1, 1)!);
    expect(repeated.length).toBeLessThan(
      storyBookFor(1, 1)!.scenes.flatMap((sc) => sc.choices).length,
    );
  });
});

describe("where the story stop sits", () => {
  // THE TASTES SIT AT STOPS 2 AND 3, tracing then story, in every language.
  // Straight after the tracing row IS stop 3, so zone 1 needs no rule of its
  // own and the general one covers it.
  //
  // IT WENT TO STOP 4 AND CAME BACK on 2026-08-24, and the round trip is worth
  // recording because the wording will recur. "Move the story right after stop
  // 3" was read as position FOUR and built that way; the owner then said the
  // tastes belong on "stops 2 and 3 respectively", which is where it started.
  test("journey 1 zone 1 puts it straight after the tracing stop, at stop 3", () => {
    expect(storyStopIndexIn(11, 1, 1, 1)).toBe(2);
    // Every other zone follows the same rule; none has a special case.
    expect(storyStopIndexIn(11, 1, 4, 5)).toBe(6);
  });

  test("it follows the tracing stop in every other zone too", () => {
    expect(storyStopIndexIn(11, 1, 4, 5)).toBe(6);
    expect(storyStopIndexIn(9, 2, 3, 4)).toBe(5);
  });

  test("with no tracing stop it takes that position instead", () => {
    // An unauthored script has no tracing stop at all. The taste must stay
    // reachable rather than sliding to stop 2 of nothing.
    // Zone 1 has its own rule and is asserted above; this covers the rest.
    expect(storyStopIndexIn(11, 1, 4, null)).toBe(5);
  });

  test("it never runs past the end of the row list", () => {
    expect(storyStopIndexIn(2, 1, 1, 1)).toBe(2);
    expect(storyStopIndexIn(1, 1, 1, 0)).toBe(1);
    expect(storyStopIndexIn(0, 1, 1, 0)).toBe(0);
  });

  test("it is never the very first stop", () => {
    // A journey map that opens on "read a story" before the learner has said a
    // word reads as the wrong app, which is the same rule tracing already has.
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      expect(storyStopIndexIn(8, 1, zone, null)).toBeGreaterThan(0);
      expect(storyStopIndexIn(8, 1, zone, 1)).toBeGreaterThan(0);
    }
  });
});

// ─── Endings, and the words that match book 1's new art ──────────────────────
//
// Added 2026-09-16 with the mad-lib ruling (owner: "it seems boring"). Every
// assertion here guards a filename or a brief, and both fail SILENTLY in the
// app: a wrong id is an image that never loads, and the page is built so that
// a missing image leaves nothing behind.
describe("ending pictures", () => {
  test("every book's scene ids share the prefix its ending stills are named from", () => {
    const prefixes = STORY_BOOKS.map((b) => bookScenePrefix(b));
    expect(prefixes).toEqual(["door", "table", "chai", "thali", "yard", "photo"]);
    for (const book of STORY_BOOKS) {
      const prefix = bookScenePrefix(book);
      for (const scene of book.scenes) {
        expect(scene.id, `${book.id} ${scene.id}`).toMatch(new RegExp(`^${prefix}-\\d+$`));
      }
    }
  });

  test("stills are served from story/madlib, never the old story/ names (2026-09-16)", () => {
    // Phones already installed fetch /story/<id>.webp with their OLD words
    // bundled. New art under those names would put new pictures beside old
    // narration on every one of them, so the new clients read a new directory.
    expect(STORY_ART_DIR).toBe("story/madlib");
    expect(storyStillPath("door--end-chaos")).toBe("story/madlib/door--end-chaos.webp");
  });

  test("an ending still is named <prefix>--end-<kind> and never collides with a scene or outcome", () => {
    expect(endingStillId("door", "perfect")).toBe("door--end-perfect");
    expect(endingStillId("door", "chaos")).toBe("door--end-chaos");
    expect(endingStillId("door", "disaster")).toBe("door--end-disaster");
    const taken = new Set(
      STORY_BOOKS.flatMap((b) =>
        b.scenes.flatMap((sc) => [
          sc.id,
          ...sc.choices.map((c) => outcomeStillId(sc.id, c.concept)),
        ]),
      ),
    );
    for (const book of STORY_BOOKS) {
      for (const kind of ["perfect", "chaos", "disaster"] as const) {
        expect(taken.has(endingStillId(bookScenePrefix(book), kind))).toBe(false);
      }
    }
  });

  test("every book has ending art, and a book without it would answer null rather than a picture", () => {
    // INVERTED 2026-09-16: this pinned that only book 1 had endings. Books 2 to
    // 6 were rewritten with new art the same day and all carry three endings
    // now, each with its own words. OPTIONAL PER BOOK still holds in the type:
    // a book whose endings were never drawn must not request three stills that
    // do not exist, so that half is kept against a copy with none.
    const withEndings = STORY_BOOKS.filter((b) => b.endings).map((b) => b.id);
    expect(withEndings).toEqual(STORY_BOOKS.map((b) => b.id));
    for (const book of STORY_BOOKS) {
      const briefs = Object.values(book.endings!).map((e) => e.situation);
      expect(new Set(briefs).size, book.id).toBe(3);
    }
    const entry = { sceneId: "table-1", concept: "water", fitted: true };
    const table = storyBookFor(1, 2)!;
    expect(storyEnding({ ...table, endings: undefined }, [entry])).toBeNull();
    expect(storyEnding(table, [entry])?.stillId).toBe("table--end-perfect");
  });

  test("book 1's ending follows the read", () => {
    const book = storyBookFor(1, 1)!;
    const read = (...fits: boolean[]) =>
      fits.map((fitted, i) => ({ sceneId: `door-${i + 1}`, concept: "x", fitted }));
    expect(storyEnding(book, read(true, true, true, true, true))).toEqual({
      kind: "perfect",
      stillId: "door--end-perfect",
      situation: GREETINGS_ENDINGS.perfect.situation,
    });
    expect(storyEnding(book, read(false, true, false, true, true))?.stillId).toBe(
      "door--end-chaos",
    );
    expect(storyEnding(book, read(false, false, false, true, true))?.stillId).toBe(
      "door--end-disaster",
    );
    // Three different pictures need three different briefs, or the alt text
    // says the same thing over three different jokes.
    const briefs = Object.values(GREETINGS_ENDINGS).map((e) => e.situation);
    expect(new Set(briefs).size).toBe(3);
  });
});

describe("book 1's words match its new art (2026-09-16)", () => {
  // ONLY THE WORDS MOVED. The concepts were checked against every language's
  // corpus, so this pins the whole graph as it stood before the rewrite: a
  // change to any concept, fit or next here is a change to which languages can
  // play this book, and must be made on purpose.
  test("concepts, fits and next are exactly what they were", () => {
    const book = storyBookFor(1, 1)!;
    const graph = book.scenes.map((sc) => [
      sc.id,
      sc.choices.map((c) => `${c.concept}|${c.fits}|${c.next}`),
    ]);
    expect(graph).toEqual([
      ["door-1", ["good morning|true|door-2", "goodbye|false|door-2", "how much is this?|false|door-2"]],
      ["door-2", ["yes|true|door-3", "tomorrow|false|door-3", "congratulations|false|door-3"]],
      ["door-3", ["water|true|door-4", "how much is this?|false|door-4", "fork|false|door-4"]],
      ["door-4", ["thank you|true|door-5", "sorry|false|door-5", "father-in-law|false|door-5"]],
      ["door-5", ["good night|true|null", "good morning|false|null", "welcome|false|null"]],
    ]);
  });

  test("door-3's setup has not started pouring", () => {
    // The "water" outcome IS the pour, so a setup already pouring leaves that
    // punchline nothing to show. INVERTED 2026-09-16 the same day: the text is
    // read aloud, so it is prose now and no longer carries the illustrator's
    // "NOT pouring yet"; the setup holds the jug and asks instead.
    const door3 = storyBookFor(1, 1)!.scenes.find((sc) => sc.id === "door-3")!;
    expect(door3.situation).toMatch(/hugs a big clay jug/);
    expect(door3.situation).not.toMatch(/\bpour/i);
    // Nothing an illustrator was told may reach the narrator. Every book and
    // every line is now checked in the describe below.
  });
});

describe("no book narrates the illustrator's prompts (2026-09-16)", () => {
  // EXTENDED 2026-09-16 from book 1's setups to every line of every book, when
  // books 2 to 6 were rewritten from the same kind of commissioned file. The
  // narrator reads setups, outcomes and endings aloud, and each brief sat right
  // beside the prose it was copied from, so one wrong field reaches a learner's
  // ears as "the viewer" or "Setting: INSIDE".
  test("no setup, outcome or ending contains prompt vocabulary", () => {
    for (const book of STORY_BOOKS) {
      const lines = [
        ...book.scenes.flatMap((sc) => [
          [sc.id, sc.situation],
          ...sc.choices.map((c) => [`${sc.id} ${c.concept}`, c.outcome.situation]),
        ]),
        ...Object.entries(book.endings ?? {}).map(([k, e]) => [`end-${k}`, e.situation]),
      ];
      expect(lines.length, book.id).toBe(23);
      for (const [where, text] of lines) {
        expect(text, `${book.id} ${where}`).not.toMatch(/viewer|NOT |Setting:/);
      }
    }
  });
});

describe("books 2 to 6: only the words moved (2026-09-16)", () => {
  // The same pin as book 1's above, for the same reason: every concept was
  // checked against every language's corpus, so a changed concept, fit or next
  // silently changes which languages can play the book. Taken from the source
  // as it stood BEFORE the rewrite.
  test.each([
    [
      2,
      [
        ["table-1", ["water|true|table-2", "how much is this?|false|table-2", "grandson|false|table-2"]],
        ["table-2", ["rice|true|table-3", "mother-in-law|false|table-3", "thursday|false|table-3"]],
        ["table-3", ["father|true|table-4", "son-in-law|false|table-4", "twenty|false|table-4"]],
        ["table-4", ["five|true|table-5", "one|false|table-5", "yesterday|false|table-5"]],
        ["table-5", ["family|true|null", "goodbye|false|null", "saturday|false|null"]],
      ],
    ],
    [
      3,
      [
        ["chai-1", ["four|true|chai-2", "twenty|false|chai-2", "how much is this?|false|chai-2"]],
        ["chai-2", ["five|true|chai-3", "one|false|chai-3", "sorry|false|chai-3"]],
        ["chai-3", ["one|true|chai-4", "nineteen|false|chai-4", "monday|false|chai-4"]],
        ["chai-4", ["how much is this?|true|chai-5", "twelve|false|chai-5", "thank you|false|chai-5"]],
        ["chai-5", ["thank you|true|null", "eight|false|null", "goodbye|false|null"]],
      ],
    ],
    [
      4,
      [
        ["thali-1", ["rice|true|thali-2", "knife|false|thali-2", "congratulations|false|thali-2"]],
        ["thali-2", ["bowl|true|thali-3", "water|false|thali-3", "father-in-law|false|thali-3"]],
        ["thali-3", ["salt|true|thali-4", "twenty|false|thali-4", "goodbye|false|thali-4"]],
        ["thali-4", ["spoon|true|thali-5", "plate|false|thali-5", "monday|false|thali-5"]],
        ["thali-5", ["no|true|null", "please|false|null", "welcome|false|null"]],
      ],
    ],
    [
      5,
      [
        ["yard-1", ["here|true|yard-2", "there|false|yard-2", "grandfather|false|yard-2"]],
        ["yard-2", ["yesterday|true|yard-3", "now|false|yard-3", "rice|false|yard-3"]],
        ["yard-3", ["tomorrow|true|yard-4", "night|false|yard-4", "twenty|false|yard-4"]],
        ["yard-4", ["please|true|yard-5", "sorry|false|yard-5", "congratulations|false|yard-5"]],
        ["yard-5", ["goodbye|true|null", "hello|false|null", "good news|false|null"]],
      ],
    ],
    [
      6,
      [
        ["photo-1", ["sorry|true|photo-2", "congratulations|false|photo-2", "rice|false|photo-2"]],
        ["photo-2", ["congratulations|true|photo-3", "sorry|false|photo-3", "how much is this?|false|photo-3"]],
        ["photo-3", ["good night|true|photo-4", "good morning|false|photo-4", "twenty|false|photo-4"]],
        ["photo-4", ["thank you|true|photo-5", "how much is this?|false|photo-5", "goodbye|false|photo-5"]],
        ["photo-5", ["family|true|null", "father-in-law|false|null", "thursday|false|null"]],
      ],
    ],
  ] as const)("zone %i's graph is exactly what it was", (zone, expected) => {
    const book = storyBookFor(1, zone)!;
    const graph = book.scenes.map((sc) => [
      sc.id,
      sc.choices.map((c) => `${c.concept}|${c.fits}|${c.next}`),
    ]);
    expect(graph).toEqual(expected);
  });
});
