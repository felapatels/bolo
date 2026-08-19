/**
 * Coach voice preference, whether Bolo's synthesized and bundled speech
 * plays (phrase audio, meaning audio, feedback read-aloud, band call-outs,
 * chat replies, and greeting). Defaults to on. Persists per device via
 * AsyncStorage (same pattern as lib/soundPref.ts). Client-local only; not
 * synced to the account.
 *
 * Migration: on first read, if no stored value exists, the legacy
 * bolo.soundEffects value carries over so a user who turned off the old
 * single setting does not suddenly hear Bolo speak after updating.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOUND_PREF_KEY } from './soundPref';

export const COACH_VOICE_PREF_KEY = 'bolo.coachVoice';

export async function loadCoachVoicePref(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(COACH_VOICE_PREF_KEY);
    if (val !== null) return val !== 'off';
    // Migration: carry over the legacy sound-effects value so nobody's
    // audio silently turns on after the app update that introduced this key.
    const legacy = await AsyncStorage.getItem(SOUND_PREF_KEY);
    return legacy !== 'off';
  } catch {
    return true;
  }
}

export async function saveCoachVoicePref(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(COACH_VOICE_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
