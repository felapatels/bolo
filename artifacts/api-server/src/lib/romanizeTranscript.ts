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
//    no romanized line): Perso-Arabic (ks, sd, ur — unvocalized consonant
//    skeletons come out as garbage), Ol Chiki (sat) and Meetei Mayek (mni)
//    (both verified to leave unmapped native glyphs in the output).
//  - Empty/whitespace transcripts return "".
//
// This value is display-only. It is never stored on attempts, never in the
// evaluation token, and never used in scoring.

import Sanscript from "@indic-transliteration/sanscript";

// Unicode-block → sanscript scheme. Detection is based on the transcript's
// actual characters (not the language code) so a transcript in an unexpected
// script can never be transliterated with the wrong table — it just falls
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
  // Uncovered scripts — verified to produce garbage, so they yield "".
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

// When no (known) language code accompanies the transcript — e.g. eval
// requests with client-provided targets and no phraseId — fall back to the
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

/**
 * SCHWA DELETION RUNS ON IAST, NOT ON THE STRIPPED ASCII, and that is the whole
 * of the 2026-08-28 fix.
 *
 * Owner, on his own words mirrored back from a Gujarati call: `gharamam` for
 * ઘરમાં, which should read `gharmam`. Two faults, one cause.
 *
 * 1. INTERNAL SCHWAS SURVIVED. Only the word-FINAL inherent 'a' was deleted, so
 *    ઘ-ર-માં came out gha-ra-mam with the middle schwa Gujarati does not say.
 * 2. THE FINAL RULE COULD EAT A REAL VOWEL. It ran after toAscii had flattened
 *    ā to a, so it could not tell an inherent schwa from a long ā: राजा would
 *    have become `raj`.
 *
 * Both vanish by deciding before the macrons are stripped. `a` is the inherent
 * schwa; `ā` is a vowel the speaker actually says.
 */

/** IAST vowels. ṛ and ḷ are deliberately absent: they are rare, ambiguous with
 * Gujarati's ળ, and leaving them out only means no deletion happens near them. */
const IAST_VOWELS = new Set(["a", "ā", "i", "ī", "u", "ū", "e", "o"]);

interface Syllable {
  /** Consonant units before the vowel, e.g. ["gh"], ["p", "r"], []. */
  onset: string[];
  /** The vowel, or "" for a trailing consonant run with no vowel after it. */
  vowel: string;
  /** Anything after the vowel that is not a consonant unit, e.g. ṁ, ḥ. */
  tail: string;
}

/** True for a letter that behaves as a consonant here: anything not a vowel. */
function isVowelChar(ch: string): boolean {
  return IAST_VOWELS.has(ch);
}

/**
 * Splits one IAST word into onset-vowel syllables.
 *
 * Aspirates are ONE unit: "gh" is a single consonant, not g plus h. That
 * matters because the cluster guard below counts units, and counting "bh" as
 * two would block deletions that are correct.
 */
function syllabify(word: string): Syllable[] {
  const out: Syllable[] = [];
  let i = 0;
  let onset: string[] = [];
  while (i < word.length) {
    const ch = word[i];
    if (isVowelChar(ch)) {
      // "ai" and "au" are single vowels, not two syllables.
      let vowel = ch;
      const next = word[i + 1];
      if (ch === "a" && (next === "i" || next === "u")) {
        vowel = ch + next;
        i += 1;
      }
      let tail = "";
      // Anusvara, visarga, candrabindu: they close the syllable, they do not
      // open the next one.
      // EXPLICIT CODEPOINTS, NOT LITERALS. Writing candrabindu as `m̐` in a
      // character class puts a bare `m` in it, because the glyph is m plus a
      // combining mark: every m after a vowel was then swallowed as a tail,
      // which turned `kema cho` back into `kema cho` and `namaste` into
      // `namste`. U+1E41 ṁ, U+1E43 ṃ, U+1E25 ḥ, plus the combining block.
      while (i + 1 < word.length && /[\u0300-\u036f\u1e41\u1e43\u1e25~]/.test(word[i + 1])) {
        tail += word[i + 1];
        i += 1;
      }
      out.push({ onset, vowel, tail });
      onset = [];
      i += 1;
      continue;
    }
    // A consonant unit: the letter plus an aspirating h.
    let unit = ch;
    if (word[i + 1] === "h" && ch !== "h") {
      unit += "h";
      i += 1;
    }
    onset.push(unit);
    i += 1;
  }
  if (onset.length) out.push({ onset, vowel: "", tail: "" });
  return out;
}

function render(syllables: Syllable[]): string {
  return syllables.map((s) => s.onset.join("") + s.vowel + s.tail).join("");
}

/**
 * Deletes the schwas a Hindi or Gujarati speaker does not say.
 *
 * RIGHT TO LEFT, AND DELIBERATELY TIMID. Real schwa deletion is a hard problem
 * and a wrong romanization is worse than a clumsy one, so every rule here
 * refuses rather than guesses:
 *
 *  - only a BARE `a`, never `ā` or any other vowel;
 *  - never the first syllable: ghrmā is not a word;
 *  - never when the syllable to the right has no vowel of its own;
 *  - never two in a row;
 *  - never when the consonants either side would merge into more than two
 *    units. That one guard is what keeps नमस्ते as `namaste` rather than
 *    `namste`, because m + st is three.
 *
 * The word-final schwa goes first and by the same rules, so `ābhāra` becomes
 * `ābhār` while `rājā` keeps its ending.
 */
function deleteSchwas(text: string): string {
  return text
    .split(/(\s+)/)
    .map((word) => {
      if (!word.trim()) return word;
      const syl = syllabify(word.normalize("NFC"));
      if (syl.length < 2) return word;

      // The final inherent 'a', when the word truly ends on it.
      const last = syl[syl.length - 1];
      if (last.vowel === "a" && !last.tail && last.onset.length > 0) {
        last.vowel = "";
      }

      const deleted = new Set<number>();
      for (let i = syl.length - 2; i >= 1; i--) {
        const here = syl[i];
        const right = syl[i + 1];
        if (here.vowel !== "a" || here.tail) continue;
        if (!right.vowel) continue;
        if (deleted.has(i + 1)) continue;
        if (here.onset.length + right.onset.length > 2) continue;
        here.vowel = "";
        deleted.add(i);
      }
      return render(syl);
    })
    .join("");
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
  if (scheme === "latin") return text; // already Latin — pass through as-is
  if (scheme === "uncovered" || scheme === "unknown") return "";

  let iast: string;
  try {
    iast = Sanscript.t(text, scheme, "iast");
  } catch {
    return "";
  }

  const schwaDeleting = languageCode && SCHWA_DELETING_LANGS.has(languageCode)
    ? true
    : !languageCode && SCHWA_DELETING_SCHEMES.has(scheme);
  // BEFORE toAscii, which is the fix: once ā is flattened to a there is no
  // way left to tell a schwa from a vowel the speaker says.
  const shaped = schwaDeleting ? deleteSchwas(iast.toLowerCase()) : iast;

  const { ascii, dropped } = toAscii(shaped);
  const letters = ascii.replace(/[^a-zA-Z]/g, "").length;
  // Garbage guard: if transliteration left a meaningful share of unmapped
  // native glyphs behind (they were dropped in toAscii), show nothing rather
  // than a mangled fragment.
  if (letters === 0 || dropped > Math.ceil(letters * 0.15)) return "";

  return ascii.toLowerCase().replace(/\s+/g, " ").trim();
}
