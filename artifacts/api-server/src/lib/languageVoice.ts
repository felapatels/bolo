/**
 * Per-language ElevenLabs voice selection for TTS synthesis.
 *
 * Every voice ID here is a free-tier ElevenLabs "premade" voice, meaning it
 * is available on every plan (unlike library/cloned voices that require a paid
 * subscription). All voices are used with eleven_multilingual_v2, which handles
 * the actual phoneme rendering for each script — the voice choice governs
 * timbre, prosody, and resonance rather than the language itself.
 *
 * Voice selection rationale per language family:
 *
 * North Indian / Indic (Hindi, Punjabi, Marathi, Nepali, Sanskrit):
 *   "Brian" (nPczCjzI2devNBz1zQrb) — deep, warm American male. The fuller
 *   chest resonance complements the retroflex consonants common in North Indian
 *   languages and sounds less clipped than the British-tinged George voice.
 *
 * South Indian / Dravidian (Tamil, Telugu, Kannada, Malayalam):
 *   "Eric" (cjVigY5qzO86Huf0OWal) — friendly, clear American male with a
 *   slightly brighter timbre that suits the clear syllable structure of
 *   Dravidian scripts and their minimal aspiration contrasts.
 *
 * Bengali / Odia / Assamese (East Indian):
 *   "Charlie" (IKne3meq5aSn9XLyUdCD) — upbeat, natural male. Bengali has a
 *   distinctly musical prosody; a warmer, more energetic base voice carries
 *   that character better than George's neutral British delivery.
 *
 * Gujarati / Rajasthani (West Indian):
 *   "Bill" (pqHfZKP75CvOlQylNhV4) — strong, narrative male. Gujarati has
 *   prominent vowel-length contrasts; a voice with more presence makes those
 *   distinctions more perceptible to learners.
 *
 * Urdu / Kashmiri (Perso-Arabic script):
 *   "Daniel" (onwK4e9ZLuTAKqWW03F9) — authoritative British male. The more
 *   measured pace suits Urdu's Nastaliq script and the slightly formal register
 *   many Urdu phrases carry.
 *
 * Default (unmapped languages):
 *   "George" (JBFqnCBsd6RMkjVDRZzb) — existing multilingual default; kept as
 *   fallback so any unmapped code continues to work exactly as before.
 */

/** Fallback voice ID for any language code not found in the map below. */
export const DEFAULT_MULTILINGUAL_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George

/**
 * Maps ISO-639-1 language codes to ElevenLabs premade voice IDs that sound
 * more authentic for each language family when synthesized by eleven_multilingual_v2.
 */
export const LANGUAGE_VOICE_MAP: Record<string, string> = {
  // ── North Indian / Indic ────────────────────────────────────────────────
  hi: "nPczCjzI2devNBz1zQrb", // Hindi      → Brian (warm, resonant male)
  pa: "nPczCjzI2devNBz1zQrb", // Punjabi    → Brian
  mr: "nPczCjzI2devNBz1zQrb", // Marathi    → Brian
  ne: "nPczCjzI2devNBz1zQrb", // Nepali     → Brian
  sa: "nPczCjzI2devNBz1zQrb", // Sanskrit   → Brian

  // ── South Indian / Dravidian ────────────────────────────────────────────
  ta: "cjVigY5qzO86Huf0OWal", // Tamil      → Eric (bright, clear male)
  te: "cjVigY5qzO86Huf0OWal", // Telugu     → Eric
  kn: "cjVigY5qzO86Huf0OWal", // Kannada    → Eric
  ml: "cjVigY5qzO86Huf0OWal", // Malayalam  → Eric

  // ── East Indian ─────────────────────────────────────────────────────────
  bn: "IKne3meq5aSn9XLyUdCD", // Bengali    → Charlie (upbeat, musical)
  or: "IKne3meq5aSn9XLyUdCD", // Odia       → Charlie
  as: "IKne3meq5aSn9XLyUdCD", // Assamese   → Charlie

  // ── West Indian ─────────────────────────────────────────────────────────
  gu: "pqHfZKP75CvOlQylNhV4", // Gujarati   → Bill (strong presence, vowel contrast)
  raj: "pqHfZKP75CvOlQylNhV4",// Rajasthani → Bill (non-standard code, best-effort)

  // ── Perso-Arabic script ─────────────────────────────────────────────────
  ur: "onwK4e9ZLuTAKqWW03F9", // Urdu       → Daniel (measured British, formal)
  ks: "onwK4e9ZLuTAKqWW03F9", // Kashmiri   → Daniel

  // ── North-East / Other ──────────────────────────────────────────────────
  mni: "IKne3meq5aSn9XLyUdCD",// Manipuri   → Charlie
  sat: "IKne3meq5aSn9XLyUdCD",// Santali    → Charlie
  doi: "nPczCjzI2devNBz1zQrb",// Dogri      → Brian
  mai: "nPczCjzI2devNBz1zQrb",// Maithili   → Brian
  sd:  "onwK4e9ZLuTAKqWW03F9",// Sindhi     → Daniel
  kok: "nPczCjzI2devNBz1zQrb",// Konkani    → Brian
  bho: "nPczCjzI2devNBz1zQrb",// Bhojpuri   → Brian
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
