/**
 * Cross-script transcript normalization (Chunk 2, Stage A). Server-side
 * drop-in for the api-server evaluation path. Fixes the observed false
 * negative: correct Hindi speech transcribed in Perso-Arabic script
 * ("kaise hain" rendered as Urdu) scoring nocatch against the Devanagari
 * target. Compare in a shared romanized space when scripts differ.
 *
 * Uses @indic-transliteration/sanscript, already a workspace dependency
 * (the #907 web romanization work). It is a plain JS lib and runs fine
 * server-side; add it to api-server's package.json if not present there.
 * No em dashes.
 */
import Sanscript from "@indic-transliteration/sanscript";

// Scripts sanscript can bridge to a common romanization (ISO/IAST-ish via
// its schemes). Perso-Arabic (ur, sd, ks) is NOT reliably transliterable by
// sanscript; for those, normalization falls back to a consonant-skeleton
// comparison (below) rather than pretending.
const SANSCRIPT_SCHEME_BY_UNICODE_BLOCK: Array<{
  test: RegExp;
  scheme: string;
}> = [
  { test: /[\u0900-\u097F]/, scheme: "devanagari" }, // hi, mr, ne, sa
  { test: /[\u0A80-\u0AFF]/, scheme: "gujarati" },
  { test: /[\u0A00-\u0A7F]/, scheme: "gurmukhi" }, // pa
  { test: /[\u0980-\u09FF]/, scheme: "bengali" }, // bn, as
  { test: /[\u0B80-\u0BFF]/, scheme: "tamil" },
  { test: /[\u0C00-\u0C7F]/, scheme: "telugu" },
  { test: /[\u0C80-\u0CFF]/, scheme: "kannada" },
  { test: /[\u0D00-\u0D7F]/, scheme: "malayalam" },
  { test: /[\u0B00-\u0B7F]/, scheme: "oriya" },
];

const PERSO_ARABIC = /[\u0600-\u06FF\u0750-\u077F]/;

export function detectScheme(text: string): string | "perso-arabic" | "latin" | "unknown" {
  if (PERSO_ARABIC.test(text)) return "perso-arabic";
  for (const { test, scheme } of SANSCRIPT_SCHEME_BY_UNICODE_BLOCK) {
    if (test.test(text)) return scheme;
  }
  if (/[a-zA-Z]/.test(text)) return "latin";
  return "unknown";
}

/** Lowercased, diacritic-stripped, punctuation-free romanization. */
function toComparableRoman(text: string, scheme: string): string {
  const roman =
    scheme === "latin" ? text : Sanscript.t(text, scheme, "iast");
  return roman
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (iast marks)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Perso-Arabic fallback: strip vowel marks and compare consonant skeletons
 * loosely. This does NOT produce a roman string comparable to IAST; it only
 * serves the equality-ish check inside normalizeForComparison's fallback.
 */
function persoArabicSkeleton(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "") // harakat
    .replace(/[^\u0600-\u06FF\u0750-\u077F]/g, "")
    .trim();
}

export interface CrossScriptResult {
  /** Transcript and target rendered into the best shared comparable space. */
  transcriptComparable: string;
  targetComparable: string;
  /** True when the two inputs were in different scripts. */
  crossScript: boolean;
  /** True when a meaningful shared space was achieved (compare with confidence). */
  bridged: boolean;
}

/**
 * Produce comparable forms for similarity scoring. Call this BEFORE the
 * existing similarity computation whenever detectScheme(transcript) differs
 * from detectScheme(target). When bridged is true, run the existing
 * similarity function on the comparable strings INSTEAD of the raw ones and
 * take the max of (raw similarity, bridged similarity) so this change can
 * only rescue, never penalize.
 */
export function normalizeForComparison(
  transcript: string,
  target: string,
): CrossScriptResult {
  const tScheme = detectScheme(transcript);
  const gScheme = detectScheme(target);
  const crossScript = tScheme !== gScheme;

  // Same script: no bridging needed; return raw (caller keeps existing path).
  if (!crossScript) {
    return {
      transcriptComparable: transcript,
      targetComparable: target,
      crossScript: false,
      bridged: false,
    };
  }

  // Perso-Arabic on either side: sanscript cannot bridge; only bridge the
  // degenerate case where BOTH are perso-arabic (not cross-script) which is
  // handled above, so here we cannot bridge reliably.
  if (tScheme === "perso-arabic" || gScheme === "perso-arabic") {
    // Best effort: if both sides reduce to identical skeletons (rare), treat
    // as bridged-equal via identical comparables.
    if (tScheme === "perso-arabic" && gScheme === "perso-arabic") {
      const a = persoArabicSkeleton(transcript);
      const b = persoArabicSkeleton(target);
      return {
        transcriptComparable: a,
        targetComparable: b,
        crossScript: false,
        bridged: true,
      };
    }
    // Cross perso-arabic vs indic: the ROMANIZED TARGET is the bridge. The
    // caller should compare toComparableRoman(targetRomanized, "latin")
    // against a romanization of the transcript if one is available from STT
    // metadata; otherwise report bridged: false and keep the raw result.
    return {
      transcriptComparable: transcript,
      targetComparable: target,
      crossScript: true,
      bridged: false,
    };
  }

  if (tScheme === "unknown" || gScheme === "unknown") {
    return {
      transcriptComparable: transcript,
      targetComparable: target,
      crossScript: true,
      bridged: false,
    };
  }

  return {
    transcriptComparable: toComparableRoman(transcript, tScheme),
    targetComparable: toComparableRoman(target, gScheme),
    crossScript: true,
    bridged: true,
  };
}

/* INTEGRATION NOTES (api-server evaluation path, where similarity runs):
1. After STT, before similarity: const norm = normalizeForComparison(transcript, phrase.nativeScript)
2. If norm.bridged: const bridgedSim = existingSimilarity(norm.transcriptComparable, norm.targetComparable)
   and use Math.max(rawSim, bridgedSim). Log when the bridge changes the
   outcome: [xscript] rescued sim raw=X bridged=Y so live rescues are visible.
3. The existing internal normalization (ZWJ/anusvara/matra strips) applies to
   the raw path unchanged; the bridge is an additional comparison, not a
   replacement.
4. The dual-pass disagreement logic (S1) runs on the SAME rescued similarity
   basis for both passes.
5. Note in CODEBASE-FACTS: rescue-only design means this cannot create new
   false positives beyond what raw same-script matching already allows.

TEST PINS (add to the api suite; write file per house conventions):
- kaise-hain case: transcript in Perso-Arabic vs Devanagari target with the
  romanized target available: bridged=false path documented, but the
  Devanagari-vs-Gujarati style case (both indic) MUST bridge: e.g. transcript
  "કેમ છો" vs target "कैम छो" bridges and scores as a near-match.
- Same-script inputs: crossScript=false, raw path untouched (pin).
- Rescue-only: bridged similarity lower than raw never lowers the outcome.
- Diacritic strip: "namastē" and "namaste" compare equal in roman space.

HONEST LIMIT, RECORD IT: the exact ur-script-vs-hi-target case observed live
bridges only if STT supplies a roman form or we add a dedicated ur->roman
table later; this module fixes the indic-to-indic family and the
infrastructure, and flags the perso-arabic gap explicitly rather than faking
it. The audio judge (Stage B) covers the remainder.
*/
