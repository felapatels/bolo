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

import type { AuthoredGlyph } from "./stroke-scoring";
import { DEVANAGARI_PROTOTYPE_GLYPHS } from "./devanagari-strokes";
import { PROVISIONAL_GLYPHS } from "./provisional-strokes";
import { CONTRIBUTED_GLYPHS } from "./contributed-strokes";

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
/**
 * Which way each script is written.
 *
 * The demo has to know, because everything about a pen path that is not the
 * SHAPE is direction: which end of a stroke you start at, and which stroke you
 * draw first. A skeleton extracted from a font outline carries neither, so both
 * are inferred, and the inference was a hardcoded top-LEFT bias for all twelve
 * scripts. For Nastaliq that is backwards: Urdu, Kashmiri and Sindhi are
 * written right to left, so their demo was starting every stroke at the wrong
 * end and drawing the strokes in the wrong order.
 *
 * Common sense, applied 2026-08-23: start where the script starts. It is still
 * an inference and still not a substitute for a real hand, which is why
 * anything with contributed strokes ignores all of this and plays those.
 */
export const SCRIPT_DIRECTION: Record<ScriptId, "ltr" | "rtl"> = {
  devanagari: "ltr",
  bengali: "ltr",
  gujarati: "ltr",
  gurmukhi: "ltr",
  tamil: "ltr",
  telugu: "ltr",
  kannada: "ltr",
  malayalam: "ltr",
  odia: "ltr",
  "perso-arabic": "rtl",
  "ol-chiki": "ltr",
  meitei: "ltr",
};

/** Whether this language's script is written right to left. */
export function writesRightToLeft(languageCode: string): boolean {
  const script = SCRIPT_BY_LANGUAGE[languageCode];
  return script ? SCRIPT_DIRECTION[script] === "rtl" : false;
}

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

  // Font-derived best guesses, so tracing is offered in all 22 languages while
  // contributions come in rather than gating 21 of them off. Every glyph here
  // carries `provisional: true`.
  ...PROVISIONAL_GLYPHS,

  // Real contributed strokes, generated from the contribution page. Spread
  // LAST so a script that people have actually traced REPLACES both the
  // prototype and the guess for that script rather than being merged into
  // either. THE ORDER OF THESE THREE IS THE WHOLE POLICY: a hand beats a font,
  // and a font beats nothing.
  ...CONTRIBUTED_GLYPHS,
};

/**
 * How many authored glyphs a script needs before tracing is offered in it.
 *
 * Twelve is a session, not an alphabet. Below that a learner exhausts the game
 * in one sitting and it reads as broken rather than short, which is the same
 * failure the empty-journey gate exists to prevent.
 */
export const PLAYABLE_GLYPH_FLOOR = 12;

/**
 * The writing-order rule an author most needs in front of them, per script.
 *
 * The tool used to hardcode Devanagari's head-line, which is not just unhelpful
 * for the other eleven but WRONG for Gujarati, whose defining difference from
 * Devanagari is that it has no head-line at all. An author switching alphabets
 * would have been told to draw a line that does not exist.
 *
 * Kept to the ORDER, since order and direction are the only things this format
 * records that a font cannot.
 */
export const SCRIPT_ORDER_TIP: Record<ScriptId, string> = {
  devanagari: "The head-line (shirorekha) goes on LAST, after the letter body.",
  bengali: "The head-line (matra) goes on LAST, after the letter body.",
  gurmukhi: "The head-line (sirlekh) goes on LAST, after the letter body.",
  gujarati:
    "There is NO head-line. That is the difference from Devanagari, so do not draw one.",
  odia: "The curved umbrella top is part of the letter. Body first, curve to close.",
  "perso-arabic":
    "RIGHT TO LEFT. Draw the connected skeleton first, then the dots and marks.",
  tamil: "Left to right, top to bottom. Curves in one continuous stroke where you can.",
  telugu: "Left to right, top to bottom. The tick above the letter comes last.",
  kannada: "Left to right, top to bottom. The tick above the letter comes last.",
  malayalam: "Left to right, top to bottom. Keep round shapes as one stroke.",
  "ol-chiki": "Left to right, top to bottom.",
  meitei: "Left to right, top to bottom.",
};

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
 * Scripts running on a real hand rather than on a font guess.
 *
 * Counts only non-provisional glyphs against the floor, so a script that is
 * half traced and half guessed is honestly reported as not done.
 */
export function scriptsOnRealData(): ScriptId[] {
  return (Object.keys(AUTHORED_GLYPHS) as ScriptId[]).filter(
    (s) =>
      (AUTHORED_GLYPHS[s] ?? []).filter((g) => !g.provisional).length >=
      PLAYABLE_GLYPH_FLOOR,
  );
}

/**
 * Languages that would be unlocked by authoring one more script, best first.
 *
 * The planning question this file exists to answer: what is the next set worth
 * paying for. Returns [script, languages unlocked], ignoring anything that
 * already runs on a real hand.
 *
 * CHANGED 2026-08-23, and the question it answers is unchanged. It used to skip
 * anything already PLAYABLE, which stopped meaning anything the day
 * font-derived guesses made every script playable at once: it would have
 * returned an empty list and reported the work finished. Playability is no
 * longer the scarce thing. A speaker's hand is, so that is what it filters on.
 */
export function unlockOrder(): { script: ScriptId; languages: string[] }[] {
  const done = new Set(scriptsOnRealData());
  const byScript = new Map<ScriptId, string[]>();
  for (const [lang, script] of Object.entries(SCRIPT_BY_LANGUAGE)) {
    if (done.has(script)) continue;
    byScript.set(script, [...(byScript.get(script) ?? []), lang]);
  }
  return [...byScript.entries()]
    .map(([script, languages]) => ({ script, languages: languages.sort() }))
    .sort((a, b) => b.languages.length - a.languages.length || a.script.localeCompare(b.script));
}
