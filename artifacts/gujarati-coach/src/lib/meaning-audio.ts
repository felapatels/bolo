// Whether the coach speaks the English meaning right after each phrase clip
// during practice. Defaults to on; persists per browser (same pattern as the
// spoken-feedback and silent-mode preferences) and is intentionally not
// synced across devices.
export const MEANING_AUDIO_STORAGE_KEY = "bolo.meaningAudio";

export function loadMeaningAudio(): boolean {
  try {
    return localStorage.getItem(MEANING_AUDIO_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveMeaningAudio(enabled: boolean): void {
  try {
    localStorage.setItem(MEANING_AUDIO_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}

/**
 * What the coach says for the meaning segment: "means <translation>" for a
 * short gloss, or the translation alone when it is itself a sentence (a
 * leading "means" reads wrong before a full sentence).
 *
 * A translation counts as a sentence when the caller says so (sentence-stage
 * sessions), when it carries sentence-final punctuation, or when it runs six
 * or more words, long enough that it clearly is not a one-phrase gloss.
 */
export function meaningSpeechText(
  english: string,
  opts?: { sentence?: boolean },
): string {
  const text = english.trim();
  const looksLikeSentence =
    opts?.sentence === true ||
    /[.!?]$/.test(text) ||
    text.split(/\s+/).length >= 6;
  return looksLikeSentence ? text : `means ${text}`;
}
