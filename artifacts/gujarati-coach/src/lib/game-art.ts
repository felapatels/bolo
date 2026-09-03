/**
 * THE GAMES HUB'S PICTURES, the web twin of bolo-mobile/lib/gameArt.ts
 * (build 21 there, the owner's games mockup: "big images, very colorful").
 * One 4:3 painting per game and a wide hero band for the top of the hub,
 * keyed by the hub's game ids and served from public/games, where mobile's
 * assets/games were copied file for file. NO TEXT IN ANY OF THEM, by the
 * brief: the app writes every word.
 */
const PAINTED = new Set([
  "luggage-match",
  "chacha-call",
  "word-match",
  "signal-lights",
  "phrase-builder",
  "speed-round",
  "script-trace",
  "bolo-quiz",
  "ticket-check",
  "storybook",
  "emergency",
  "listen-and-pick",
  "wrong-platform",
  "wrong-platform-2",
]);

/** The hero band across the top of the hub, 16:9, cropped wide by the hub. */
export const GAMES_HERO = `${import.meta.env.BASE_URL}games/hero.png`;
/** The hero as a film (build 29): 3.75s, silent, a 1.0s dissolve baked into the
 *  loop point, cut before the train pulls out. Poster is its own first frame. */
export const GAMES_HERO_FILM = `${import.meta.env.BASE_URL}games/hero.mp4`;
export const GAMES_HERO_POSTER = `${import.meta.env.BASE_URL}games/hero-first.jpg`;

/** A game's picture, or null for an id with no painting (the gradient stands in). */
export function gameArt(gameId: string): string | null {
  return PAINTED.has(gameId) ? `${import.meta.env.BASE_URL}games/${gameId}.png` : null;
}
