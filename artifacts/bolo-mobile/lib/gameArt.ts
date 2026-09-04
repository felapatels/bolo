/**
 * THE GAMES HUB'S PICTURES (build 21, the owner's games mockup: "big images,
 * very colorful"). One 4:3 painting per game and a wide hero band for the
 * top of the hub, keyed by the hub's game ids.
 *
 * WHAT IS IN THE BUNDLE TONIGHT IS A PLACEHOLDER: a soft gradient in each
 * card's own hue with a haze and a ground band, generated on the Mac so the
 * requires resolve. The real paintings are being generated from the brief
 * (the artifact "Bolo Games Art Brief"); each lands in ~/Downloads/bolo-games/
 * under the same name and is resampled over its placeholder by
 * scripts/import-game-art.py, so nothing here changes when they arrive.
 *
 * NO TEXT IN ANY OF THEM, by the brief: the app writes every word.
 */
export const GAME_ART: Record<string, number> = {
  'luggage-match': require('../assets/games/luggage-match.png') as number,
  'chacha-call': require('../assets/games/chacha-call.png') as number,
  'word-match': require('../assets/games/word-match.png') as number,
  'signal-lights': require('../assets/games/signal-lights.png') as number,
  'phrase-builder': require('../assets/games/phrase-builder.png') as number,
  'speed-round': require('../assets/games/speed-round.png') as number,
  'script-trace': require('../assets/games/script-trace.png') as number,
  // Placeholder in Letter Match's own plum, generated the same way every other
  // card's was and replaced by the real painting the same way: it lands in
  // ~/Downloads/bolo-games/ under this name and scripts/import-game-art.py
  // resamples it over this file, so nothing here changes when it arrives.
  'letter-match': require('../assets/games/letter-match.png') as number,
  'bolo-quiz': require('../assets/games/bolo-quiz.png') as number,
  'ticket-check': require('../assets/games/ticket-check.png') as number,
  storybook: require('../assets/games/storybook.png') as number,
  emergency: require('../assets/games/emergency.png') as number,
  'listen-and-pick': require('../assets/games/listen-and-pick.png') as number,
  'wrong-platform': require('../assets/games/wrong-platform.png') as number,
  'wrong-platform-2': require('../assets/games/wrong-platform-2.png') as number,
};

/** The hero band across the top of the hub, 16:9, cropped wide by the hub. */
export const GAMES_HERO = require('../assets/games/hero.png') as number;
/**
 * THE HERO AS A FILM (build 29, the owner's clip): Bolo dancing on the platform
 * before the train pulls out. 3.75s, 960x540, silent, 557KB. The source runs
 * ten seconds but the train starts moving at about five, and nothing can loop
 * a departing train, so the cut stops before it moves and a 1.0s dissolve is
 * baked into the loop point (join measured 3.3 against a hard cut of ~40).
 * The poster is the film's own first frame.
 */
export const GAMES_HERO_FILM = require('../assets/games/hero.mp4') as number;
export const GAMES_HERO_POSTER = require('../assets/games/hero-first.jpg') as number;

/** A game's picture, or null for an id the table does not know. */
export function gameArt(gameId: string): number | null {
  return GAME_ART[gameId] ?? null;
}
