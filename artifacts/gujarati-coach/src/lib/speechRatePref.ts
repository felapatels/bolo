/**
 * Speech rate preference — how fast the target language is spoken back to the
 * learner. Owner request 2026-09-13: "Add a speed toggle to allow people to
 * slow down the speech in lessons, bolo chat, essentially anywhere native
 * speech is being spoken."
 *
 * Defaults to normal. Persists per browser via localStorage, the same pattern
 * as lib/coachVoicePref.ts and lib/soundPref.ts. Client-local only; not synced
 * to the account, which also keeps it out of the CONTRACT gate on
 * openapi.yaml's preferences route.
 *
 * THIS IS A PLAYBACK RATE, NOT A SYNTHESIS SETTING, and that distinction is
 * the whole reason it is cheap. Slowing speech at the provider would change
 * the audio itself, and the phrase cache key (ttsCache.ts phraseTtsCacheKey)
 * hashes provider, model, voice and language, so every rate would be a
 * separate cached clip and a separate ElevenLabs bill. Changing the rate on
 * the element instead re-plays the clip that is already cached, costs nothing,
 * and takes effect the instant the learner picks it.
 *
 * WHY NOT SLOWER THAN 0.65: below roughly 0.6 the time-stretch artefacts get
 * loud enough that the learner is copying the stretch rather than the speaker,
 * which is worse for pronunciation than normal speed. The floor is a judgement
 * and is worth an owner listen before it moves.
 */

export const SPEECH_RATE_PREF_KEY = "bolo.speechRate";

export const NORMAL_SPEECH_RATE = 1;

/** The rates offered, fastest first. The first entry is the default. */
export const SPEECH_RATE_OPTIONS: ReadonlyArray<{ rate: number; label: string }> = [
  { rate: NORMAL_SPEECH_RATE, label: "Normal" },
  { rate: 0.8, label: "Slow" },
  { rate: 0.65, label: "Slower" },
];

const ALLOWED = new Set(SPEECH_RATE_OPTIONS.map((o) => o.rate));

/**
 * An unrecognised stored value reads as normal rather than being clamped to
 * the nearest option. A value this module did not write is either corruption
 * or a future version's, and guessing at it would apply a rate nobody chose.
 */
export function loadSpeechRatePref(): number {
  try {
    const raw = localStorage.getItem(SPEECH_RATE_PREF_KEY);
    if (raw === null) return NORMAL_SPEECH_RATE;
    const parsed = Number(raw);
    return ALLOWED.has(parsed) ? parsed : NORMAL_SPEECH_RATE;
  } catch {
    return NORMAL_SPEECH_RATE;
  }
}

export function saveSpeechRatePref(rate: number): void {
  try {
    localStorage.setItem(SPEECH_RATE_PREF_KEY, String(rate));
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}

/**
 * Apply the learner's rate to an audio element.
 *
 * `preservesPitch` matters: without it a slowed clip drops in pitch and the
 * coach turns into a different, deeper person, which defeats the point of
 * having chosen her voice. Every browser this app supports honours the
 * standard property; the two prefixed spellings are there for older WebKit
 * and cost nothing.
 *
 * Call this immediately before play() rather than once at setup. The blessed
 * singletons in iosAudio.ts persist across plays and would keep a stale rate,
 * and a per-play `new Audio()` starts at 1 every time.
 */
export function applySpeechRate(el: HTMLAudioElement, rate = loadSpeechRatePref()): void {
  try {
    const withPitch = el as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    withPitch.preservesPitch = true;
    withPitch.mozPreservesPitch = true;
    withPitch.webkitPreservesPitch = true;
    el.playbackRate = rate;
  } catch {
    // A rate a browser refuses must never stop the clip from playing.
  }
}
