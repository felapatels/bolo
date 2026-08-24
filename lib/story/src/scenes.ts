import type { Scene } from "./types";

/**
 * The starter scene graph.
 *
 * SMALL AND UNIVERSAL ON PURPOSE. Every concept below is one of the 38 that
 * exist in 20 or more of the 22 languages, measured against the production
 * corpus on 2026-08-23, so this graph runs everywhere rather than only in the
 * languages with the fullest phrasebook. That set is narrow, and its shape is
 * the reason this story is set at a family table: what all 22 languages share
 * is family words, the numbers one to twenty, and water, salt and spoon.
 *
 * A wider library is not blocked on more code, only on more concepts. When a
 * scene names one a language lacks, resolveScene() returns null and the caller
 * skips it, so scenes can be added freely and coverage varies per language
 * rather than the whole feature waiting for the thinnest corpus.
 *
 * BRANCHES CONVERGE. Three choices per scene, all three advance, and they rejoin
 * within a beat. That is the cheap half of the branch decision and it is
 * deliberate: a fully divergent graph is 300 authored story decisions times the
 * branch factor, which is human judgement that cannot be generated safely in 22
 * languages nobody here reads. The learner's book is still theirs, because it
 * records WHICH line they said at each beat, not a generated narrative.
 *
 * The media refs are placeholders. Tier 1 is a generated still, Tier 2 a silent
 * clip, Tier 3 a filmed speaker in one language. Nothing in the engine cares
 * which exists; it takes the richest it can use and falls back.
 */
export const STARTER_SCENES: readonly Scene[] = [
  {
    id: "table-1",
    situation:
      "A grandmother sets an empty steel tumbler in front of you at a family table and waits, smiling.",
    media: [{ tier: 1, ref: "scene/table-1/still", languageCode: null }],
    choices: [
      { concept: "water", next: "table-2", fits: true },
      { concept: "spoon", next: "table-2", fits: false },
      { concept: "twenty", next: "table-2", fits: false },
    ],
  },
  {
    id: "table-2",
    situation:
      "She fills the tumbler, then slides a small covered dish toward you and lifts the lid.",
    media: [{ tier: 1, ref: "scene/table-2/still", languageCode: null }],
    choices: [
      { concept: "salt", next: "table-3", fits: true },
      { concept: "water", next: "table-3", fits: false },
      { concept: "nine", next: "table-3", fits: false },
    ],
  },
  {
    id: "table-3",
    situation:
      "A man carrying a stack of plates stops beside her and looks at you, waiting to be introduced.",
    media: [{ tier: 1, ref: "scene/table-3/still", languageCode: null }],
    choices: [
      { concept: "father", next: "table-4", fits: true },
      { concept: "spoon", next: "table-4", fits: false },
      { concept: "three", next: "table-4", fits: false },
    ],
  },
  {
    id: "table-4",
    situation:
      "He sets the plates down and counts them out loud, then pauses on the last one and looks up.",
    media: [{ tier: 1, ref: "scene/table-4/still", languageCode: null }],
    choices: [
      { concept: "five", next: "table-5", fits: true },
      { concept: "salt", next: "table-5", fits: false },
      { concept: "wife", next: "table-5", fits: false },
    ],
  },
  {
    id: "table-5",
    situation:
      "Everyone sits. The grandmother raises her tumbler at the full table and waits for you to name what you are all part of.",
    media: [{ tier: 1, ref: "scene/table-5/still", languageCode: null }],
    choices: [
      { concept: "family", next: null, fits: true },
      { concept: "mother", next: null, fits: false },
      { concept: "water", next: null, fits: false },
    ],
  },
];

/** Where the starter book begins. */
export const STARTER_START_ID = "table-1";

/**
 * The greetings book: journey 1 zone 1, and the one every learner meets.
 *
 * ITS CONCEPTS ARE THE EIGHT THAT EXIST IN ALL TWENTY-TWO LANGUAGES, measured
 * against production 2026-08-23: good morning, good night, hello, yes, no,
 * please, thank you, water. Not "shared by twenty or more" like the family
 * book, but shared by every single one, because this is the book behind the
 * FREE TASTE and a taste that resolves to null in a language is worse than no
 * stop at all.
 *
 *   good morning  22    please     22
 *   good night    22    thank you  22
 *   hello         22    water      22
 *   no            22    yes        22
 *
 * Deliberately NOT used, though they read as greetings: "how are you?" is
 * missing in Marathi and "here" in Kashmiri. One absent concept skips a whole
 * scene, so the taste is built only from the concepts with no gap at all.
 *
 * The arc is one visit from the door to the gate, so the five beats are a
 * sequence rather than five unrelated flashcards, and each scene's distractors
 * are lines that would be ODD at that moment rather than wrong answers.
 */
export const GREETINGS_SCENES: readonly Scene[] = [
  {
    id: "door-1",
    situation:
      "An older neighbour opens her door into low morning light and looks up at you, waiting.",
    media: [{ tier: 1, ref: "scene/door-1/still", languageCode: null }],
    choices: [
      { concept: "good morning", next: "door-2", fits: true },
      { concept: "good night", next: "door-2", fits: false },
      { concept: "thank you", next: "door-2", fits: false },
    ],
  },
  {
    id: "door-2",
    situation:
      "She steps back and holds the door wide open with one hand, eyebrows raised at you.",
    media: [{ tier: 1, ref: "scene/door-2/still", languageCode: null }],
    choices: [
      { concept: "yes", next: "door-3", fits: true },
      { concept: "please", next: "door-3", fits: false },
      { concept: "good night", next: "door-3", fits: false },
    ],
  },
  {
    id: "door-3",
    situation:
      "Inside, she lifts a heavy jug over the empty steel tumbler in front of you and pauses there.",
    media: [{ tier: 1, ref: "scene/door-3/still", languageCode: null }],
    choices: [
      { concept: "water", next: "door-4", fits: true },
      { concept: "hello", next: "door-4", fits: false },
      { concept: "good night", next: "door-4", fits: false },
    ],
  },
  {
    id: "door-4",
    situation:
      "She sets the filled tumbler into both of your hands and keeps hold of it a moment longer.",
    media: [{ tier: 1, ref: "scene/door-4/still", languageCode: null }],
    choices: [
      { concept: "thank you", next: "door-5", fits: true },
      { concept: "please", next: "door-5", fits: false },
      { concept: "no", next: "door-5", fits: false },
    ],
  },
  {
    id: "door-5",
    situation:
      "The lamp above her gate is lit and the street behind you is dark. She raises a hand as you go.",
    media: [{ tier: 1, ref: "scene/door-5/still", languageCode: null }],
    choices: [
      { concept: "good night", next: null, fits: true },
      { concept: "good morning", next: null, fits: false },
      { concept: "hello", next: null, fits: false },
    ],
  },
];

/** Where the greetings book begins. */
export const GREETINGS_START_ID = "door-1";
