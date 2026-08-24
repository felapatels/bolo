import { describe, test, expect } from "vitest";
import {
  STARTER_SCENES,
  STARTER_START_ID,
  availableScenes,
  chooseScene,
  fittingChoice,
  mediaFor,
  orderChoices,
  playablePath,
  resolveScene,
  sceneAvailable,
  type Scene,
} from "@workspace/story";

// The story engine. Scene, choice, consequence, ledger.
//
// The engine is pure and the corpus lookup is passed in, so everything here
// runs with no database. `has` below stands in for "does this language teach a
// phrase meaning X", which in the app is a query and in here is a set.

/** A language that teaches the 38 concepts shared across the real corpus. */
const UNIVERSAL = new Set([
  "water", "salt", "spoon", "family", "mother", "father", "wife", "husband",
  "son", "daughter", "grandfather",
  "one", "two", "three", "four", "five", "nine", "twenty",
]);

const has = (_lang: string, concept: string) => UNIVERSAL.has(concept);
const hasNothing = () => false;

describe("the starter graph runs everywhere", () => {
  test("every concept it names is one the shared corpus actually carries", () => {
    // The constraint this graph was written under: 1,809 concepts exist across
    // the corpus but only 38 appear in 20 or more languages, so a scene naming
    // a rarer one silently would not exist in most languages.
    for (const scene of STARTER_SCENES) {
      for (const c of scene.choices) {
        expect(UNIVERSAL.has(c.concept), `${scene.id} names "${c.concept}"`).toBe(true);
      }
    }
  });

  test("exactly one line fits each scene", () => {
    for (const scene of STARTER_SCENES) {
      expect(scene.choices.filter((c) => c.fits), scene.id).toHaveLength(1);
      expect(fittingChoice(scene)?.concept, scene.id).toBeTruthy();
    }
  });

  test("three lines per scene, none of them repeated", () => {
    for (const scene of STARTER_SCENES) {
      expect(scene.choices, scene.id).toHaveLength(3);
      expect(new Set(scene.choices.map((c) => c.concept)).size, scene.id).toBe(3);
    }
  });

  test("every consequence points somewhere real, or ends the book", () => {
    const ids = new Set(STARTER_SCENES.map((s) => s.id));
    for (const scene of STARTER_SCENES) {
      for (const c of scene.choices) {
        if (c.next !== null) expect(ids.has(c.next), `${scene.id} -> ${c.next}`).toBe(true);
      }
    }
  });
});

describe("a language that cannot carry a scene is told so", () => {
  test("resolveScene returns null rather than a scene with a blank option", () => {
    const scene = STARTER_SCENES[0]!;
    expect(resolveScene(scene, "gu", has)).not.toBeNull();
    // Same shape traceStopFor uses for an unauthored script: null, not a stub.
    expect(resolveScene(scene, "zz", hasNothing)).toBeNull();
    expect(sceneAvailable(scene, "zz", hasNothing)).toBe(false);
  });

  test("availableScenes says how much of a library a language actually gets", () => {
    expect(availableScenes(STARTER_SCENES, "gu", has)).toHaveLength(STARTER_SCENES.length);
    expect(availableScenes(STARTER_SCENES, "zz", hasNothing)).toHaveLength(0);
    // One missing concept costs exactly the scenes that name it, not the library.
    const noSalt = (_l: string, c: string) => UNIVERSAL.has(c) && c !== "salt";
    const got = availableScenes(STARTER_SCENES, "xx", noSalt).map((s) => s.id);
    expect(got).not.toContain("table-2");
    expect(got).not.toContain("table-4");
    expect(got).toContain("table-1");
  });
});

