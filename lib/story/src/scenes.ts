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
