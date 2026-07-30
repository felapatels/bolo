import { createHash } from "node:crypto";
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

export const TTS_PROVIDER = "gpt-4o-mini-tts" as TtsProvider;

/**
 * Derived from TTS_PROVIDER for backward compatibility with existing readers
 * in ttsPrewarm.ts and routes/openai.ts. Do not remove.
 */
export const USE_ELEVENLABS_TTS = TTS_PROVIDER === "elevenlabs";

// ---------------------------------------------------------------------------
// Delivery instructions for gpt-4o-mini-tts synthesis
// ---------------------------------------------------------------------------
// Two separate constants so chat personality and phrase pronunciation guidance
// can diverge later without restructuring or requiring a second cache key change.
// Both currently hold identical text; that is intentional.

/**
 * Delivery instructions for gpt-4o-mini-tts chat reply audio.
 * Passed as the `instructions` parameter to audio.speech.create in boloTTSMini
 * and boloTTSMiniStream. Not applicable to gpt-audio or ElevenLabs paths.
 */
export const BOLO_CHAT_TTS_INSTRUCTIONS = `Personality/affect: a high-energy cheerleader helping with administrative tasks

Voice: Enthusiastic, and bubbly, with an uplifting and motivational quality with an indian tone.

Tone: Encouraging and playful, making even simple tasks feel exciting and fun.

Dialect: Casual and upbeat, using informal phrasing and pep talk-style expressions.

Pronunciation: Crisp and lively, with exaggerated emphasis on positive words to keep the energy high.

Features: Uses motivational phrases, cheerful exclamations, and an energetic rhythm to create a sense of excitement and engagement.`;

/**
 * Delivery instructions for gpt-4o-mini-tts phrase audio synthesis.
 * Incorporated into the phrase TTS cache key via BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST
 * so a change here automatically orphans old cache entries rather than serving
 * stale audio. Revisit this constant independently from BOLO_CHAT_TTS_INSTRUCTIONS
 * once phrase audio with these instructions has been evaluated — exaggerated emphasis
 * and pep-talk rhythm may work against pronunciation-reference use.
 */
export const BOLO_PHRASE_TTS_INSTRUCTIONS = `Personality/affect: a high-energy cheerleader helping with administrative tasks

Voice: Enthusiastic, and bubbly, with an uplifting and motivational quality with an indian tone.

Tone: Encouraging and playful, making even simple tasks feel exciting and fun.

Dialect: Casual and upbeat, using informal phrasing and pep talk-style expressions.

Pronunciation: Crisp and lively, with exaggerated emphasis on positive words to keep the energy high.

Features: Uses motivational phrases, cheerful exclamations, and an energetic rhythm to create a sense of excitement and engagement.`;

/**
 * First 8 hex characters of the SHA-256 of BOLO_CHAT_TTS_INSTRUCTIONS.
 * Used in [tts] log lines so the identifier changes automatically when the
 * instructions are edited, without logging the full instruction text.
 */
export const BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST = createHash("sha256")
  .update(BOLO_CHAT_TTS_INSTRUCTIONS)
  .digest("hex")
  .slice(0, 8);

/**
 * First 8 hex characters of the SHA-256 of BOLO_PHRASE_TTS_INSTRUCTIONS.
 * Imported by ttsCache.ts and baked into the PHRASE_KEY_SCHEME so the cache
 * key namespace rotates automatically whenever the phrase instructions change.
 */
export const BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST = createHash("sha256")
  .update(BOLO_PHRASE_TTS_INSTRUCTIONS)
  .digest("hex")
  .slice(0, 8);

// Default OpenAI voice used for phrase audio on non-ElevenLabs providers.
// "nova" is the same default that /openai/tts resolves when no voice is sent.
// Exported so the parrotChat divergence-guard test can assert the chat reply
// voice (BOLO_MINI_TTS_VOICE) stays equal to this phrase/greeting default.
export const PHRASE_AUDIO_DEFAULT_VOICE = "nova";

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
  /**
   * Delivery instructions applicable to phrase audio synthesis for this provider.
   * Empty string for providers that do not accept an instructions parameter
   * (gpt-audio, ElevenLabs). Non-empty for gpt-4o-mini-tts.
   * Incorporated into the phrase cache key digest so changing instructions
   * automatically orphans stale entries.
   */
  instructions: string;
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
export function phraseAudioIdentity(
  languageCode?: string,
): PhraseAudioIdentity {
  switch (TTS_PROVIDER) {
    case "elevenlabs":
      return {
        provider: "elevenlabs",
        model: PHRASE_ELEVENLABS_MODEL,
        voice: getVoiceIdForLanguage(languageCode),
        instructions: "",
      };
    case "gpt-4o-mini-tts":
      return {
        provider: "gpt-4o-mini-tts",
        model: "gpt-4o-mini-tts",
        voice: PHRASE_AUDIO_DEFAULT_VOICE,
        instructions: BOLO_PHRASE_TTS_INSTRUCTIONS,
      };
    case "gpt-audio":
    default:
      return {
        provider: "gpt-audio",
        model: "gpt-audio",
        voice: PHRASE_AUDIO_DEFAULT_VOICE,
        instructions: "",
      };
  }
}
