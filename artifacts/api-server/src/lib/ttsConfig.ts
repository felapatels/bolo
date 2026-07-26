/**
 * PRIMARY TTS PROVIDER SWITCH
 * ─────────────────────────────────────────────────────────────────────────────
 * Set USE_ELEVENLABS_TTS = true  → phrase practice, parrot chat, and greetings
 *                                  all use ElevenLabs (Laura, eleven_multilingual_v2)
 *                                  with gpt-audio as an automatic fallback.
 *
 * Set USE_ELEVENLABS_TTS = false → all voice synthesis uses gpt-audio (OpenAI)
 *                                  directly; ElevenLabs is never called.
 *
 * All ElevenLabs integration code — voice IDs, voice settings, quota monitors,
 * streaming paths, per-language voice catalog — is fully preserved in the
 * codebase. Nothing was deleted. Flip this flag back to true and restart the
 * server to restore ElevenLabs with no further changes required.
 */
export const USE_ELEVENLABS_TTS = false;
