// Deterministic, display-only romanization of STT transcripts for the
// pronunciation eval response ("We heard" line on clients).
//
// Design rules (Task 907, user decisions):
//  - ZERO LLM involvement: this is pure text transformation, so scoring is
//    provably untouched.
//  - Already-Latin transcripts pass through unchanged.
//  - Native scripts are transliterated via @indic-transliteration/sanscript,
//    then lightly post-processed toward the practical card-style romanization
//    ("kem cho"), NOT scholarly ISO with heavy diacritics: IAST diacritics are
//    stripped to plain ASCII and word-final inherent 'a' is dropped for
//    schwa-deleting languages.
//  - Scripts the library cannot handle cleanly return "" (clients then render
//    no romanized line): Perso-Arabic (ks, sd, ur, unvocalized consonant
//    skeletons come out as garbage), Ol Chiki (sat) and Meetei Mayek (mni)
//    (both verified to leave unmapped native glyphs in the output).
//  - Empty/whitespace transcripts return "".
//
// This value is display-only. It is never stored on attempts, never in the
// evaluation token, and never used in scoring.

import Sanscript from "@indic-transliteration/sanscript";

// Unicode-block → sanscript scheme. Detection is based on the transcript's
// actual characters (not the language code) so a transcript in an unexpected
// script can never be transliterated with the wrong table, it just falls
// back to "" via the uncovered-script rule.
const SCRIPT_RANGES: Array<{ start: number; end: number; scheme: string | null }> = [
  { start: 0x0900, end: 0x097f, scheme: "devanagari" },
  // Bengali block covers Assamese too (extra letters ৰ/ৱ share the block).
  { start: 0x0980, end: 0x09ff, scheme: "bengali" },
  { start: 0x0a00, end: 0x0a7f, scheme: "gurmukhi" },
  { start: 0x0a80, end: 0x0aff, scheme: "gujarati" },
  { start: 0x0b00, end: 0x0b7f, scheme: "oriya" },
  // Plain 'tamil' maps க→gha etc. (superscript-oriented table); the
  // tamil_extended table produces the expected "vanakkam"-style output.
  { start: 0x0b80, end: 0x0bff, scheme: "tamil_extended" },
  { start: 0x0c00, end: 0x0c7f, scheme: "telugu" },
  { start: 0x0c80, end: 0x0cff, scheme: "kannada" },
  { start: 0x0d00, end: 0x0d7f, scheme: "malayalam" },
  // Uncovered scripts, verified to produce garbage, so they yield "".
  { start: 0x0600, end: 0x06ff, scheme: null }, // Arabic (Urdu/Sindhi/Kashmiri)
  { start: 0x0750, end: 0x077f, scheme: null }, // Arabic Supplement
  { start: 0xfb50, end: 0xfdff, scheme: null }, // Arabic Presentation Forms-A
  { start: 0xfe70, end: 0xfeff, scheme: null }, // Arabic Presentation Forms-B
  { start: 0x1c50, end: 0x1c7f, scheme: null }, // Ol Chiki (Santali)
  { start: 0xabc0, end: 0xabff, scheme: null }, // Meetei Mayek (Manipuri)
  { start: 0xaae0, end: 0xaaff, scheme: null }, // Meetei Mayek Extensions
];

// Languages where the inherent word-final 'a' is not pronounced (schwa
// deletion), so dropping it moves the output toward card style: "kema cho" →
// "kem cho", "sata sri akala" → "sat sri akal". Dravidian languages (kn, ml,
// ta, te), Sanskrit, Nepali and Odia pronounce the final vowel and keep it.
const SCHWA_DELETING_LANGS = new Set([
  "hi", "gu", "mr", "pa", "bn", "as", "mai", "doi", "kok", "brx",
]);

// When no (known) language code accompanies the transcript, e.g. eval
// requests with client-provided targets and no phraseId, fall back to the
// script: these scripts are used ONLY by schwa-deleting app languages
// (Gujarati → gu, Gurmukhi → pa, Bengali → bn/as), so deletion is safe.
// Devanagari is ambiguous (hi/mr delete, sa/ne keep) and gets no fallback.
const SCHWA_DELETING_SCHEMES = new Set(["gujarati", "gurmukhi", "bengali"]);

function isAsciiLetter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

/** Detect the dominant script of the text: "latin", a sanscript scheme name,
 * "uncovered" (known script we can't romanize cleanly), or "unknown". */
function detectScheme(text: string): string | "latin" | "uncovered" | "unknown" {
  let latin = 0;
  const schemeCounts = new Map<string, number>();
  let uncovered = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (isAsciiLetter(code)) {
      latin++;
      continue;
    }
    for (const range of SCRIPT_RANGES) {
      if (code >= range.start && code <= range.end) {
        if (range.scheme === null) uncovered++;
        else schemeCounts.set(range.scheme, (schemeCounts.get(range.scheme) ?? 0) + 1);
        break;
      }
    }
  }
  let bestScheme: string | null = null;
  let bestCount = 0;
  for (const [scheme, count] of schemeCounts) {
    if (count > bestCount) {
      bestScheme = scheme;
      bestCount = count;
    }
  }
  if (bestCount > 0 && bestCount >= uncovered) return bestScheme!;
  if (uncovered > 0) return "uncovered";
  if (latin > 0) return "latin";
  return "unknown";
}

/** Strip combining diacritics and any remaining non-ASCII down to plain ASCII. */
function toAscii(text: string): { ascii: string; dropped: number } {
  // NFD splits ā → a + combining macron; drop the combining marks.
  const decomposed = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let ascii = "";
  let dropped = 0;
  for (const ch of decomposed) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) {
      ascii += ch;
    } else {
      dropped++;
    }
  }
  // IAST/sanscript artifacts that survive NFD: candrabindu "~", avagraha "'".
  ascii = ascii.replace(/[~^]/g, "");
  return { ascii, dropped };
}

/** Drop the unpronounced word-final inherent 'a' (schwa deletion). Only fires
 * on words of 3+ letters ending in consonant+'a' so real vowels survive. */
function deleteFinalSchwa(text: string): string {
  return text.replace(/\b([a-z]+[bcdfghjklmnpqrstvwxyz])a\b/gi, "$1");
}

/**
 * Romanize an STT transcript for display. Returns "" when the transcript is
 * empty or its script cannot be romanized cleanly (clients hide the line).
 */
export function romanizeTranscript(
  transcript: string,
  languageCode?: string | null,
): string {
  const text = transcript.trim();
  if (!text) return "";

  const scheme = detectScheme(text);
  if (scheme === "latin") return text; // already Latin, pass through as-is
  if (scheme === "uncovered" || scheme === "unknown") return "";

  let iast: string;
  try {
    iast = Sanscript.t(text, scheme, "iast");
  } catch {
    return "";
  }

  const { ascii, dropped } = toAscii(iast);
  const letters = ascii.replace(/[^a-zA-Z]/g, "").length;
  // Garbage guard: if transliteration left a meaningful share of unmapped
  // native glyphs behind (they were dropped in toAscii), show nothing rather
  // than a mangled fragment.
  if (letters === 0 || dropped > Math.ceil(letters * 0.15)) return "";

  let out = ascii.toLowerCase().replace(/\s+/g, " ").trim();
  const schwaDeleting = languageCode && SCHWA_DELETING_LANGS.has(languageCode)
    ? true
    : !languageCode && SCHWA_DELETING_SCHEMES.has(scheme);
  if (schwaDeleting) {
    out = deleteFinalSchwa(out);
  }
  return out;
}
