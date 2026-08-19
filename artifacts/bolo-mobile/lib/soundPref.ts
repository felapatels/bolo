/**
 * Sound effects preference, whether in-session audio feedback cues play.
 * Defaults to on. Persists per device via AsyncStorage (same pattern as
 * lib/settings.ts). Client-local only; not synced to the account.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SOUND_PREF_KEY = 'bolo.soundEffects';

export async function loadSoundPref(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SOUND_PREF_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveSoundPref(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
