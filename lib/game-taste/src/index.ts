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
}: {
  plusOnly: boolean;
  isPlus: boolean;
  playsUsed: number;
}): GameTasteState {
  // Entitled: no ceiling, and no number counting down at them.
  if (isPlus) return { tasting: false, playsLeft: 0, playable: true };

  // An All-Access game is what it always was for a Free learner: shut. It is
  // NOT a taste, and saying "3 plays left" on a door that does not open would
  // be worse than the lock.
  if (plusOnly) return { tasting: false, playsLeft: 0, playable: false };

  const used = Number.isFinite(playsUsed) ? Math.max(0, Math.floor(playsUsed)) : 0;
  const left = Math.max(0, GAME_TASTE_PLAYS - used);
  return { tasting: true, playsLeft: left, playable: left > 0 };
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
  if (state.playsLeft === 0) return "Free taste used";
  if (state.playsLeft === 1) return "1 free play left";
  return `${state.playsLeft} free plays left`;
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
  "luggage-match",
  "chacha-call",
  "signal-lights",
  "ticket-check",
  "wrong-platform",
] as const;

export type TasteGameId = (typeof TASTE_GAME_IDS)[number];

/** Whether this game id is one the free taste applies to. */
export function isTasteGame(gameId: string): gameId is TasteGameId {
  return (TASTE_GAME_IDS as readonly string[]).includes(gameId);
}
