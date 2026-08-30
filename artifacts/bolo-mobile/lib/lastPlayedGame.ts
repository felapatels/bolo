/**
 * THE LAST GAME PLAYED, remembered on the device (build 21, the owner's
 * games mockup: a "Continue playing" card above the grid).
 *
 * The server records every game session (POST /game-sessions) but offers
 * nothing back per game, no personal best and no level, so the card cannot
 * promise those yet. What it can do honestly is remember which game the
 * learner opened last and put it back in front of them. One key, one id,
 * written when the hub sends the learner into a game.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LAST_PLAYED_GAME_KEY = 'bolo.games.lastPlayed';

export async function readLastPlayedGame(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(LAST_PLAYED_GAME_KEY)) || null;
  } catch {
    return null;
  }
}

export async function writeLastPlayedGame(gameId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_PLAYED_GAME_KEY, gameId);
  } catch {
    // A device that will not remember still plays.
  }
}
