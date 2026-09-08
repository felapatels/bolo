/**
 * THE FREE TASTE ON GAMES: three plays, then the paywall.
 *
 * Owner ruling, 2026-09-04: "The ones we have Free right now should be Free
 * Taste (3 plays) then paywalled. Keep the All-Access ones the way they are."
 *
 * WHAT CHANGED AND WHAT DID NOT. A game that was All-Access is untouched: it
 * was never playable free and still is not. A game that was FREE becomes a
 * taste, which is a genuine takeaway from today's behaviour and is the point of
 * the ruling: the free games were the whole of what a Free learner could do
 * forever, and forever is not a taste.
 *
 * THREE, THE SAME THREE THE REST OF THE PRODUCT USES. The voice teaser serves
 * three phrases of a locked language, and tracing gives three characters. A
 * learner who has met "three and then it asks" once already knows this shape,
 * which is worth more than tuning each surface separately.
 *
 * COUNTED PER GAME, NOT PER LANGUAGE. The taste is of the GAME: three plays of
 * Ticket Check is three, whether they were played in Hindi or Tamil. Counting
 * per language would hand a learner 66 free plays across 22 languages, which is
 * not a taste, and it would also punish somebody exploring languages, which is
 * the opposite of what the free tier is for.
 *
 * PLUS IS NEVER COUNTED. An entitled learner has no ceiling and must never see
 * a number counting down, which is why `isPlus` short circuits before anything
 * else here.
 */

/** Plays of a tasted game before the paywall. */
export const GAME_TASTE_PLAYS = 3;

/** What a client needs to draw a game's card and decide whether to open it. */
export interface GameTasteState {
  /** True when this game is a taste for this learner rather than owned. */
  tasting: boolean;
  /** Plays left before the wall. Zero once spent; always zero for a locked game. */
  playsLeft: number;
  /**
   * Bought plays still in the learner's pool, usable on ANY tasted game.
   *
   * Separate from `playsLeft` on purpose: the free taste is per game and these
   * are one shared pool, so adding them together would produce a number that
   * is right on one card and wrong on the next five. Always zero for an
   * entitled learner and for an All-Access game.
   */
  creditsLeft: number;
  /** True when the learner may start a run right now. */
  playable: boolean;
}

/**
 * Whether this learner may open this game, and how much taste is left.
 *
 * `plusOnly` is the game's own gate as the hub already declares it, and it is
 * deliberately still the authority for the All-Access games: this function adds
 * a ceiling to the free ones and changes nothing about the paid ones.
 *
 * Defensive on `playsUsed` rather than trusting it: a negative or fractional
 * count is a caller bug, and it must never become extra free plays.
 */
export function gameTasteState({
  plusOnly,
  isPlus,
  playsUsed,
  credits = 0,
}: {
  plusOnly: boolean;
  isPlus: boolean;
  playsUsed: number;
  /**
   * Bought plays in the learner's pool. Defaults to zero so every existing
   * caller keeps its exact behaviour: this argument was added on 2026-09-08
   * with the Chai game-credit sink, and a caller that does not know about
   * credits must not accidentally grant one.
   */
  credits?: number;
}): GameTasteState {
  // Entitled: no ceiling, and no number counting down at them. Checked BEFORE
  // credits, because Plus has no ceiling to raise and must never be shown a
  // pool it has no use for.
  if (isPlus)
    return { tasting: false, playsLeft: 0, creditsLeft: 0, playable: true };

  // An All-Access game is what it always was for a Free learner: shut. It is
  // NOT a taste, and saying "3 plays left" on a door that does not open would
  // be worse than the lock. CREDITS DO NOT OPEN IT EITHER: Chai buys quantity,
  // never a ceiling removed, which is the same rule stops past zone one run on.
  if (plusOnly)
    return { tasting: false, playsLeft: 0, creditsLeft: 0, playable: false };

  const used = Number.isFinite(playsUsed) ? Math.max(0, Math.floor(playsUsed)) : 0;
  const left = Math.max(0, GAME_TASTE_PLAYS - used);
  // Defensive on credits for the same reason as playsUsed: a negative or
  // fractional pool is a caller bug and must never become a free play.
  const pool = Number.isFinite(credits) ? Math.max(0, Math.floor(credits)) : 0;
  return {
    tasting: true,
    playsLeft: left,
    creditsLeft: pool,
    // THE FREE TASTE IS SPENT FIRST. A learner with plays left and credits in
    // the pool is playing for free, so the pool is only reachable once the
    // taste is gone. Any other order charges for something already given away.
    playable: left > 0 || pool > 0,
  };
}

