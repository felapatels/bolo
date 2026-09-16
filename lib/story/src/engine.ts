import type {
  LedgerEntry,
  ResolvedScene,
  Scene,
  SceneChoice,
  SceneMedia,
} from "./types";

/**
 * Best available rendering of a scene for one language.
 *
 * Richest first, then down. A filmed Tier 3 in the learner's own language wins;
 * a filmed one in somebody ELSE'S language is skipped rather than shown, which
 * is the case the nullable languageCode exists for. Below that the shared clip,
 * then the shared still.
 *
 * Falling back rather than failing is what lets a curated Tier 3 set exist at
 * all: a scene filmed in Hindi and nowhere else still renders in Bengali, from
 * the same clip everyone else sees, and nothing looks broken.
 */
export function mediaFor(scene: Scene, languageCode: string): SceneMedia | null {
  const usable = scene.media.filter(
    (m) => m.languageCode === null || m.languageCode === languageCode,
  );
  if (usable.length === 0) return null;
  return usable.reduce((best, m) => (m.tier > best.tier ? m : best));
}

/**
 * Whether a language can be shown this scene at all.
 *
 * Every choice's concept has to exist in that language's corpus, or the learner
 * would be offered a blank option. `has` is supplied by the caller because the
 * corpus lives in the database and this library stays pure.
 */
export function sceneAvailable(
  scene: Scene,
  languageCode: string,
  has: (languageCode: string, concept: string) => boolean,
): boolean {
  if (mediaFor(scene, languageCode) === null) return false;
  return scene.choices.every((c) => has(languageCode, c.concept));
}

/**
 * A scene ready to render, or null when this language cannot carry it.
 *
 * Null rather than a partial scene, for the reason traceStopFor() returns null
 * for an unauthored script: a stop that opens onto two of its three options
 * reads as broken rather than short, and the caller can simply move on.
 */
export function resolveScene(
  scene: Scene,
  languageCode: string,
  has: (languageCode: string, concept: string) => boolean,
): ResolvedScene | null {
  const media = mediaFor(scene, languageCode);
  if (!media) return null;
  if (!scene.choices.every((c) => has(languageCode, c.concept))) return null;
  return { scene, media, choices: orderChoices(scene, languageCode) };
}

/**
 * The three lines in the order they are shown.
 *
 * SHUFFLED, DETERMINISTICALLY. Authored order would put the fitting line in the
 * same slot every time and the game would be "press the middle one". Seeded on
 * the scene id and the language so a learner who backs out and returns sees the
 * same board rather than a reshuffle that makes their memory of it useless, and
 * so a screenshot in a bug report is reproducible.
 */
export function orderChoices(scene: Scene, languageCode: string): SceneChoice[] {
  const out = [...scene.choices];
  let seed = 2166136261;
  for (const ch of `${scene.id}:${languageCode}`) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  // Fisher-Yates against the seeded stream, so the permutation is a pure
  // function of the scene and language.
  for (let i = out.length - 1; i > 0; i--) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const j = seed % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** The line that fits, which is the one the story is written around. */
export function fittingChoice(scene: Scene): SceneChoice | null {
  return scene.choices.find((c) => c.fits) ?? null;
}

/**
 * Where the story goes when a scene is SKIPPED rather than played.
 *
 * WHY A SKIPPED SCENE NEEDS AN EXIT AT ALL. Until 2026-09-15 a scene this
 * language could not carry ENDED THE READER'S VISIT: resolveScene returned
 * null and both clients drew a full-screen "This story is not ready in <your
 * language> yet" with a Back button and nothing else on it. The owner hit that
 * on a TestFlight build, on the SEA fork in Tagalog, opening a story stop the
 * map had offered them: "this isn't ok". A scene the corpus cannot carry is
 * now stepped over, and stepping over one means knowing where it would have
 * gone. A skipped scene has no chosen line to take that from.
 *
 * ALL SIX BOOKS CONVERGE, which is checked by a test rather than assumed: every
 * choice in a scene points at the same next beat, so the exit is unambiguous
 * today. The FITTING line's next is taken so that an author who later diverges
 * the graph gets the honest answer, since that is the line the story is written
 * around.
 */
export function sceneExit(scene: Scene): string | null {
  const fitting = fittingChoice(scene);
  if (fitting) return fitting.next;
  return scene.choices[0]?.next ?? null;
}

/**
 * The first scene from `startId` onward that this language can actually be
 * shown, or null when none of them can.
 *
 * THIS IS THE ONE ANSWER BOTH CLIENTS ASK FOR, and it replaces each of them
 * calling resolveScene on whichever scene id they happened to be holding. A
 * client that calls resolveScene directly gets null and has nowhere to go with
 * it, which is exactly the dead end described on sceneExit above.
 *
 * NULL STILL MEANS SOMETHING, and it means the honest thing now: not one scene
 * of this book can be drawn in this language. That is the only case where
 * "this story is not ready in your language yet" is a true sentence, and
 * against India's seeded corpus on 2026-09-15 it is true for NO book in ANY of
 * the 22 languages: every one of the 132 book-and-language pairs carries at
 * least one playable scene, and 59 of them carry between one and four.
 *
 * The cycle guard is the same one playablePath carries, for the same reason: a
 * hand-authored graph grows a loop the first time two consequences point at
 * each other, and a loop here would hang the client rather than fail a test.
 */
export function firstPlayableScene(
  scenes: readonly Scene[],
  startId: string | null,
  languageCode: string,
  has: (languageCode: string, concept: string) => boolean,
): ResolvedScene | null {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const seen = new Set<string>();
  let id: string | null = startId;

  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const scene: Scene | undefined = byId.get(id);
    if (!scene) return null;
    const resolved = resolveScene(scene, languageCode, has);
    if (resolved) return resolved;
    id = sceneExit(scene);
  }
  return null;
}

