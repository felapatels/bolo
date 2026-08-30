/**
 * THE LAST GAME PLAYED, remembered in the browser (the web twin of
 * bolo-mobile/lib/lastPlayedGame.ts; build 21 there, the owner's games
 * mockup: a "Continue playing" card above the grid).
 *
 * The server records every game session but offers nothing back per game,
 * no personal best and no level, so the card cannot promise those yet. What
 * it can do honestly is remember which game the learner opened last and put
 * it back in front of them. One key, one id, written when the hub sends the
 * learner into a game. Same key as mobile, so the two read alike.
 */
export const LAST_PLAYED_GAME_KEY = "bolo.games.lastPlayed";

export function readLastPlayedGame(): string | null {
  try {
    return localStorage.getItem(LAST_PLAYED_GAME_KEY) || null;
  } catch {
    return null;
  }
}

export function writeLastPlayedGame(gameId: string): void {
  try {
    localStorage.setItem(LAST_PLAYED_GAME_KEY, gameId);
  } catch {
    /* a nicety; losing it only costs the card */
  }
}