/**
 * The line under a tasted game's card, or null when there is nothing to say.
 *
 * Null for an entitled learner and for an All-Access game, because both of
 * those already read correctly without it: one has no ceiling and the other
 * wears a lock.
 */
export function gameTasteLabel(state: GameTasteState): string | null {
  if (!state.tasting) return null;
  if (state.playsLeft === 1) return "1 free play left";
  if (state.playsLeft > 1) return `${state.playsLeft} free plays left`;
  // The taste is gone, so the pool is what is left to say. It is named
  // "credits" rather than "plays" so the learner can tell what they were given
  // from what they paid for, and so the card does not read as though the free
  // taste refilled itself overnight.
  if (state.creditsLeft === 1) return "1 credit left";
  if (state.creditsLeft > 1) return `${state.creditsLeft} credits left`;
  return "Free taste used";
}

/**
 * THE GAMES THAT ARE A TASTE, named once so three artifacts agree.
 *
 * These are exactly the five that were FREE before the 2026-09-04 ruling. The
 * server has no games catalogue of its own (the hub's list lives in each
 * client), so without this the gate would have to be spelled out in the route
 * and kept in step with two client files by hand, which is the drift this repo
 * keeps writing down.
 *
 * wrong-platform-2 is deliberately ABSENT: it was already All-Access, and the
 * ruling's other half is that those do not move.
 *
 * ADDED AFTER bd78acea, on finding that the server needs the list too.
 */
export const TASTE_GAME_IDS = [
  // THE SIX THAT WERE FREE BEFORE THE 2026-09-04 RULING.
  "luggage-match",
  "chacha-call",
  "signal-lights",
  "ticket-check",
  "wrong-platform",
  // WEB ONLY, AND IT WAS ALMOST MISSED. The list was written off the mobile
  // hub, where the free games are exactly the other five; the web hub carries
  // a sixth free card the phone has never had.
  "express-listening",
  // AND THE REST, ADDED 2026-09-08 BY THE OWNER'S RULING: "3 free games for
  // all games before paywall". The earlier ruling's other half said the
  // All-Access games do not move; this one moves them. **Every game is now a
  // taste**, so an All-Access card stops being a wall a learner meets before
  // they have played anything and becomes a wall they meet after three goes.
  "word-match",
  "phrase-builder",
  "speed-round",
  "script-trace",
  "letter-match",
  "bolo-quiz",
  "storybook",
  "emergency",
  "listen-and-pick",
  "wrong-platform-2",
] as const;

export type TasteGameId = (typeof TASTE_GAME_IDS)[number];

/** Whether this game id is one the free taste applies to. */
export function isTasteGame(gameId: string): gameId is TasteGameId {
  return (TASTE_GAME_IDS as readonly string[]).includes(gameId);
}

/**
 * WHETHER THIS RUN IS A HUB PLAY, and therefore whether the taste sees it.
 *
 * A run carries where it was launched from: nothing (or "hub") from the games
 * hub, "signal" from a trackside encounter, "closeout" from the end of a zone.
 * ONLY THE HUB PLAYS ARE COUNTED, AND ONLY THEY ARE EVER REFUSED.
 *
 * The journey's two contexts are the journey's own mechanic, each with a
 * once-ever Chai grant attached, and a learner meets them because the map put
 * them there rather than because they chose the game. Refusing one would
 * strand the crossing that the run pays for, in the middle of the line, on the
 * free tier the map exists to serve. Counting one would spend a learner's
 * taste on a game they never asked to play.
 *
 * This is the rule that turns the taste from "three plays of this game" into
 * "three plays you went looking for", which is the one the ruling means.
 */
export function isHubPlay(context: string | null | undefined): boolean {
  return !context || context === "hub";
}