describe("media resolves richest first, and never shows the wrong language", () => {
  const scene: Scene = {
    id: "m",
    situation: "x",
    media: [
      { tier: 1, ref: "still", languageCode: null },
      { tier: 2, ref: "clip", languageCode: null },
      { tier: 3, ref: "film-hi", languageCode: "hi" },
    ],
    choices: [{ concept: "water", next: null, fits: true }],
  };

  test("a filmed speaker wins in its own language", () => {
    expect(mediaFor(scene, "hi")?.ref).toBe("film-hi");
  });

  test("and is skipped in every other, falling back to the shared clip", () => {
    // The case the nullable languageCode exists for: a curated Tier 3 set sits
    // on top of a universal Tier 2 library without anything looking broken.
    expect(mediaFor(scene, "bn")?.ref).toBe("clip");
    expect(mediaFor(scene, "bn")?.tier).toBe(2);
  });

  test("a scene with nothing usable resolves to nothing", () => {
    const filmOnly: Scene = { ...scene, media: [{ tier: 3, ref: "f", languageCode: "hi" }] };
    expect(mediaFor(filmOnly, "bn")).toBeNull();
    expect(resolveScene(filmOnly, "bn", has)).toBeNull();
  });
});

describe("the board is shuffled but stable", () => {
  test("the fitting line is not always in the same slot", () => {
    // Otherwise the game is "press the middle one".
    const slots = new Set(
      STARTER_SCENES.map((s) => orderChoices(s, "gu").findIndex((c) => c.fits)),
    );
    expect(slots.size).toBeGreaterThan(1);
  });

  test("the same learner sees the same board twice", () => {
    // A reshuffle on return would make their memory of the board useless, and
    // a bug report's screenshot unreproducible.
    const a = orderChoices(STARTER_SCENES[0]!, "gu").map((c) => c.concept);
    const b = orderChoices(STARTER_SCENES[0]!, "gu").map((c) => c.concept);
    expect(a).toEqual(b);
  });

  test("shuffling loses nothing", () => {
    for (const s of STARTER_SCENES) {
      expect(orderChoices(s, "hi").map((c) => c.concept).sort())
        .toEqual(s.choices.map((c) => c.concept).sort());
    }
  });
});

describe("the choice moves the story and writes the book", () => {
  test("a line that does not fit still advances, and is still recorded", () => {
    // The whole difference between this and a quiz: a line that does not fit is
    // not a buzzer, it is a different thing to have said.
    const scene = STARTER_SCENES[0]!;
    const wrong = scene.choices.find((c) => !c.fits)!;
    const taken = chooseScene(scene, wrong.concept)!;
    expect(taken.next).not.toBeNull();
    expect(taken.entry).toEqual({
      sceneId: scene.id,
      concept: wrong.concept,
      fitted: false,
    });
  });

  test("a concept that is not on the board is refused", () => {
    expect(chooseScene(STARTER_SCENES[0]!, "aeroplane")).toBeNull();
  });

  test("playing the fitting line end to end writes the whole book", () => {
    const book = playablePath(
      STARTER_SCENES,
      STARTER_START_ID,
      "gu",
      has,
      (r) => fittingChoice(r.scene)!.concept,
    );
    expect(book).toHaveLength(STARTER_SCENES.length);
    expect(book.every((e) => e.fitted)).toBe(true);
    expect(book.map((e) => e.concept)).toEqual([
      "water", "salt", "father", "five", "family",
    ]);
  });

  test("playing badly writes just as long a book, and says so", () => {
    const book = playablePath(
      STARTER_SCENES,
      STARTER_START_ID,
      "gu",
      has,
      (r) => r.choices.find((c) => !c.fits)!.concept,
    );
    expect(book).toHaveLength(STARTER_SCENES.length);
    expect(book.every((e) => e.fitted)).toBe(false);
  });

  test("a loop in the graph cannot hang the client", () => {
    // A hand-authored branching graph grows one the first time two
    // consequences point at each other.
    const loop: Scene[] = [
      { id: "a", situation: "", media: [{ tier: 1, ref: "r", languageCode: null }],
        choices: [{ concept: "water", next: "b", fits: true }] },
      { id: "b", situation: "", media: [{ tier: 1, ref: "r", languageCode: null }],
        choices: [{ concept: "salt", next: "a", fits: true }] },
    ];
    const book = playablePath(loop, "a", "gu", has, (r) => r.choices[0]!.concept);
    expect(book).toHaveLength(2);
  });
});
