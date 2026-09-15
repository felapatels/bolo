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
 * Chacha's voice. A male voice, distinct from the coach voice that reads phrase
 * and meaning audio: he is a character, not the coach. Deliberately NOT
 * PHRASE_AUDIO_DEFAULT_VOICE or BOLO_MINI_TTS_VOICE.
 *
 * HE STAYS ON `echo` WHILE THE REST OF INDIA MOVED TO ELEVENLABS, and this is
 * an owner decision (2026-09-13, "a"), not an oversight. Do not "finish the
 * job" by giving him the ElevenLabs voice picked for him in the audition
 * (Vedish, idRuFqIwDCUGD5dydSIh). Here is why it does not work:
 *
 * HIS CALL IS TWO ENGINES AND ONLY ONE OF THEM CAN BE ELEVENLABS.
 * `routes/chachaCall.ts` imports both halves. `callLine` serves CANNED lines,
 * which are synthesized and cached and could be anything. `runLiveTurn` serves
 * LIVE beats through `chachaCallTurn.ts`, which is
 * `model: "gpt-audio"` with `audio: { voice: CHACHA_TTS_VOICE, format: "pcm16" }`.
 * That is OpenAI's own realtime audio: **ElevenLabs cannot supply it.** A single
 * call plays canned and live lines back to back, so moving only the half that
 * can move makes his voice change mid-conversation.
 *
 * THE FORKS ACCEPTED A SMALLER VERSION OF THIS AND INDIA DID NOT. There the
 * elder's STALL lines are ElevenLabs while the whole CALL is OpenAI, so he has
 * one voice at the stall and another on the phone. Two scenes, minutes apart,
 * which the owner chose to leave. Mid-call is a different thing.
 *
 * WHAT WOULD ACTUALLY FIX IT is on the roadmap: take the live beat off
 * gpt-audio and synthesize its reply text through textToSpeechElevenLabsStream,
 * which already exists and is what the bird uses. The cost is latency, because
 * today the audio streams as the model generates it. On a phone call that gap
 * is the feature, which is why it is a roadmap item and not a cleanup.
 *
 * His lines are Hindi for every learner (CHACHA_LINES is one set, not a map),
 * so there is no per-language question here the way there is for the coach.
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

/**
 * The synthesis identity the elder speaks with in a language.
 *
 * THE FORKS' SHAPE, GIVEN TO INDIA 2026-09-15 for Answer Back's elder voice
 * (owner ruling, option A). Each fork already has this function, backed by a
 * per-language ElevenLabs map; the elder phrase path resolves through it so the
 * same route code ports to them unchanged.
 *
 * IN INDIA IT RETURNS THE SAME IDENTITY FOR EVERY LANGUAGE, on purpose. His
 * call is half gpt-audio, which ElevenLabs cannot supply, so the owner kept him
 * on `echo` (2026-09-13, "a", the long note on CHACHA_TTS_VOICE). His canned
 * call lines already speak every learner language through this identity
 * (chachaCallLines.ts), so a learner hears the same man at the stall, on his
 * call, and in Answer Back. The language parameter exists for the forks' shape,
 * not for a choice India makes.
 */
export function uncleSynthesisIdentity(_languageCode: string): {
  provider: string;
  model: string;
  voice: string;
} {
  return { provider: CHACHA_TTS_PROVIDER, model: CHACHA_TTS_MODEL, voice: CHACHA_TTS_VOICE };
}

/**
 * Version tag of the elder PHRASE namespace. Bump it if the way an elder phrase
 * is synthesized changes in a way the identity segments below cannot see.
 */
export const ELDER_PHRASE_CACHE_KEY_VERSION = "v1";

/**
 * Cache key for a lesson phrase spoken BY THE ELDER (Answer Back's keeper line,
 * `speaker: "elder"` on POST /openai/tts), stored in tts_cache.
 *
 * ITS OWN NAMESPACE, and each segment is there for a reason:
 *  - the `bolo-elder-phrase-` prefix cannot equal a coach phrase key (a bare
 *    64-character SHA-256 hex, ttsCache.ts), a stall line key (`bolo-chacha-v1::`)
 *    or a call line key (`bolo-chacha-call-v3::`), so no row of any other kind
 *    can ever be served as his, or his as theirs;
 *  - provider, model and voice come from uncleSynthesisIdentity, so moving the
 *    elder to a new voice orphans his old takes rather than serving them;
 *  - the instructions digest does the same for a change of direction;
 *  - the language, because the forks give each language its own elder voice,
 *    and one text can be two languages' words (Hindi and Marathi share script);
 *  - a SHA-256 of the text last, so any phrase fits and the key stays bounded.
 *
 * The playback route is the only writer. Nothing prewarms these (ttsPrewarm.ts
 * is untouched): the elder only speaks keeper lines, a first play synthesizes.
 */
export function elderPhraseCacheKey(text: string, languageCode: string): string {
  const lang = languageCode.trim().toLowerCase() || "und";
  const id = uncleSynthesisIdentity(lang);
  const textDigest = createHash("sha256").update(text).digest("hex");
  return `bolo-elder-phrase-${ELDER_PHRASE_CACHE_KEY_VERSION}::${id.provider}::${id.model}::${id.voice}::${CHACHA_TTS_INSTRUCTIONS_DIGEST}::${lang}::${textDigest}`;
}
