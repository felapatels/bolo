// Build 35 mobile parity: the mobile quick-game roster, the counterpart of
// the web roster in gujarati-coach/src/lib/quick-games.ts.
//
// This module is DATA ONLY. No quick games are ported yet — the roster ships
// with the shell so the games can land against a fixed contract instead of
// each one re-deciding its own floor, title and server mapping.
//
// The server's game id enum is CLOSED (speed-round, phrase-builder,
// word-match, listen-and-pick). Quick games therefore have no server id of
// their own: each one rides an existing id whose correctness model it
// matches, via `serverGame`.
//   Model A (selection): correct when selectedPhraseId === phraseId
//                        → rides "listen-and-pick"
//   Model B (pairs):     the matching game → rides "word-match"
// Ids, titles, floors and serverGame values are kept identical to the web
// roster so a signal offering "Ticket Check" means the same game and the same
// scoring on both platforms.

import type { Feather } from '@expo/vector-icons';

export type QuickGameId =
  | 'ticket-check'
  | 'wrong-platform'
  | 'luggage-match'
  | 'signal-lights';

export type QuickGameDifficulty = 'Easy' | 'Medium' | 'Hard';

export type QuickGameDef = {
  id: QuickGameId;
  title: string;
  /** One-line hub/encounter blurb. */
  description: string;
  difficulty: QuickGameDifficulty;
  /** Feather glyph for hub cards and signal encounters. */
  icon: keyof typeof Feather.glyphMap;
  /** Minimum plan-visible phrases the category needs for this game. */
  floor: number;
  /** The frozen server game id this quick game rides for scoring. */
  serverGame: 'listen-and-pick' | 'word-match';
  /**
   * Expo Router path for the game screen. Deliberately a plain string, not a
   * typed Href: none of these screens exist yet (no games are ported in this
   * task), and a typed route would fail typecheck until they do. Wire
   * navigation when the first game lands.
   */
  route: string;
};

/** Roster order is the deterministic signal rotation order (web parity). */
export const QUICK_GAMES: readonly QuickGameDef[] = [
  {
    id: 'ticket-check',
    title: 'Ticket Check',
    description: 'Hear the phrase, punch the matching ticket.',
    difficulty: 'Easy',
    icon: 'check-square',
    floor: 4,
    serverGame: 'listen-and-pick',
    route: '/games/ticket-check',
  },
  {
    id: 'wrong-platform',
    title: 'Wrong Platform',
    description: 'Spot the phrase that does not belong on this platform.',
    difficulty: 'Medium',
    icon: 'alert-triangle',
    floor: 3,
    serverGame: 'listen-and-pick',
    route: '/games/wrong-platform',
  },
  {
    id: 'luggage-match',
    title: 'Luggage Match',
    description: 'Pair each bag with its owner before the train leaves.',
    difficulty: 'Easy',
    icon: 'briefcase',
    floor: 4,
    serverGame: 'word-match',
    route: '/games/luggage-match',
  },
  {
    id: 'signal-lights',
    title: 'Signal Lights',
    description: 'Green or red? Call the phrase before the signal changes.',
    difficulty: 'Medium',
    icon: 'radio',
    floor: 2,
    serverGame: 'listen-and-pick',
    route: '/games/signal-lights',
  },
] as const;

/** The lowest floor across the roster. A category under this supports no
 *  quick game at all, which is the auto-wave condition at a signal. */
export const QUICK_GAME_MIN_FLOOR = Math.min(...QUICK_GAMES.map((g) => g.floor));

export function quickGameById(id: string): QuickGameDef | undefined {
  return QUICK_GAMES.find((g) => g.id === id);
}

/** Games playable with `visibleCount` plan-visible phrases, roster order. */
export function eligibleQuickGames(visibleCount: number): QuickGameDef[] {
  return QUICK_GAMES.filter((g) => g.floor <= visibleCount);
}

/**
 * Deterministic rotation: the game offered at a signal is picked by the
 * signal's ordinal index over the caller's plan-visible game roster. Returns
 * null when no game fits, which is the auto-wave case. Mirrors web exactly so
 * the same signal offers the same game on both platforms.
 */
export function gameForSignal(
  signalIndex: number,
  visibleCount: number,
): QuickGameDef | null {
  const eligible = eligibleQuickGames(visibleCount);
  if (eligible.length === 0) return null;
  return eligible[signalIndex % eligible.length] ?? null;
}
