/**
 * Phrase-audio synthesis, with verification built in.
 *
 * Phrase clips are cached permanently under a content-addressed key, so a take
 * that drops a word becomes that phrase's permanent voice (see
 * phraseAudioVerify.ts for the field report that prompted this). The fix is to
 * listen to a take before it is allowed into the cache, and to spend another
 * take when the first one is demonstrably incomplete.
 *
 * Every writer of phrase audio — the startup pre-warm, the audit's replacement
 * pass — goes through synthesizeVerifiedPhraseAudio so no path can quietly
 * cache an unheard take. The live playback route is the deliberate exception:
 * a learner is waiting on that response, so it serves its take immediately and
 * verifies afterwards, dropping the cache row if the take turns out bad.
 */
import {
  openai,
  textToSpeech,
  textToSpeechElevenLabs,
} from "@workspace/integrations-openai-ai-server/audio";
import type { PhraseAudioIdentity } from "./ttsConfig";
import {
  verifyPhraseAudio,
  type PhraseAudioVerdict,
  type SpeechCapability,
  type TranscribeFn,
} from "./phraseAudioVerify";

/** How many takes a phrase gets before we accept the best one we heard. */
export const MAX_TAKES = 3;

export type SynthesizeFn = (text: string) => Promise<Buffer>;

/**
 * One synthesis call against whichever provider the identity names.
 *
 * Mirrors the provider switch that previously lived inline in both the
 * pre-warm worker and the playback route.
 */
export async function synthesizePhraseAudio(
  text: string,
  identity: PhraseAudioIdentity,
  opts: { languageName?: string; elevenLabsLanguageId?: string } = {},
): Promise<Buffer> {
  switch (identity.provider) {
    case "gpt-4o-mini-tts": {
      const response = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voice: identity.voice as any,
        input: text,
        response_format: "mp3",
      });
      return Buffer.from(await response.arrayBuffer());
    }
    case "elevenlabs":
      return textToSpeechElevenLabs(
        text,
        identity.voice,
        opts.languageName || undefined,
        undefined,
        opts.elevenLabsLanguageId,
      );
    default:
      return textToSpeech(
        text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        identity.voice as any,
        "mp3",
        opts.languageName || undefined,
      );
  }
}

export type VerifiedSynthesis = {
  audio: Buffer;
  verdict: PhraseAudioVerdict;
  /** How many synthesis calls were spent. */
  takes: number;
};

/**
 * Synthesize a phrase and keep going until a take demonstrably speaks it.
 *
 * Returns the first take that verifies. If every take fails — a phrase the
 * recognizer simply cannot read back, or a genuine provider problem — the take
 * that carried the most of the phrase is returned with its failing verdict, so
 * the caller can still give the learner audio rather than silence while
 * knowing it is unverified.
 */
export async function synthesizeVerifiedPhraseAudio(args: {
  nativeScript: string;
  romanized?: string | null;
  languageCode: string;
  languageName?: string;
  speechCapability?: SpeechCapability | null;
  identity: PhraseAudioIdentity;
  elevenLabsLanguageId?: string;
  maxTakes?: number;
  synthesize?: SynthesizeFn;
  transcribe?: TranscribeFn;
}): Promise<VerifiedSynthesis> {
  const {
    nativeScript,
    romanized,
    languageCode,
    languageName,
    speechCapability,
    identity,
    elevenLabsLanguageId,
    maxTakes = MAX_TAKES,
    transcribe,
  } = args;

  const synthesize: SynthesizeFn =
    args.synthesize ??
    ((text) =>
      synthesizePhraseAudio(text, identity, {
        languageName,
        elevenLabsLanguageId,
      }));

  let best: VerifiedSynthesis | null = null;

  for (let take = 1; take <= maxTakes; take++) {
    const audio = await synthesize(nativeScript);
    if (audio.length === 0) throw new Error(`${identity.provider} returned empty audio`);

    const verdict = await verifyPhraseAudio({
      audio,
      nativeScript,
      romanized,
      languageCode,
      speechCapability,
      transcribe,
    });
    if (verdict.ok) return { audio, verdict, takes: take };

    // Keep whichever rejected take carried the most of the phrase, so a
    // caller that runs out of takes still hands over the least-bad audio.
    const coverage = verdict.coverage ?? 0;
    const bestCoverage = best?.verdict.coverage ?? -1;
    if (!best || coverage > bestCoverage) best = { audio, verdict, takes: take };
  }

  // Unreachable unless maxTakes < 1; the loop always assigns `best` on failure.
  if (!best) throw new Error("synthesizeVerifiedPhraseAudio: no takes attempted");
  return { ...best, takes: maxTakes };
}
