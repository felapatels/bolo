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
    expect(conceptSpellings("water")).toEqual(["water"]);
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
  // Zone 1 reads: stop 1 the free phrase stop, stop 2 the tracing taste, stop 3
  // the story taste. The three free things sit together at the top of the map,
  // which is the whole reason the tracing stop was pinned to stop 2.
  test("journey 1 zone 1 puts it straight after the tracing stop", () => {
    expect(storyStopIndexIn(11, 1, 1, 1)).toBe(2);
  });

  test("it follows the tracing stop in every other zone too", () => {
    expect(storyStopIndexIn(11, 1, 4, 5)).toBe(6);
    expect(storyStopIndexIn(9, 2, 3, 4)).toBe(5);
  });

  test("with no tracing stop it takes that position instead", () => {
    // An unauthored script has no tracing stop at all. The taste must stay
    // reachable rather than sliding to stop 2 of nothing.
    expect(storyStopIndexIn(11, 1, 1, null)).toBe(1);
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
