/**
 * Phrase-audio verification.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Phrase audio is synthesized once and cached forever under a content-addressed
 * key, so a single bad take is not a transient glitch, it becomes the permanent
 * voice of that phrase for every learner. A field report on 2026-08-10 caught
 * exactly that: the cached production clip for "સાચવીને જજો" spoke only
 * "saachvine" and never said "જજો", and had been doing so since it was
 * synthesized two weeks earlier.
 *
 * That failure is invisible to every cheap heuristic. The truncated take ran
 * 2.45s against a healthy 2.62s, the model simply said one word slowly, so
 * duration, byte size, and bytes-per-character all look perfectly normal. The
 * only way to know a clip says the phrase is to listen to it.
 *
 * So we listen: transcribe the clip and check that what came back is as long,
 * phonetically, as the phrase it is supposed to speak. This deliberately does
 * NOT try to check pronunciation quality or exact wording, recognizers drift
 * across scripts (the same recognizer has returned Cyrillic for Gujarati), and
 * a strict word match would reject good audio. Dropped content is what we can
 * detect robustly, and dropped content is the bug.
 *
 * FAIL-OPEN BY DESIGN
 * ───────────────────
 * Every ambiguous outcome resolves to `ok: true`. Discarding a good clip costs
 * a re-synthesis and can strip a learner's audio down to silence; keeping a
 * questionable one costs nothing beyond the status quo. Only a clip we can
 * positively show is missing content is failed.
 */
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { normalizeLatin, isEffectivelyEmpty } from "./pronunciationGuards";
import { romanizeTranscript } from "./romanizeTranscript";

/**
 * Fraction of the expected phonetic length a clip must carry to pass.
 *
 * The observed dropped-word take transcribed to 54% of its phrase; healthy
 * takes of the same phrase land at ~100%. 0.7 sits clear of both, leaving room
 * for recognizers that compress a syllable or two without inventing a cliff
 * that normal variation can fall off.
 */
export const MIN_COVERAGE = 0.7;

/**
 * Upper bound before a clip counts as speaking material that is not the phrase
 * (delivery instructions read aloud, the meaning appended, a repeat). Set well
 * clear of 1.0 because recognizers routinely spell a phrase longer than its
 * romanization does.
 */
export const MAX_COVERAGE = 2.2;

/**
 * Phrases shorter than this many normalized letters are not length-checkable, a single recognizer quirk swings the ratio past any threshold. They are
 * reported unverifiable rather than risked.
 */
export const MIN_CHECKABLE_LENGTH = 6;

export type PhraseAudioStatus =
  | "verified"
  | "short"
  | "long"
  | "empty"
  | "unverifiable";

export type PhraseAudioVerdict = {
  /** False only when the clip is demonstrably not the whole phrase. */
  ok: boolean;
  status: PhraseAudioStatus;
  /** Raw recognizer output, kept for logs and audit reports. */
  heard: string;
  /** Heard phonetic length ÷ expected phonetic length; null when not checkable. */
  coverage: number | null;
  /** Why an ambiguous clip was passed, for audit output. */
  note?: string;
};

export type TranscribeFn = (
  audio: Buffer,
  format: "mp3" | "wav",
  languageCode: string,
) => Promise<string>;

/** Mirrors languages.speech_capability. */
export type SpeechCapability = "supported" | "degraded" | "unsupported";

/**
 * Verification borrows the recognizer, so it inherits the recognizer's blind
 * spots. For languages the per-language probe already found it cannot hear, Santali comes back as an empty transcript every time, Manipuri as unrelated
 * Latin, a failing verdict says nothing about the audio. Those languages are
 * reported unverifiable up front, before a pointless API call.
 */
export function isSpeechVerifiable(capability: SpeechCapability | null | undefined): boolean {
  return (capability ?? "supported") === "supported";
}

const defaultTranscribe: TranscribeFn = (audio, format, languageCode) =>
  speechToText(audio, format, { language: languageCode });

/**
 * The phrase reduced to comparable Latin letters.
 *
 * Prefers the phrase's own `romanized` column, it is authored alongside the
 * native text and is already Latin. Falls back to transliterating the native
 * script for rows that have no romanization.
 */
export function expectedPhonetics(
  nativeScript: string,
  romanized: string | null | undefined,
  languageCode: string,
): string {
  const fromColumn = normalizeLatin(romanized ?? "");
  if (fromColumn) return fromColumn;
  return normalizeLatin(romanizeTranscript(nativeScript, languageCode));
}

/**
 * The recognizer output reduced to the same comparable form.
 *
 * Returns "" when the transcript is in a script we cannot transliterate (the
 * recognizer drifting into Cyrillic, say). That is an unverifiable outcome, not
 * a failing one.
 */
export function heardPhonetics(heard: string, languageCode: string): string {
  const direct = normalizeLatin(heard);
  const viaRomanization = normalizeLatin(romanizeTranscript(heard, languageCode));
  // Whichever survives normalization with more signal is the better read: a
  // native-script transcript yields nothing directly but romanizes cleanly,
  // while a Latin transcript romanizes to itself.
  return viaRomanization.length > direct.length ? viaRomanization : direct;
}

/**
 * Listen to a synthesized clip and decide whether it speaks the whole phrase.
 *
 * @param transcribe - Injectable recognizer, for tests.
 */
export async function verifyPhraseAudio(args: {
  audio: Buffer;
  format?: "mp3" | "wav";
  nativeScript: string;
  romanized?: string | null;
  languageCode: string;
  speechCapability?: SpeechCapability | null;
  transcribe?: TranscribeFn;
}): Promise<PhraseAudioVerdict> {
  const {
    audio,
    format = "mp3",
    nativeScript,
    romanized,
    languageCode,
    speechCapability,
    transcribe = defaultTranscribe,
  } = args;

  if (audio.length === 0) {
    return { ok: false, status: "empty", heard: "", coverage: null, note: "no audio bytes" };
  }

  if (!isSpeechVerifiable(speechCapability)) {
    return {
      ok: true,
      status: "unverifiable",
      heard: "",
      coverage: null,
      note: `speech recognition cannot hear ${languageCode} well enough to verify`,
    };
  }

  const expected = expectedPhonetics(nativeScript, romanized, languageCode);
  if (expected.length < MIN_CHECKABLE_LENGTH) {
    return {
      ok: true,
      status: "unverifiable",
      heard: "",
      coverage: null,
      note: `phrase too short to length-check (${expected.length} letters)`,
    };
  }

  let heard: string;
  try {
    heard = await transcribe(audio, format, languageCode);
  } catch (err) {
    // A recognizer outage must never be read as bad audio.
    return {
      ok: true,
      status: "unverifiable",
      heard: "",
      coverage: null,
      note: `transcription failed: ${(err as Error).message}`,
    };
  }

  if (isEffectivelyEmpty(heard)) {
    return { ok: false, status: "empty", heard, coverage: null, note: "clip transcribes to nothing" };
  }

  const heardLatin = heardPhonetics(heard, languageCode);
  if (!heardLatin) {
    return {
      ok: true,
      status: "unverifiable",
      heard,
      coverage: null,
      note: "transcript is in a script we cannot compare",
    };
  }

  const coverage = heardLatin.length / expected.length;
  if (coverage < MIN_COVERAGE) {
    return { ok: false, status: "short", heard, coverage };
  }
  if (coverage > MAX_COVERAGE) {
    return { ok: false, status: "long", heard, coverage };
  }
  return { ok: true, status: "verified", heard, coverage };
}
