import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-local practice preferences (same pattern as lib/stop-mode.ts).
 *
 * Spoken feedback: whether the coach's written feedback + tip are read aloud
 * when a score lands. Defaults to on; the choice persists across app launches
 * but is intentionally per-device (not synced to the account).
 */
export const SPOKEN_FEEDBACK_KEY = 'bolo.spokenFeedback';

export async function loadSpokenFeedback(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SPOKEN_FEEDBACK_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveSpokenFeedback(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SPOKEN_FEEDBACK_KEY, enabled ? 'on' : 'off');
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
