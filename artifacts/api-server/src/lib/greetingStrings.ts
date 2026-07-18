/**
 * Fixed greeting text played on the first Bolo chat turn.
 *
 * When the user finishes their very first recording the client immediately
 * injects this canned message (already cached as audio) so there is no
 * silent wait while STT → LLM → TTS completes. The real reply runs in the
 * background and plays right after the greeting finishes.
 */

/**
 * Version tag baked into the greeting audio cache key.
 * Bump this string whenever the greeting text changes so the stale cached
 * audio is automatically invalidated and re-synthesized.
 */
export const GREETING_CACHE_KEY_VERSION = "v1";

/**
 * Stable per-language cache key stored in tts_cache.
 * Uses a plain prefix + languageCode (not a SHA-256 hash) because the
 * greeting text is computed deterministically from the languageCode alone.
 */
export function greetingAudioCacheKey(languageCode: string): string {
  return `bolo-greeting-${GREETING_CACHE_KEY_VERSION}::${languageCode}`;
}

/**
 * The full greeting text shown in Bolo's bubble.
 * "Squawk!" is a bird-sound placeholder that clients replace with a squawk SFX;
 * the emoji is kept for display but stripped before TTS synthesis.
 */
export function buildGreetingDisplayText(languageName: string): string {
  return `Hi, before we chat, I want you to know… Squawk! You can chat with me in English or ${languageName}! 🦜`;
}

/**
 * The text actually passed to the TTS synthesizer — Squawk! and emoji removed
 * so the voice speaks naturally.
 */
export function buildGreetingTtsText(languageName: string): string {
  return `Hi, before we chat, I want you to know… You can chat with me in English or ${languageName}!`;
}

/**
 * The squawk SFX variant used for the greeting (always the same so the
 * welcome chirp is consistent rather than randomized per session).
 */
export const GREETING_SQUAWK_VARIANT: 0 | 1 | 2 = 0;
