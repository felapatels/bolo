// Which writing system each language uses, and whether tracing is playable in
// it yet.
//
// THE UNIT IS THE SCRIPT, NOT THE LANGUAGE, and that is the whole reason
// authored stroke data is affordable. Devanagari alone serves eight of the
// twenty-two languages, so one authored set of ~45 glyphs unlocks Hindi,
// Marathi, Nepali, Maithili, Dogri, Konkani, Sanskrit and Bodo at once.
// Authoring twelve scripts is a project; authoring one is an afternoon.
//
// The shipped Script Trace derived its guides from fonts precisely because
// twelve scripts looked impossible. This table is the arithmetic that makes
// the honest version tractable instead.

import type { AuthoredGlyph } from "@/lib/stroke-scoring";
import { DEVANAGARI_PROTOTYPE_GLYPHS } from "@/data/devanagari-strokes";

export type ScriptId =
  | "devanagari"
  | "bengali"
  | "gujarati"
  | "gurmukhi"
  | "tamil"
  | "telugu"
  | "kannada"
  | "malayalam"
  | "odia"
  | "perso-arabic"
  | "ol-chiki"
  | "meitei";

/** Language code to writing system. Keyed by the DB language codes. */
export const SCRIPT_BY_LANGUAGE: Record<string, ScriptId> = {
  // Devanagari, the big one: eight languages on a single authored set.
  hi: "devanagari",
  mr: "devanagari",
  ne: "devanagari",
  mai: "devanagari",
  doi: "devanagari",
  kok: "devanagari",
  sa: "devanagari",
  brx: "devanagari",
  // Eastern Nagari, shared by two. Assamese is the same script as Bengali with
  // two extra letters, which is why the languages table calls it
  // "Bengali-Assamese" and why one authored set serves both.
  bn: "bengali",
  as: "bengali",
  // One language each.
  gu: "gujarati",
  pa: "gurmukhi",
  ta: "tamil",
  te: "telugu",
  kn: "kannada",
  ml: "malayalam",
  or: "odia",
  // Perso-Arabic, shared by three. Urdu and Kashmiri render in Nastaliq and
  // Sindhi in Naskh, which are two styles of one script rather than two
  // scripts: the letters are the same, the slope is not. One authored set is
  // the right starting assumption, and the first Sindhi learner to try it is
  // the right check on that.
  ur: "perso-arabic",
  ks: "perso-arabic",
  sd: "perso-arabic",
  // Santali's own script.
  sat: "ol-chiki",
  // Manipuri is Meetei Mayek, NOT Bengali. It was written in Bengali script
  // historically, which is an easy thing to assume and wrong here: the
  // languages table declares Meetei Mayek and ships Noto Sans Meetei Mayek,
  // so tracing has to teach the letterforms a learner will actually meet.
  mni: "meitei",
};

/** Human name, for copy that has to say which script is being traced. */
export const SCRIPT_NAMES: Record<ScriptId, string> = {
  devanagari: "Devanagari",
  bengali: "Bengali",
  gujarati: "Gujarati",
  gurmukhi: "Gurmukhi",
  tamil: "Tamil",
  telugu: "Telugu",
  kannada: "Kannada",
  malayalam: "Malayalam",
  odia: "Odia",
  "perso-arabic": "Nastaliq",
  "ol-chiki": "Ol Chiki",
  meitei: "Meetei Mayek", // spelled as the languages table spells it
};

/**
 * Authored stroke data, by script.
 *
 * Only what has actually been authored appears here. A script with no entry is
 * not broken, it is simply not written yet, and traceReadyFor() keeps it out of
 * the roster until it is.
 */
export const AUTHORED_GLYPHS: Partial<Record<ScriptId, AuthoredGlyph[]>> = {
  // PROTOTYPE data: three approximate glyphs that exercise the format. Well
  // under the playable floor on purpose, so tracing stays hidden until a real
  // set lands.
  devanagari: DEVANAGARI_PROTOTYPE_GLYPHS,
};

/**
 * How many authored glyphs a script needs before tracing is offered in it.
 *
 * Twelve is a session, not an alphabet. Below that a learner exhausts the game
 * in one sitting and it reads as broken rather than short, which is the same
 * failure the empty-journey gate exists to prevent.
 */
export const PLAYABLE_GLYPH_FLOOR = 12;

export function scriptFor(languageCode: string): ScriptId | undefined {
  return SCRIPT_BY_LANGUAGE[languageCode];
}

export function glyphsForLanguage(languageCode: string): AuthoredGlyph[] {
  const script = scriptFor(languageCode);
  return script ? (AUTHORED_GLYPHS[script] ?? []) : [];
}

/**
 * Whether Script Trace can be offered in this language at all.
 *
 * The same shape as journeyIsReady(): structure ships first, content gates it.
 * A tracing game with three letters in it is worse than no tracing game.
 */
export function traceReadyFor(languageCode: string): boolean {
  return glyphsForLanguage(languageCode).length >= PLAYABLE_GLYPH_FLOOR;
}

/** Scripts that are playable today, for a roster or a status readout. */
export function playableScripts(): ScriptId[] {
  return (Object.keys(AUTHORED_GLYPHS) as ScriptId[]).filter(
    (s) => (AUTHORED_GLYPHS[s] ?? []).length >= PLAYABLE_GLYPH_FLOOR,
  );
}

/**
 * Languages that would be unlocked by authoring one more script, best first.
 *
 * The planning question this file exists to answer: what is the next set worth
 * paying for. Returns [script, languages unlocked], ignoring anything already
 * playable.
 */
export function unlockOrder(): { script: ScriptId; languages: string[] }[] {
  const playable = new Set(playableScripts());
  const byScript = new Map<ScriptId, string[]>();
  for (const [lang, script] of Object.entries(SCRIPT_BY_LANGUAGE)) {
    if (playable.has(script)) continue;
    byScript.set(script, [...(byScript.get(script) ?? []), lang]);
  }
  return [...byScript.entries()]
    .map(([script, languages]) => ({ script, languages: languages.sort() }))
    .sort((a, b) => b.languages.length - a.languages.length || a.script.localeCompare(b.script));
}
