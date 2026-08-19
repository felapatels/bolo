/**
 * Per-language ElevenLabs voice selection for TTS synthesis.
 *
 * Every voice ID here is a free-tier ElevenLabs "premade" voice, meaning it
 * is available on every plan (unlike library/cloned voices that require a paid
 * subscription). All voices are used with eleven_multilingual_v2, which handles
 * the actual phoneme rendering for each script, the voice choice governs
 * timbre, prosody, and resonance rather than the language itself.
 *
 * Voice selection rationale:
 *
 * All languages (Auto default):
 *   "Laura" (FGY2WhTYpPnrIDTdsKH5), bright, upbeat female voice; cheerful
 *   and encouraging. Used as the universal Auto default across all supported
 *   language families. eleven_multilingual_v2 handles phoneme rendering for
 *   each script, so Laura's timbre and prosody carry well across all languages.
 *
 * Default (unmapped languages):
 *   "Laura" (FGY2WhTYpPnrIDTdsKH5), same bubbly female default applies to
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
    description: "Deep, resonant American male, great for North Indian languages.",
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
    description: "Bright, upbeat female voice, cheerful and encouraging.",
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

/** Fallback voice ID for any language code not found in the map below. */
export const DEFAULT_MULTILINGUAL_VOICE_ID = "FGY2WhTYpPnrIDTdsKH5"; // Laura

/**
 * Maps ISO-639-1 language codes to ElevenLabs premade voice IDs that sound
 * more authentic for each language family when synthesized by eleven_multilingual_v2.
 */
export const LANGUAGE_VOICE_MAP: Record<string, string> = {
  // ── North Indian / Indic ────────────────────────────────────────────────
  hi: "FGY2WhTYpPnrIDTdsKH5", // Hindi      → Laura (bubbly, cheerful female)
  pa: "FGY2WhTYpPnrIDTdsKH5", // Punjabi    → Laura
  mr: "FGY2WhTYpPnrIDTdsKH5", // Marathi    → Laura
  ne: "FGY2WhTYpPnrIDTdsKH5", // Nepali     → Laura
  sa: "FGY2WhTYpPnrIDTdsKH5", // Sanskrit   → Laura

  // ── South Indian / Dravidian ────────────────────────────────────────────
  ta: "FGY2WhTYpPnrIDTdsKH5", // Tamil      → Laura
  te: "FGY2WhTYpPnrIDTdsKH5", // Telugu     → Laura
  kn: "FGY2WhTYpPnrIDTdsKH5", // Kannada    → Laura
  ml: "FGY2WhTYpPnrIDTdsKH5", // Malayalam  → Laura

  // ── East Indian ─────────────────────────────────────────────────────────
  bn: "FGY2WhTYpPnrIDTdsKH5", // Bengali    → Laura
  or: "FGY2WhTYpPnrIDTdsKH5", // Odia       → Laura
  as: "FGY2WhTYpPnrIDTdsKH5", // Assamese   → Laura

  // ── West Indian ─────────────────────────────────────────────────────────
  gu: "FGY2WhTYpPnrIDTdsKH5", // Gujarati   → Laura
  raj: "FGY2WhTYpPnrIDTdsKH5",// Rajasthani → Laura (non-standard code, best-effort)

  // ── Perso-Arabic script ─────────────────────────────────────────────────
  ur: "FGY2WhTYpPnrIDTdsKH5", // Urdu       → Laura
  ks: "FGY2WhTYpPnrIDTdsKH5", // Kashmiri   → Laura

  // ── North-East / Other ──────────────────────────────────────────────────
  mni: "FGY2WhTYpPnrIDTdsKH5",// Manipuri   → Laura
  sat: "FGY2WhTYpPnrIDTdsKH5",// Santali    → Laura
  doi: "FGY2WhTYpPnrIDTdsKH5",// Dogri      → Laura
  mai: "FGY2WhTYpPnrIDTdsKH5",// Maithili   → Laura
  sd:  "FGY2WhTYpPnrIDTdsKH5",// Sindhi     → Laura
  kok: "FGY2WhTYpPnrIDTdsKH5",// Konkani    → Laura
  bho: "FGY2WhTYpPnrIDTdsKH5",// Bhojpuri   → Laura
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
 * `undefined` entries are deliberately absent, callers receive `undefined`
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
  // Manipuri (Meitei), no direct Tibeto-Burman support; Bengali is the
  // closest supported language in ElevenLabs' multilingual model.
  mni: "bn",
  // Santali (Austroasiatic / Ol Chiki script) has no close match among
  // ElevenLabs' supported languages, intentionally omitted so callers
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
