/**
 * Sound effects preference — whether in-session audio feedback cues play.
 * Defaults to on. Persists per browser via localStorage (same pattern as
 * lib/silent-mode.ts). Client-local only; not synced to the account.
 */
export const SOUND_PREF_KEY = "bolo.soundEffects";

export function loadSoundPref(): boolean {
  try {
    // "off" is the only stored falsy value; anything else (including null for
    // first-time users) is treated as the default-on state.
    return localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundPref(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // Persistence is best-effort.
  }
}
