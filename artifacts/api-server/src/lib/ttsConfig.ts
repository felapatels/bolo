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
