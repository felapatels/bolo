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
    if (!resolved) break;
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
