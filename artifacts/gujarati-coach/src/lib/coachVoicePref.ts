/**
 * Coach voice preference, whether Bolo's synthesized and bundled speech
 * plays (phrase audio, meaning audio, feedback read-aloud, band call-outs,
 * chat replies, and greeting). Defaults to on. Persists per browser via
 * localStorage (same pattern as lib/soundPref.ts). Client-local only; not
 * synced to the account.
 *
 * Migration: on first read, if no stored value exists, the legacy
 * bolo.soundEffects value carries over so a user who turned off the old
 * single setting does not suddenly hear Bolo speak after updating.
 */
import { SOUND_PREF_KEY } from "./soundPref";

export const COACH_VOICE_PREF_KEY = "bolo.coachVoice";

export function loadCoachVoicePref(): boolean {
  try {
    const val = localStorage.getItem(COACH_VOICE_PREF_KEY);
    if (val !== null) return val !== "off";
    // Migration: carry over the legacy sound-effects value so nobody's
    // audio silently turns on after the update that introduced this key.
    const legacy = localStorage.getItem(SOUND_PREF_KEY);
    return legacy !== "off";
  } catch {
    return true;
  }
}

export function saveCoachVoicePref(enabled: boolean): void {
  try {
    localStorage.setItem(COACH_VOICE_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
