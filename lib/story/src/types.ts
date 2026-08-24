/**
 * The clip game and the storybook are one engine.
 *
 *   Scene        a moment, rendered
 *   Choice       three candidate lines, one fits
 *   Consequence  the story moves
 *   Ledger       the choices become their book
 *
 * Only the scene RENDERER differs between the three content tiers, so nothing
 * below knows or cares which one is in play.
 *
 * WHAT IS LANGUAGE-NEUTRAL AND WHAT IS NOT, because the whole cost model rests
 * on the line between them. The scene, its art and its branching are shared by
 * all 22 languages and paid for once. Only the LINES are per language, and they
 * are not authored here at all: a scene names a concept in English and each
 * language resolves it against the phrases it already teaches.
 *
 * MEASURED BEFORE THIS WAS DESIGNED, 2026-08-23, against the production corpus:
 *
 *   1,809 distinct English concepts across 10,339 phrases
 *   each language carries 210 to 232 of them
 *   only 38 concepts appear in 20 or more languages
 *   only 3 appear in all 22
 *
 * So the corpus is NOT a uniform translation of one phrasebook, and a scene
 * that names a concept will simply not exist in some languages. That is
 * designed for rather than worked around: resolveScene() returns null, exactly
 * as traceStopFor() does for a script nobody has authored yet, and the caller
 * skips it. A library assembled from the 38 shared concepts runs everywhere; a
 * larger one runs where its concepts do.
 */

/** Which renderer a scene's media is for. Higher is richer, never required. */
export type SceneTier = 1 | 2 | 3;

/**
 * One rendering of a scene.
 *
 * TIERS 1 AND 2 ARE LANGUAGE-NEUTRAL: a still or a silent clip serves all 22,
 * which is what makes a 300-scene library cost once rather than 22 times. The
 * clip carries NO INTELLIGIBLE SPEECH for that reason; ambience is fine and is
 * added separately, and the spoken line always comes from the phrase pipeline
 * in the learner's own language.
 *
 * TIER 3 IS PER LANGUAGE by its nature: a filmed speaker speaks one language.
 * So `languageCode` is null for a shared asset and set for a filmed one, and
 * the resolver falls back down the tiers when a language has no film of its
 * own. That nullable column is the whole reason a curated Tier 3 set can sit on
 * top of a universal Tier 2 library without the engine noticing.
 */
export type SceneMedia = {
  tier: SceneTier;
  /** Where the asset lives. Opaque here; the clients know how to fetch it. */
  ref: string;
  /** Null means it serves every language. Set only for filmed Tier 3. */
  languageCode: string | null;
};

/**
 * One of the three candidate lines.
 *
 * `concept` is the English text a phrase carries in every language that has it,
 * which is the only language-neutral key the corpus offers. It is NOT shown to
 * the learner: the client resolves it to that language's own phrase and shows
 * the native script.
 */
export type SceneChoice = {
  concept: string;
  /** Where the story goes if this is chosen. Null ends the book. */
  next: string | null;
  /**
   * WHAT HAPPENS BECAUSE YOU SAID IT. A picture, shown after the tap and before
   * the story moves on.
   *
   * WHY THIS EXISTS. The graph converges: all three choices in a scene lead to
   * the same next beat. That was the right call and it was justified with the
   * wrong reason, namely that a divergent graph is human judgement nobody can
   * verify in 22 languages. That argument is about the LINES, which are per
   * language and come from the corpus. Scenes are language-neutral, so
   * divergence costs art and English prose and carries ZERO translation risk.
   *
   * What convergence actually cost was the consequence. Choosing "spoon" when
   * a grandmother is holding out a tumbler of water recorded a different entry
   * in the learner's book and changed NOTHING they could see, so the game read
   * as a quiz with no wrong answers. Reported 2026-08-24: "it doesn't really
   * adjust based on my selection".
   *
   * The outcome restores it without multiplying the graph. Three consequence
   * pictures per scene, then the story rejoins, so a five-beat book is 5 setups
   * plus 15 outcomes rather than 3^5 = 243 branches.
   *
   * THE JOKE IS THE PICTURE, never the words. A line that does not fit gets an
   * outcome that is funny in every language at once, because nothing in the
   * image is written down. That is the same property that makes a Tier 1 still
   * serve all 22 languages, applied to comedy.
   */
  outcome?: SceneOutcome;
  /**
   * Whether this is the line that FITS the scene.
   *
   * Exactly one choice per scene sets it. The others are not "wrong answers"
   * in a quiz sense; they are lines that would be odd here, which is what makes
   * the choice a comprehension judgement rather than a recall test.
   */
  fits: boolean;
};

/**
 * The consequence of one line, rendered.
 *
 * Deliberately the same shape as a Scene's `situation`: an English brief that
 * an illustrator or a generator works from AND the alt text a screen reader
 * reads. Never shown as prose to the learner, who sees the picture.
 */
export type SceneOutcome = {
  situation: string;
};

/** A moment, its renderings, and where each answer takes you. */
export type Scene = {
  id: string;
  /**
   * What the picture shows, in English. The prompt an illustrator or a
   * generator works from, and the alt text a screen reader reads. Never shown
   * as story prose: the learner sees the picture and the three lines.
   */
  situation: string;
  media: SceneMedia[];
  choices: SceneChoice[];
};

/** One entry in the learner's book: what they met, and what they said. */
export type LedgerEntry = {
  sceneId: string;
  /** The concept they chose, in English. Their own line, in their language,
   *  is looked up from this when the book is rendered. */
  concept: string;
  fitted: boolean;
};

/**
 * A scene resolved for one learner in one language.
 *
 * The lines are still concepts: turning a concept into native script needs the
 * phrase corpus, which lives in the database and not in a pure library. The
 * client does that last step, which keeps this whole engine testable with no
 * database at all.
 */
export type ResolvedScene = {
  scene: Scene;
  media: SceneMedia;
  choices: SceneChoice[];
};
