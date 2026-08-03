import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the coach speaks the English meaning right after each phrase clip
 * during practice. Defaults to on; persists per device (same pattern as the
 * spoken-feedback and silent-mode preferences in lib/settings.ts) and is
 * intentionally not synced across devices. Mirrors the web's
 * lib/meaning-audio.ts (Task 1003) for cross-platform parity, including the
 * storage key name.
 */
export const MEANING_AUDIO_KEY = 'bolo.meaningAudio';

export async function loadMeaningAudio(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MEANING_AUDIO_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveMeaningAudio(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(MEANING_AUDIO_KEY, enabled ? 'on' : 'off');
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
 * Ported from the web lib unchanged so both platforms speak the same line.
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
