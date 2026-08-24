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
  conceptSpellings,
  fittingChoice,
  GREETINGS_SCENES,
  isStoryTeaserBook,
  matchesConcept,
  storyBookById,
  storyBookFor,
  storyStopIndexIn,
  storyTeaserConcepts,
  storyTeaserScenes,
  STARTER_SCENES,
  STORY_BOOKS,
  STORY_TEASER_END,
  STORY_TEASER_SCENES,
} from "@workspace/story";

/** The eight concepts production carries in ALL twenty-two languages. */
const UNIVERSAL = [
  "good morning",
  "good night",
  "hello",
  "no",
  "please",
  "thank you",
  "water",
  "yes",
];

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
    expect(storyBookFor(1, 2)?.scenes).toBe(STARTER_SCENES);
  });

  test("a zone with no book is null, not an empty book", () => {
    // Feelings (zone 6) carries ZERO concepts shared by even twenty languages,
    // and journey 2 has four categories with no phrase rows at all. Both must
    // read as "no story stop here" rather than as a stop that opens on nothing.
    expect(storyBookFor(1, 6)).toBeNull();
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

describe("the greetings book is the one that must run everywhere", () => {
  test("it names ONLY concepts all twenty-two languages carry", () => {
    // Measured 2026-08-23. "how are you?" is missing in Marathi and "here" in
    // Kashmiri, so neither is allowed in the book behind the free taste: one
    // absent concept skips a whole scene, and a taste that is short in one
    // language is worse than no stop at all.
    const used = bookConcepts(storyBookFor(1, 1)!).map((c) => c.toLowerCase());
    for (const concept of used) expect(UNIVERSAL).toContain(concept);
  });

  test("it uses all eight of them, so nothing is authored and forgotten", () => {
    const used = bookConcepts(storyBookFor(1, 1)!).map((c) => c.toLowerCase());
    expect(new Set(used)).toEqual(new Set(UNIVERSAL));
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
  test("it is one scene, and only from the zone 1 book", () => {
    expect(STORY_TEASER_SCENES).toBe(1);
    const taste = storyBookFor(1, 1)!;
    const paid = storyBookFor(1, 2)!;
    expect(isStoryTeaserBook(taste)).toBe(true);
    expect(isStoryTeaserBook(paid)).toBe(false);
    expect(storyTeaserScenes(taste)).toHaveLength(1);
    expect(storyTeaserScenes(paid)).toHaveLength(0);
  });

  test("it serves exactly the first scene's three concepts", () => {
    const taste = storyBookFor(1, 1)!;
    const first = taste.scenes[0]!;
    expect(storyTeaserConcepts(taste)).toEqual(
      first.choices.map((c) => c.concept),
    );
    // The assertion that stops the taste quietly widening into a free game.
    expect(storyTeaserConcepts(taste).length).toBeLessThan(
      bookConcepts(taste).length,
    );
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
    const concepts = bookConcepts(storyBookFor(1, 2)!);
    expect(new Set(concepts).size).toBe(concepts.length);
    // Fifteen choice slots, fewer distinct concepts, which is the point.
    const slots = storyBookFor(1, 2)!.scenes.flatMap((s) => s.choices).length;
    expect(concepts.length).toBeLessThan(slots);
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
