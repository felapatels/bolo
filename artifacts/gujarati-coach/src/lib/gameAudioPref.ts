/**
 * Game audio preference - whether games speak target-language audio.
 * Defaults to on (unmuted). Persists per browser via localStorage (same
 * pattern as lib/soundPref.ts). Client-local only; not synced to the account.
 */
export const GAME_AUDIO_PREF_KEY = "bolo.gameAudio";

export function loadGameAudioPref(): boolean {
  try {
    // "off" is the only stored falsy value; anything else (including null for
    // first-time users) is treated as the default-on state.
    return localStorage.getItem(GAME_AUDIO_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveGameAudioPref(enabled: boolean): void {
  try {
    localStorage.setItem(GAME_AUDIO_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
