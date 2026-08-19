import { createHash } from "node:crypto";
import { BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST } from "./ttsConfig";

/**
 * TTS provider version segment baked into every cache key.
 *
 * Phrase audio switched providers (gpt-audio → ElevenLabs). Old cached audio
 * carries the previous provider's voice, and keys without a provider segment
 * would serve it forever. Including the provider in the key means every
 * lookup for the new provider is a clean miss against old entries, which are
 * then lazily re-synthesized. Bump this string whenever the provider or its
 * voice/model changes in a way learners can hear.
 */
export const TTS_PROVIDER_VERSION = "elevenlabs:v3:eleven_multilingual_v2:langid";

/**
 * Stable cache key: SHA-256 hex of the synthesis inputs + provider version.
 *
 * @param elevenLabsVoiceId - The resolved ElevenLabs voice ID used for
 *   synthesis (e.g. "nPczCjzI2devNBz1zQrb" for Brian). Including this ensures
 *   that two requests for the same text in different languages, which map to
 *   different ElevenLabs voices, never collide on the same cache entry and
 *   serve audio synthesized with the wrong voice.
 */
export function ttsCacheKey(
  text: string,
  voice: string,
  languageName?: string,
  elevenLabsVoiceId?: string,
): string {
  return createHash("sha256")
    .update(text)
    .update("\x00")
    .update(voice)
    .update("\x00")
    .update(languageName?.trim() ?? "")
    .update("\x00")
    .update(elevenLabsVoiceId ?? "")
    .update("\x00")
    .update(TTS_PROVIDER_VERSION)
    .digest("hex");
}

/**
 * The pre-ElevenLabs cache key scheme (no provider segment).
 *
 * Old entries synthesized by the previous provider still live in tts_cache
 * under these keys. They are never served on the happy path anymore, but the
 * /openai/tts route falls back to them when ElevenLabs synthesis fails (e.g.
 * monthly quota exhausted) so a learner hears the old voice rather than
 * silence or an error. The eviction endpoint also deletes these keys so
 * phrase corrections purge the fallback audio too.
 */
/**
 * Key scheme version for the unified phrase TTS cache.
 *
 * Bump this string whenever the phrase synthesis path changes in a way
 * learners can hear (different provider, model, or voice), so old entries
 * become clean misses rather than serving stale audio under a different voice.
 */
const PHRASE_KEY_SCHEME = `phrase:v2:${BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST}`;

/**
 * Phrase-audio cache key: SHA-256 hex of the five synthesis inputs plus an
 * explicit key scheme version.
 *
 * Used by both the phrase prewarm (ttsPrewarm.ts) and the /openai/tts
 * playback route to ensure writes and reads always target the same namespace.
 * Both sides MUST derive provider, model, and voice exclusively from
 * phraseAudioIdentity() in ttsConfig.ts, never hardcoded, so the inputs
 * to this function are always identical on both sides for the same phrase
 * under the same configuration.
 *
 * @param text               - Phrase text (native script) passed to synthesis.
 * @param provider           - TTS provider name (e.g. "gpt-audio").
 * @param model              - Synthesis model name (e.g. "gpt-4o-mini-tts").
 * @param voice              - Synthesis voice (fixed or per-language).
 * @param languageIdentifier - Language display name as sent by the client,
 *                             matching what /openai/tts receives as languageName.
 */
export function phraseTtsCacheKey(
  text: string,
  provider: string,
  model: string,
  voice: string,
  languageIdentifier: string,
): string {
  return createHash("sha256")
    .update(text)
    .update("\x00")
    .update(provider)
    .update("\x00")
    .update(model)
    .update("\x00")
    .update(voice)
    .update("\x00")
    .update(languageIdentifier)
    .update("\x00")
    .update(PHRASE_KEY_SCHEME)
    .digest("hex");
}

export function legacyTtsCacheKey(
  text: string,
  voice: string,
  languageName?: string,
): string {
  return createHash("sha256")
    .update(text)
    .update("\x00")
    .update(voice)
    .update("\x00")
    .update(languageName?.trim() ?? "")
    .digest("hex");
}
