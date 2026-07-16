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

/**
 * Silent mode: skips the coach's auto-played voice on each new phrase so the
 * learner can read the word themselves and start recording immediately.
 * Defaults to off; same per-device (not synced) storage pattern as above.
 * Read fresh at the point of use (not cached in a mount-time ref) so a
 * toggle on the Account screen applies starting with the very next phrase.
 */
export const SILENT_MODE_KEY = 'bolo.silentMode';

export async function loadSilentMode(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SILENT_MODE_KEY)) === 'on';
  } catch {
    return false;
  }
}

export async function saveSilentMode(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SILENT_MODE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}

/**
 * Chat hold-to-speak hint: shown once to first-time users until they interact
 * or it auto-dismisses. Stored per-device; not synced to the account.
 */
export const CHAT_HOLD_HINT_KEY = 'bolo.chatHoldHintSeen';

export async function loadChatHoldHintSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAT_HOLD_HINT_KEY)) === 'yes';
  } catch {
    return false;
  }
}

export async function saveChatHoldHintSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_HOLD_HINT_KEY, 'yes');
  } catch {
    // Best-effort.
  }
}
