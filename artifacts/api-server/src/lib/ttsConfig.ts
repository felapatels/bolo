import { getVoiceIdForLanguage } from "./languageVoice";

/**
 * PRIMARY TTS PROVIDER SELECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Set TTS_PROVIDER to one of the three supported values:
 *
 *   'gpt-audio'       → all voice synthesis uses gpt-audio via chat completions
 *                       (current default — no behaviour change).
 *
 *   'gpt-4o-mini-tts' → uses the dedicated speech endpoint (gpt-4o-mini-tts),
 *                       with gpt-audio as an automatic fallback. Audio output
 *                       is billed at the dedicated speech rate, not the
 *                       multimodal chat rate.
 *
 *   'elevenlabs'      → phrase practice, parrot chat, and greetings all use
 *                       ElevenLabs (Laura, eleven_multilingual_v2) with
 *                       gpt-audio as an automatic fallback.
 *
 * All provider code is fully preserved in the codebase. Nothing was deleted.
 * Changing this value and restarting the server is all that is required to
 * switch providers.
 */
export type TtsProvider = "gpt-audio" | "gpt-4o-mini-tts" | "elevenlabs";

export const TTS_PROVIDER = "gpt-audio" as TtsProvider;

/**
 * Derived from TTS_PROVIDER for backward compatibility with existing readers
 * in ttsPrewarm.ts and routes/openai.ts. Do not remove.
 */
export const USE_ELEVENLABS_TTS = TTS_PROVIDER === "elevenlabs";

// Default OpenAI voice used for phrase audio on non-ElevenLabs providers.
// "nova" is the same default that /openai/tts resolves when no voice is sent.
const PHRASE_AUDIO_DEFAULT_VOICE = "nova";

// ElevenLabs model required for correct Indic and other non-Latin script
// synthesis. eleven_flash_v2_5 does not handle Gujarati, Tamil, etc.
const PHRASE_ELEVENLABS_MODEL = "eleven_multilingual_v2";

/**
 * Identifies the synthesis parameters used for a phrase audio cache entry.
 * Returned by phraseAudioIdentity and consumed by both the phrase prewarm and
 * the /openai/tts playback route so they always target the same key namespace.
 */
export type PhraseAudioIdentity = {
  provider: TtsProvider;
  model: string;
  /** Resolved synthesis voice — per-language for ElevenLabs, fixed for other providers. */
  voice: string;
};

/**
 * Single source of truth for phrase-audio synthesis identity.
 *
 * Returns the provider, model, and voice for the currently configured
 * TTS_PROVIDER. Both the phrase prewarm (ttsPrewarm.ts) and the playback
 * route (/openai/tts) MUST call this function and derive their cache key and
 * synthesis parameters exclusively from it. This is what keeps the two sides
 * in the same key namespace — if either side derives these values
 * independently they will silently diverge again.
 *
 * For ElevenLabs the voice is resolved per language so cache entries for
 * different languages never collide. For other providers it is a fixed
 * constant because those providers are language-agnostic at the voice level.
 */
export function phraseAudioIdentity(languageCode?: string): PhraseAudioIdentity {
  switch (TTS_PROVIDER) {
    case "elevenlabs":
      return {
        provider: "elevenlabs",
        model: PHRASE_ELEVENLABS_MODEL,
        voice: getVoiceIdForLanguage(languageCode),
      };
    case "gpt-4o-mini-tts":
      return {
        provider: "gpt-4o-mini-tts",
        model: "gpt-4o-mini-tts",
        voice: PHRASE_AUDIO_DEFAULT_VOICE,
      };
    case "gpt-audio":
    default:
      return {
        provider: "gpt-audio",
        model: "gpt-audio",
        voice: PHRASE_AUDIO_DEFAULT_VOICE,
      };
  }
}
