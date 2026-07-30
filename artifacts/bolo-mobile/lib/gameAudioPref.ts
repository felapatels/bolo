/**
 * Game audio preference - whether games speak target-language audio.
 * Defaults to on (unmuted). Persists per device via AsyncStorage (same
 * pattern as lib/soundPref.ts). Client-local only; not synced to the account.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GAME_AUDIO_PREF_KEY = 'bolo.gameAudio';

export async function loadGameAudioPref(): Promise<boolean> {
  try {
    // 'off' is the only stored falsy value; anything else (including null for
    // first-time users) is treated as the default-on state.
    return (await AsyncStorage.getItem(GAME_AUDIO_PREF_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveGameAudioPref(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(GAME_AUDIO_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
