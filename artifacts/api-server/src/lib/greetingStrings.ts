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
export const GREETING_CACHE_KEY_VERSION = "v8";

/**
 * Provider-aware per-language cache key stored in tts_cache.
 *
 * Incorporates provider, model, voice, and a digest of the chat instructions
 * in effect so that any configuration change (provider switch, voice change,
 * or instructions edit) automatically orphans old entries and forces fresh
 * synthesis. The instructionsDigest must be BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST
 * from ttsConfig — never the phrase digest — because greetings are
 * conversational, not pronunciation-reference audio.
 *
 * Both the /openai/chat-greeting route and warmGreetings() MUST call this
 * function with resolver-derived values. Neither may derive provider, model,
 * voice, or instructions independently.
 */
export function greetingAudioCacheKey(
  languageCode: string,
  provider: string,
  model: string,
  voice: string,
  instructionsDigest: string,
): string {
  return `bolo-greeting-${GREETING_CACHE_KEY_VERSION}::${provider}::${model}::${voice}::${instructionsDigest}::${languageCode}`;
}

/**
 * The canned buffer line, played the moment the learner's first recording ends
 * so there is no silence while STT -> LLM -> TTS runs. The real reply plays
 * straight after it.
 *
 * ENGLISH, IN EVERY LANGUAGE (owner ruling, Aug 18 2026). This used to be a
 * hand-written native-script greeting per language ("नमस्ते! आप मुझसे अंग्रेज़ी
 * या हिंदी में बात कर सकते हैं!"), which was charming and told a beginner
 * nothing they could read. The buffer's whole job is to set expectations
 * before the first real answer, and a learner who cannot yet read the script
 * cannot receive that. It now says the one thing worth saying, in the one
 * language every learner here shares, and says it as an aside rather than a
 * greeting because by this point the learner has already spoken.
 *
 * The 22 native greetings it replaced are in git history if they are ever
 * wanted back: they were removed in the commit that introduced this comment.
 */
export function buildGreetingTexts(
  _languageCode: string,
  languageName: string,
): { display: string; tts: string; english: string } {
  const text = buildGreetingTtsText(languageName);
  return {
    display: `${text} 🦜`,
    tts: text,
    // No English subtitle: the line above already IS the English.
    english: "",
  };
}

/**
 * Bolo's bubble text. The emoji is kept for display and stripped before TTS
 * synthesis, which is the convention every greeting here has followed.
 */
export function buildGreetingDisplayText(languageName: string): string {
  return `${buildGreetingTtsText(languageName)} 🦜`;
}

/**
 * The text actually passed to the synthesizer.
 *
 * PERMISSION TO MIX IS THE LOAD-BEARING HALF: a beginner's instinct is that
 * mixing languages is cheating, and this is the only place that tells them
 * otherwise before they have to speak again.
 *
 * IN BOLO'S VOICE, rewritten 2026-08-23. The previous line, "By the way, before
 * I respond, you can chat with me in English, X, or a combo. Just do your
 * best!", was reported from testing as sounding American rather than like Bolo,
 * and it was: flat, coachy, and with no parrot anywhere in it. Bolo is a
 * bubbly, cheeky, rainbow-feathered parrot who refers to himself in the third
 * person and reaches for bird imagery ("That's not in Bolo's nest!"), which is
 * the register the chat system prompt sets and every other line he speaks
 * keeps. A buffer line is still Bolo talking, so it has to sound like him.
 *
 * It stays ENGLISH in every language (owner ruling, Aug 18 2026): the buffer's
 * whole job is to set expectations before the first real answer, and a learner
 * who cannot yet read the script cannot receive that.
 *
 * Bump GREETING_CACHE_KEY_VERSION whenever this text changes or every learner
 * keeps hearing the old line from the audio cache. Done: v7 to v8.
 */
export function buildGreetingTtsText(languageName: string): string {
  return `Ooh, one quick thing while I think! You can talk to me in English, in ${languageName}, or mix them right up. Bolo loves a good jumble!`;
}

/**
 * The squawk SFX variant used for the greeting (always the same so the
 * welcome chirp is consistent rather than randomized per session).
 */
export const GREETING_SQUAWK_VARIANT: 0 | 1 | 2 = 0;
