import { createHash } from "node:crypto";

/**
 * Chacha-ji's own spoken lines at the roadside chai stall.
 *
 * These are the CHARACTER speaking, not content to learn: the text is fixed
 * romanized Hindi for every learner regardless of journey language, and it is
 * never localized, scored, graded or recorded.
 *
 * This module is deliberately self-contained. It must NOT call
 * phraseAudioIdentity() and must not read the phrase or chat voice constants
 * in ttsConfig.ts — Chacha has his own voice, and coupling him to the phrase
 * or chat identity would re-voice him whenever those change (or re-voice them
 * whenever he changes). The greeting-audio identity in greetingStrings.ts is
 * the pattern this follows; the phrase identity is not.
 */

export const CHACHA_LINE_KEYS = ["greeting", "gift", "farewell"] as const;

export type ChachaLineKey = (typeof CHACHA_LINE_KEYS)[number];

/**
 * The three lines, owner-approved. Do not reword.
 *
 * `text` is what he says (and what is synthesized and shown on screen);
 * `english` is the on-screen gloss beneath it (owner-approved August 13, 2026).
 * "beta" stays untranslated in the farewell gloss by owner ruling: it is a
 * term of affection, not vocabulary, and "child"/"son" reads cold in English
 * where the Hindi reads warm.
 */
export const CHACHA_LINES: Record<
  ChachaLineKey,
  { text: string; english: string }
> = {
  greeting: {
    text: "Aao, aao. Chai piyo.",
    english: "Come, come. Have some chai.",
  },
  gift: {
    text: "Yeh lo. Garam hai.",
    english: "Here you go. It's hot.",
  },
  farewell: {
    text: "Phir aana, beta.",
    english: "Come again, beta.",
  },
};

/** Synthesis provider for Chacha's lines. Fixed by owner ruling. */
export const CHACHA_TTS_PROVIDER = "gpt-4o-mini-tts";

/** Synthesis model for Chacha's lines. Fixed by owner ruling. */
export const CHACHA_TTS_MODEL = "gpt-4o-mini-tts";

/**
 * Chacha's voice. A male voice, distinct from the coach voice (nova) that
 * reads phrase and meaning audio — he is a character, not the coach.
 * Deliberately NOT PHRASE_AUDIO_DEFAULT_VOICE or BOLO_MINI_TTS_VOICE.
 */
export const CHACHA_TTS_VOICE = "echo";

/** Audio container the three clips are synthesized and cached in. */
export const CHACHA_AUDIO_FORMAT = "mp3";

/**
 * Delivery instructions for Chacha's lines, reproduced CHARACTER FOR CHARACTER
 * from the string the owner-approved voice samples were generated with
 * (`.local/chacha-voice-samples/chacha-echo-*.mp3`).
 *
 * The em dash in the Tone line is intentional and must stay. The project's
 * no-em-dash house rule governs copy we author; this is the reproduction of a
 * verified artifact, and editing it changes the voice the owner signed off on.
 * Any edit here also rotates the cache namespace via the digest below, which
 * is the intended safety net, not a licence to reword.
 */
export const CHACHA_TTS_INSTRUCTIONS = `Personality/affect: a warm, unhurried older Indian man who runs a roadside chai stall and treats every traveller who stops as family.

Voice: Older male, warm and lightly gravelly, relaxed and grandfatherly, with a natural Indian accent.

Tone: Affectionate and welcoming, never rushed — the ease of someone who has poured this same cup a thousand times.

Dialect: Everyday Hinglish of an Indian street vendor; familiar, informal address.

Pronunciation: Unhurried and clearly articulated, with natural Indian-English rhythm and rounded vowels, and a small settling pause between short sentences.

Features: Gentle, low-volume delivery with a smile in the voice; a slight lift on the invitation, settling into calm warmth at the end.`;

/**
 * First 8 hex characters of the SHA-256 of CHACHA_TTS_INSTRUCTIONS.
 * Baked into the cache key so an instructions edit orphans stale clips
 * instead of serving audio recorded under different direction.
 */
export const CHACHA_TTS_INSTRUCTIONS_DIGEST = createHash("sha256")
  .update(CHACHA_TTS_INSTRUCTIONS)
  .digest("hex")
  .slice(0, 8);

/**
 * Version tag baked into Chacha's audio cache key.
 * Bump this whenever a LINE'S WORDING changes (the voice, model, provider and
 * instructions rotate the key on their own through the segments below), so the
 * stale clip is orphaned rather than served.
 */
export const CHACHA_CACHE_KEY_VERSION = "v1";

/**
 * Cache key for one of Chacha's lines, stored in tts_cache.
 *
 * Its own namespace: it shares nothing with the phrase key scheme or the
 * greeting key, so neither a phrase-instructions edit nor a provider switch
 * for phrase audio can orphan or collide with his clips.
 *
 * Both the prewarm (warmChachaLines) and the playback route
 * (GET /openai/chacha-lines) MUST call this function with the module's own
 * constants. Neither may derive provider, model, voice or instructions
 * independently.
 */
export function chachaAudioCacheKey(
  lineKey: ChachaLineKey,
  provider: string,
  model: string,
  voice: string,
  instructionsDigest: string,
): string {
  return `bolo-chacha-${CHACHA_CACHE_KEY_VERSION}::${provider}::${model}::${voice}::${instructionsDigest}::${lineKey}`;
}

/** Convenience: the cache key for a line using this module's fixed identity. */
export function chachaLineCacheKey(lineKey: ChachaLineKey): string {
  return chachaAudioCacheKey(
    lineKey,
    CHACHA_TTS_PROVIDER,
    CHACHA_TTS_MODEL,
    CHACHA_TTS_VOICE,
    CHACHA_TTS_INSTRUCTIONS_DIGEST,
  );
}
