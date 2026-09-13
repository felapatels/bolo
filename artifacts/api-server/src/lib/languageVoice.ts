/**
 * Per-language ElevenLabs voice selection for TTS synthesis.
 *
 * Every voice ID here is a free-tier ElevenLabs "premade" voice, meaning it
 * is available on every plan (unlike library/cloned voices that require a paid
 * subscription). All voices are used with eleven_multilingual_v2, which handles
 * the actual phoneme rendering for each script — the voice choice governs
 * timbre, prosody, and resonance rather than the language itself.
 *
 * Voice selection rationale:
 *
 * All languages (Auto default):
 *   "Laura" (FGY2WhTYpPnrIDTdsKH5) — bright, upbeat female voice; cheerful
 *   and encouraging. Used as the universal Auto default across all supported
 *   language families. eleven_multilingual_v2 handles phoneme rendering for
 *   each script, so Laura's timbre and prosody carry well across all languages.
 *
 * Default (unmapped languages):
 *   "Laura" (FGY2WhTYpPnrIDTdsKH5) — same bubbly female default applies to
 *   any language code not explicitly listed in the map below.
 */

/**
 * Curated catalog of ElevenLabs premade voices learners can choose from.
 * All IDs are free-tier premade voices available on every ElevenLabs plan.
 */
export interface VoiceCatalogEntry {
  id: string;
  name: string;
  gender: "male" | "female";
  description: string;
}

export const VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    gender: "male",
    description: "Warm British male with a calm, trustworthy tone.",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    gender: "male",
    description: "Deep, resonant American male — great for North Indian languages.",
  },
  {
    id: "cjVigY5qzO86Huf0OWal",
    name: "Eric",
    gender: "male",
    description: "Friendly, clear American male with a bright, energetic style.",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    gender: "male",
    description: "Upbeat, natural male voice with lively prosody.",
  },
  {
    id: "pqHfZKP75CvOlQylNhV4",
    name: "Bill",
    gender: "male",
    description: "Strong, narrative male with commanding presence.",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    gender: "male",
    description: "Authoritative British male with a measured, formal delivery.",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    gender: "female",
    description: "Confident British female with a clear, professional tone.",
  },
  {
    id: "XB0fDUnXU5powFXDhCwa",
    name: "Charlotte",
    gender: "female",
    description: "Warm, expressive female voice with a Swedish lilt.",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura",
    gender: "female",
    description: "Bright, upbeat female voice — cheerful and encouraging.",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    gender: "female",
    description: "Gentle, articulate American female with natural warmth.",
  },
];

/** Fast lookup set for validating user-supplied voice IDs. */
export const VALID_VOICE_IDS = new Set(VOICE_CATALOG.map((v) => v.id));

/**
 * THE ONE VOICE EVERY LANGUAGE SPEAKS IN. Owner pick, 2026-09-13, chosen by ear
 * from the audition of every elder and coach in the fleet: Monika Sogam, a
 * NATIVE HINDI female voice.
 *
 * THIS REPLACES LAURA, WHO WAS AN ENGLISH VOICE. Laura is `language: en`, and
 * she was about to read Hindi, Tamil, Bengali and eighteen more to real
 * learners the moment the provider was switched on.
 *
 * TASK #643 IS OVERRULED, by the owner, 2026-09-13. That task deliberately made
 * one voice the Auto default for every language family, reasoning that
 * eleven_multilingual_v2 does the phoneme rendering and a consistent timbre was
 * the right product behaviour. Two tests pinned it and they are inverted rather
 * than deleted, per the working rules. The map is per language now, the same
 * shape the five forks got the same day.
 *
 * WHAT THE LIBRARY ACTUALLY HAS, searched 2026-09-13 for a native female at
 * every age in each of the eleven languages the model speaks: **Hindi has many,
 * Tamil has nineteen, and Gujarati, Bengali, Urdu, Marathi, Punjabi, Telugu,
 * Kannada, Malayalam and Nepali have NONE AT ALL.** So per-language is really
 * two voices, and the split that buys the most is by family.
 */
export const DEFAULT_MULTILINGUAL_VOICE_ID = "sTuFDs5r9KT8f6JSiJbq"; // Monika Sogam, native Hindi

/**
 * A NATIVE TAMIL VOICE for the Dravidian languages. Vani, chosen for being
 * pleasant and conversational, which is the register a coach reads in; the
 * alternatives were a narrator and an educational read.
 *
 * TELUGU, KANNADA AND MALAYALAM FOLLOW HER because they are Dravidian and she
 * is the only Dravidian voice that exists here. That is the same regional reuse
 * the coach maps in Europe, SEA and Africa already do, and it beats an
 * Indo-Aryan voice reading a Dravidian language.
 */
export const DRAVIDIAN_VOICE_ID = "hhPtGvkQC1ce5z3pPhYh"; // Vani, native Tamil

/**
 * Maps ISO-639-1 language codes to the ElevenLabs voice used for that language.
 *
 * Only the eleven in ttsConfig's ELEVENLABS_LANGUAGES actually reach this map;
 * the other twelve resolve to gpt-4o-mini-tts before a voice is ever chosen.
 * The unreachable rows are kept so the map still answers for every language the
 * app teaches, and so widening ELEVENLABS_LANGUAGES needs no second edit here.
 */