/**
 * How many beats this book really has for this language.
 *
 * NOT scenes.length, and the difference is what a progress bar gets wrong. A
 * book that skips two scenes for a thin corpus finishes after three, so a row
 * of five pips leaves two unfilled forever and reads as a story that broke
 * rather than one that ended.
 */
export function playableSceneCount(
  scenes: readonly Scene[],
  startId: string | null,
  languageCode: string,
  has: (languageCode: string, concept: string) => boolean,
): number {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const seen = new Set<string>();
  let id: string | null = startId;
  let n = 0;

  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const scene: Scene | undefined = byId.get(id);
    if (!scene) break;
    if (resolveScene(scene, languageCode, has)) {
      n += 1;
      id = sceneExit(scene);
      continue;
    }
    id = sceneExit(scene);
  }
  return n;
}

/**
 * Whether a saved ledger has already reached an ending of this book.
 *
 * LANGUAGE-FREE ON PURPOSE, which is the whole reason it is not a length
 * comparison. Mobile restored a saved book by asking whether it held as many
 * entries as the book has scenes, and that answer became wrong the moment a
 * book could legitimately end short because its language cannot carry every
 * scene: a finished four-entry book would have replayed itself from the start.
 * An ending is a choice whose `next` is null, and the ledger records which
 * choice was taken, so the ledger can answer this on its own.
 */
export function bookIsFinished(
  scenes: readonly Scene[],
  entries: readonly LedgerEntry[],
): boolean {
  const last = entries[entries.length - 1];
  if (!last) return false;
  const scene = scenes.find((s) => s.id === last.sceneId);
  const choice = scene?.choices.find((c) => c.concept === last.concept);
  return choice ? choice.next === null : false;
}

/**
 * Where the story goes next, and what to write in the book.
 *
 * EVERY CHOICE ADVANCES, including the ones that do not fit. That is the whole
 * difference between this and a quiz: a line that does not fit is not a buzzer,
 * it is a different thing to have said, and the story carries on from it. What
 * gets recorded is what they said, not whether they were right.
 */
export function chooseScene(
  scene: Scene,
  concept: string,
): { next: string | null; entry: LedgerEntry } | null {
  const choice = scene.choices.find((c) => c.concept === concept);
  if (!choice) return null;
  return {
    next: choice.next,
    entry: { sceneId: scene.id, concept: choice.concept, fitted: choice.fits },
  };
}

/**
 * Walk a scene graph from a starting id, skipping what this language cannot
 * carry, and stopping at an ending or a scene that does not exist.
 *
 * IT SAID "SKIPPING" AND IT MEANT "STOPPING" UNTIL 2026-09-15. An unresolvable
 * scene broke the walk, so this function reported a book as ending at the first
 * hole in the corpus while its own comment promised it stepped over one. Both
 * clients now step over it (firstPlayableScene above), and a library that
 * answers the same question two ways is the drift lib/story exists to prevent,
 * so the walker was corrected to the comment rather than the comment to the
 * walker. A skipped scene writes NOTHING to the ledger: the learner said
 * nothing there, and inventing an entry would put a line in their book that
 * they never chose.
 *
 * The cycle guard is not paranoia: a branching graph authored by hand will grow
 * a loop the first time somebody points two consequences at each other, and a
 * loop here would hang the client rather than fail a test.
 */
export function playablePath(
  scenes: readonly Scene[],
  startId: string,
  languageCode: string,
  has: (languageCode: string, concept: string) => boolean,
  pick: (s: ResolvedScene) => string,
): LedgerEntry[] {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const book: LedgerEntry[] = [];
  let id: string | null = startId;

  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const scene: Scene | undefined = byId.get(id);
    if (!scene) break;
    const resolved = resolveScene(scene, languageCode, has);
    if (!resolved) {
      id = sceneExit(scene);
      continue;
    }
    const taken = chooseScene(scene, pick(resolved));
    if (!taken) break;
    book.push(taken.entry);
    id = taken.next;
  }
  return book;
}

/**
 * Every scene a language can actually be shown.
 *
 * The planning answer, and the honest one: with 38 concepts shared across 20 or
 * more languages, a library keyed on rarer concepts will be shorter in some
 * languages than others, and this says by how much rather than letting it be
 * discovered by a learner.
 */
export function availableScenes(
  scenes: readonly Scene[],
  languageCode: string,
  has: (languageCode: string, concept: string) => boolean,
): Scene[] {
  return scenes.filter((s) => sceneAvailable(s, languageCode, has));
}
