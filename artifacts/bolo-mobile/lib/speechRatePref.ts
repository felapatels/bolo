/**
 * Speech rate preference — how fast the target language is spoken back to the
 * learner. Owner request 2026-09-13: "Add a speed toggle to allow people to
 * slow down the speech in lessons, bolo chat, essentially anywhere native
 * speech is being spoken."
 *
 * The web twin is gujarati-coach/src/lib/speechRatePref.ts and the two are
 * hand-maintained, as every pref pair in this codebase is. Keep the key, the
 * option list and the rates identical: a learner who slows Bolo down on the
 * phone and opens the web app should not meet a different setting.
 *
 * Defaults to normal. Persists per device via AsyncStorage, the same pattern
 * as lib/coachVoicePref.ts. Client-local only; not synced to the account.
 *
 * THIS IS A PLAYBACK RATE, NOT A SYNTHESIS SETTING. Slowing speech at the
 * provider would change the audio itself, and the server's phrase cache key
 * hashes provider, model, voice and language, so every rate would be a
 * separate cached clip and a separate ElevenLabs bill. Changing the rate on
 * the player re-plays the clip already cached and costs nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SPEECH_RATE_PREF_KEY = 'bolo.speechRate';

export const NORMAL_SPEECH_RATE = 1;

/** The rates offered, fastest first. The first entry is the default. */
export const SPEECH_RATE_OPTIONS: ReadonlyArray<{ rate: number; label: string }> = [
  { rate: NORMAL_SPEECH_RATE, label: 'Normal' },
  { rate: 0.8, label: 'Slow' },
  { rate: 0.65, label: 'Slower' },
];

const ALLOWED = new Set(SPEECH_RATE_OPTIONS.map((o) => o.rate));

/**
 * THE CACHED COPY EXISTS BECAUSE PLAYBACK IS ON A LATENCY PATH.
 * `playStreamingAudio` is what the chat screen uses for a reply, and awaiting
 * AsyncStorage on every play would add a disk read between the learner
 * speaking and Bolo answering. lib/audio.ts reads this synchronously at the
 * moment it creates a player, so the value has to already be in memory.
 *
 * It starts at normal, which is the safe direction: the worst case of a cold
 * cache is one clip at full speed before the stored preference lands.
 */
let cachedRate: number = NORMAL_SPEECH_RATE;

/** The rate to use right now, without touching disk. */
export function currentSpeechRate(): number {
  return cachedRate;
}

export async function loadSpeechRatePref(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SPEECH_RATE_PREF_KEY);
    const parsed = raw === null ? NORMAL_SPEECH_RATE : Number(raw);
    // An unrecognised stored value reads as normal rather than being clamped
    // to the nearest option: a value this module did not write is corruption
    // or a future version's, and guessing would apply a rate nobody chose.
    cachedRate = ALLOWED.has(parsed) ? parsed : NORMAL_SPEECH_RATE;
  } catch {
    cachedRate = NORMAL_SPEECH_RATE;
  }
  return cachedRate;
}

export async function saveSpeechRatePref(rate: number): Promise<void> {
  // The cache moves first so the very next play is at the new rate even if
  // the write is slow or fails.
  cachedRate = ALLOWED.has(rate) ? rate : NORMAL_SPEECH_RATE;
  try {
    await AsyncStorage.setItem(SPEECH_RATE_PREF_KEY, String(cachedRate));
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