export const LANGUAGE_VOICE_MAP: Record<string, string> = {
  // ── North Indian / Indic ────────────────────────────────────────────────
  hi: DEFAULT_MULTILINGUAL_VOICE_ID, // Hindi, and Monika's own language
  pa: DEFAULT_MULTILINGUAL_VOICE_ID, // Punjabi
  mr: DEFAULT_MULTILINGUAL_VOICE_ID, // Marathi
  ne: DEFAULT_MULTILINGUAL_VOICE_ID, // Nepali
  sa: DEFAULT_MULTILINGUAL_VOICE_ID, // Sanskrit

  // ── South Indian / Dravidian ────────────────────────────────────────────
  ta: DRAVIDIAN_VOICE_ID, // Tamil, and Vani's own language
  te: DRAVIDIAN_VOICE_ID, // Telugu
  kn: DRAVIDIAN_VOICE_ID, // Kannada
  ml: DRAVIDIAN_VOICE_ID, // Malayalam

  // ── East Indian ─────────────────────────────────────────────────────────
  bn: DEFAULT_MULTILINGUAL_VOICE_ID, // Bengali
  or: DEFAULT_MULTILINGUAL_VOICE_ID, // Odia
  as: DEFAULT_MULTILINGUAL_VOICE_ID, // Assamese

  // ── West Indian ─────────────────────────────────────────────────────────
  gu: DEFAULT_MULTILINGUAL_VOICE_ID, // Gujarati
  raj: DEFAULT_MULTILINGUAL_VOICE_ID,// Rajasthani (non-standard code, best-effort)

  // ── Perso-Arabic script ─────────────────────────────────────────────────
  ur: DEFAULT_MULTILINGUAL_VOICE_ID, // Urdu
  ks: DEFAULT_MULTILINGUAL_VOICE_ID, // Kashmiri

  // ── North-East / Other ──────────────────────────────────────────────────
  mni: DEFAULT_MULTILINGUAL_VOICE_ID,// Manipuri
  sat: DEFAULT_MULTILINGUAL_VOICE_ID,// Santali
  doi: DEFAULT_MULTILINGUAL_VOICE_ID,// Dogri
  mai: DEFAULT_MULTILINGUAL_VOICE_ID,// Maithili
  sd:  DEFAULT_MULTILINGUAL_VOICE_ID,// Sindhi
  kok: DEFAULT_MULTILINGUAL_VOICE_ID,// Konkani
  bho: DEFAULT_MULTILINGUAL_VOICE_ID,// Bhojpuri
};

/**
 * Return the ElevenLabs voice ID most appropriate for the given ISO-639-1
 * language code. Falls back to `DEFAULT_MULTILINGUAL_VOICE_ID` for codes that
 * are not in the map.
 */
export function getVoiceIdForLanguage(languageCode?: string): string {
  if (!languageCode) return DEFAULT_MULTILINGUAL_VOICE_ID;
  const code = languageCode.trim().toLowerCase();
  return LANGUAGE_VOICE_MAP[code] ?? DEFAULT_MULTILINGUAL_VOICE_ID;
}

/**
 * Maps ISO-639-1 (and a few ISO-639-3) language codes to ElevenLabs
 * `language_id` strings accepted by `eleven_multilingual_v2`.
 *
 * Only codes that ElevenLabs natively supports are mapped to themselves.
 * Languages not in the model's phoneme inventory are mapped to the closest
 * supported language (same script family / most similar phonology), so the
 * model still applies a meaningful phoneme set rather than falling back to
 * pure auto-detection from Unicode script.
 *
 * `undefined` entries are deliberately absent — callers receive `undefined`
 * from `getLanguageIdForCode` for truly unsupported codes and should omit
 * `language_id` from the request body rather than sending a wrong value.
 */
export const LANGUAGE_ID_MAP: Record<string, string> = {
  // ── Natively supported by eleven_multilingual_v2 ────────────────────────
  hi:  "hi",  // Hindi
  gu:  "gu",  // Gujarati
  ta:  "ta",  // Tamil
  bn:  "bn",  // Bengali
  ur:  "ur",  // Urdu
  mr:  "mr",  // Marathi
  pa:  "pa",  // Punjabi
  te:  "te",  // Telugu
  kn:  "kn",  // Kannada
  ml:  "ml",  // Malayalam
  ne:  "ne",  // Nepali

  // ── Closest-supported fallbacks ─────────────────────────────────────────
  // Sanskrit shares Devanagari script and consonant inventory with Hindi.
  sa:  "hi",
  // Odia and Assamese are East Indic languages phonologically close to Bengali.
  or:  "bn",
  as:  "bn",
  // Rajasthani is closely related to Hindi (both Devanagari, similar phonology).
  raj: "hi",
  // Kashmiri and Sindhi use Perso-Arabic script and are closest to Urdu.
  ks:  "ur",
  sd:  "ur",
  // Konkani is phonologically closest to Marathi.
  kok: "mr",
  // Dogri, Maithili, and Bhojpuri are all Indo-Aryan languages spoken in the
  // Hindi belt and share Devanagari script + Hindi phoneme set.
  doi: "hi",
  mai: "hi",
  bho: "hi",
  // Manipuri (Meitei) — no direct Tibeto-Burman support; Bengali is the
  // closest supported language in ElevenLabs' multilingual model.
  mni: "bn",
  // Santali (Austroasiatic / Ol Chiki script) has no close match among
  // ElevenLabs' supported languages — intentionally omitted so callers
  // receive undefined and skip language_id rather than sending a wrong value.
};

/**
 * Return the ElevenLabs `language_id` string for the given ISO language code,
 * or `undefined` when no appropriate mapping exists. When `undefined` is
 * returned the caller should omit `language_id` from the API request body so
 * ElevenLabs falls back to its own script-based auto-detection.
 */
export function getLanguageIdForCode(languageCode?: string): string | undefined {
  if (!languageCode) return undefined;
  const code = languageCode.trim().toLowerCase();
  return LANGUAGE_ID_MAP[code];
}
