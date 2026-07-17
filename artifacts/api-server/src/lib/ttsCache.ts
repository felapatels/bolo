import { createHash } from "node:crypto";

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
export const TTS_PROVIDER_VERSION = "elevenlabs:JBFqnCBsd6RMkjVDRZzb:eleven_multilingual_v2";

/** Stable cache key: SHA-256 hex of the synthesis inputs + provider version. */
export function ttsCacheKey(
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
