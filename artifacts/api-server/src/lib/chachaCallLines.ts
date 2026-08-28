import { Buffer } from "node:buffer";
import { db, languagesTable, ttsCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import { CHACHA_AUDIO_FORMAT } from "./chachaStrings";
import {
  CALL_CACHE_KEY_VERSION,
  CALL_CANNED_LINES,
  callLineCacheKey,
} from "./chachaCallScript";
import { romanizeTranscript } from "./romanizeTranscript";
import { synthesizeChachaLine } from "./chachaTts";
import { logger } from "./logger";

/**
 * Chacha-ji's CANNED call lines, in the learner's own language.
 *
 * THE DEFECT THIS MODULE EXISTS TO FIX, found by the owner 2026-08-28: "chachaji
 * is talking in hindi on gujurati game as well. he should talk in the language
 * selected." Everything else about the call was already language-aware. The
 * session carries the language, the live prompt names it, and the audio cache
 * key has had a language segment since v2. Only the TEXT was not: `HELLO` and
 * `BYE` are single authored Hindi strings, and the route synthesized those exact
 * Hindi words into the Gujarati learner's cache slot. Hindi words, Gujarati key,
 * Gujarati voice.
 *
 * WHY THE LINES ARE GENERATED AND NOT WRITTEN OUT. Twenty-two languages times
 * thirteen lines is 286 strings, and an agent writing them has no translation
 * tool and no speaker to check them. This repo already carries that mistake:
 * all twelve reading passages are `verified: false` and the build warns about
 * them on every run. Doing it again on the FIRST AND LAST thing a learner hears
 * on a call is worse, because those two lines have no surrounding context to
 * recover from. So each language's line is generated ONCE, at first use, and
 * cached beside the clip it speaks.
 *
 * HINDI IS AUTHORED AND IS NEVER GENERATED. The strings in chachaCallScript are
 * his Hindi, written and read by a person, and they are the source every other
 * language is derived FROM. That also means the language most learners are on
 * costs no model call at all, and the boot prewarm keeps working exactly as it
 * did.
 *
 * THE TEXT LIVES IN THE SAME ROW AS THE AUDIO, in tts_cache.spoken_text. Written
 * together, never updated, so the caption is always the words in the recording.
 * The alternative was a table, and chachaCallSessions already wrote down why
 * this feature does not reach for one: a table means a migration, and this repo
 * has lost a production table to an unread generated migration. One nullable
 * column is the smaller thing to ask of a publish.
 *
 * WHAT IT COSTS A LEARNER. The first ever call in a language pays one model call
 * (about a second) plus synthesis on its hello, and nothing on any call after
 * it, in any language, ever again. That is the same trade CALL_PREWARM_LANGUAGE
 * documents for the audio, and it is paid at the one moment the call is designed
 * to absorb: while the learner is still deciding to pick up.
 */

/**
 * The language the canned lines are authored in.
 *
 * Not a config knob. It is a statement about chachaCallScript.ts: the strings in
 * there are Hindi, so `hi` needs no translation and must never get one. Reword
 * them in another language and this constant is a lie, so move it with them.
 */
export const CALL_SOURCE_LANGUAGE = "hi";

/**
 * A ceiling on a generated line, in characters.
 *
 * His longest authored line is about sixty characters and the prompt asks for
 * one or two short sentences. Indic scripts can run longer than the Latin
 * source for the same words, so this is generous rather than tight: it is there
 * to catch a model that answers with a paragraph or an apology, not to police
 * length. Anything over it falls back to the authored line.
 */
const MAX_LINE_CHARS = 240;

export interface CallLine {
  /** What he says, in the learner's language and its own script. */
  text: string;
  /**
   * The romanization beneath it. Null when the script has no honest
   * transliteration (Perso-Arabic, Ol Chiki, Meetei Mayek) and null when it
   * would only repeat the line, which is the case for Hindi, whose authored
   * lines are already in Latin letters.
   */
  romanized: string | null;
  /** The clip. Null when synthesis failed: the caption still stands. */
  audioBase64: string | null;
  format: string | null;
}

export interface TranslateLineRequest {
  /** English name of the target language, e.g. "Gujarati". */
  languageName: string;
  /** Its own name in its own script, e.g. "ગુજરાતી". */
  nativeName: string;
  /** The script it is written in, e.g. "Gujarati". */
  script: string;
  /** His authored Hindi, for tone and length. */
  hindi: string;
  /** The authored English gloss, for meaning. */
  english: string;
}

export interface CallLineDeps {
  findCached: (
    cacheKey: string,
  ) => Promise<
    { audioBase64: string; format: string; spokenText: string | null } | undefined
  >;
  saveCached: (row: {
    cacheKey: string;
    audioBase64: string;
    format: string;
    spokenText: string;
  }) => Promise<void>;
  loadLanguage: (
    code: string,
  ) => Promise<{ name: string; nativeName: string; script: string } | undefined>;
  translate: (req: TranslateLineRequest) => Promise<string>;
  synthesize: (text: string) => Promise<Buffer>;
}

/**
 * Turns one of his Hindi lines into the learner's language.
 *
 * BOTH THE HINDI AND THE ENGLISH GO IN. The English gloss is what the line
 * MEANS and is unambiguous; the Hindi is how he SOUNDS saying it, which a gloss
 * cannot carry. Sending only one of them gets either a flat translation of an
 * English sentence or a transliteration of Hindi that a Tamil speaker would not
 * use.
 *
 * gpt-5.4-mini because that is the model this server actually talks to. A
 * session lost three rounds of prompt tuning to gpt-4o-mini on 2026-08-28 while
 * the route called something else.
 */
async function translateWithModel(req: TranslateLineRequest): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You put one short spoken line into another Indian language for a language-learning app. The speaker is Chacha-ji, a warm, unhurried older man who runs a roadside chai stall and has telephoned a young learner he is fond of. Everything he says is said out loud, on a telephone, to a beginner. Reply ONLY as JSON.",
      },
      {
        role: "user",
        content: `Target language: ${req.languageName} (${req.nativeName}), written in the ${req.script} script.

He says this in Hindi: "${req.hindi}"
It means: "${req.english}"

Write the same line in ${req.languageName}.

Rules:
- Write it in the ${req.script} script. Never in English letters.
- One or two short sentences, about as long as the Hindi above.
- Spoken, not written. It is said aloud on a telephone.
- Keep his warmth and his affection. Address the learner the way a ${req.languageName} speaker would fondly address a child of the family, using that language's own word rather than the Hindi one.
- Say what he MEANS the way a ${req.languageName} speaker would say it. Do not translate word for word where that sounds unnatural.
- Simple, everyday words a beginner has a chance of catching.
- No emoji, no quotation marks, no dashes.

Reply as JSON: {"line": "<the line in ${req.languageName}, in ${req.script} script>"}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { line?: unknown };
  return typeof parsed.line === "string" ? parsed.line : "";
}

const defaultDeps: CallLineDeps = {
  findCached: (cacheKey) =>
    db.query.ttsCacheTable.findFirst({
      where: eq(ttsCacheTable.cacheKey, cacheKey),
      columns: { audioBase64: true, format: true, spokenText: true },
    }),
  saveCached: async (row) => {
    await db
      .insert(ttsCacheTable)
      .values({
        cacheKey: row.cacheKey,
        audioBase64: row.audioBase64,
        format: row.format,
        spokenText: row.spokenText,
      })
      // A row that predates spoken_text, or one another process wrote while we
      // were synthesizing, is replaced rather than left half-filled. Both halves
      // move together so the caption can never describe a different clip.
      .onConflictDoUpdate({
        target: ttsCacheTable.cacheKey,
        set: {
          audioBase64: row.audioBase64,
          format: row.format,
          spokenText: row.spokenText,
        },
      })
      .execute();
  },
  loadLanguage: (code) =>
    db.query.languagesTable.findFirst({
      where: eq(languagesTable.code, code),
      columns: { name: true, nativeName: true, script: true },
    }),
  translate: translateWithModel,
  synthesize: synthesizeChachaLine,
};

/** The romanization to show under a line, or null when it would not help. */
function romanizationFor(text: string, languageCode: string): string | null {
  const roman = romanizeTranscript(text, languageCode).trim();
  if (!roman) return null;
  // Latin passes through the transliterator untouched, so an already-Latin line
  // romanizes to itself. Printing it twice helps nobody, and the caption
  // component guards against it too; this keeps the wire honest as well.
  return roman === text.trim() ? null : roman;
}

/**
 * The words for one canned line in one language, generated if this is the first
 * time anyone has asked for them.
 *
 * FALLS BACK TO THE AUTHORED HINDI AND NEVER THROWS. A learner who cannot be
 * given their own language should still hear a whole sentence in his voice,
 * which is precisely what happened before this module existed. The warning is
 * the part that must not be silent: warn and above reaches Sentry, and a
 * translation step failing for every language would otherwise look exactly like
 * a feature working.
 */
export async function localizedCallLineText(
  lineKey: string,
  languageCode: string,
  deps: CallLineDeps = defaultDeps,
): Promise<string> {
  const source = CALL_CANNED_LINES[lineKey];
  if (!source) return "";
  const code = languageCode.trim().toLowerCase();
  if (!code || code === CALL_SOURCE_LANGUAGE) return source.text;

  try {
    const language = await deps.loadLanguage(code);
    if (!language) {
      logger.warn(
        { line: lineKey, languageCode: code },
        "[chacha-call] no language row, keeping his Hindi line",
      );
      return source.text;
    }

    const line = (
      await deps.translate({
        languageName: language.name,
        nativeName: language.nativeName,
        script: language.script,
        hindi: source.text,
        english: source.english,
      })
    )
      .replace(/\s+/g, " ")
      .trim();

    if (!line || line.length > MAX_LINE_CHARS) {
      logger.warn(
        { line: lineKey, languageCode: code, chars: line.length },
        "[chacha-call] unusable translation, keeping his Hindi line",
      );
      return source.text;
    }
    return line;
  } catch (err) {
    logger.warn(
      { err, line: lineKey, languageCode: code },
      "[chacha-call] translation failed, keeping his Hindi line",
    );
    return source.text;
  }
}

/**
 * One canned line, ready to play: his words in the learner's language, the
 * romanization under them, and the clip.
 *
 * THE CALLER NO LONGER PASSES THE TEXT IN, and that is the structural half of
 * this fix. The route used to hand a line key and a string to a function that
 * cached by key and synthesized the string, so a Hindi string could be, and was,
 * stored under a Gujarati key. With the text owned here there is nothing for a
 * caller to get wrong.
 */
export async function callLine(
  lineKey: string,
  languageCode: string,
  deps: CallLineDeps = defaultDeps,
): Promise<CallLine> {
  const source = CALL_CANNED_LINES[lineKey];
  const code = languageCode.trim().toLowerCase() || "und";
  const cacheKey = callLineCacheKey(lineKey, code);

  try {
    const hit = await deps.findCached(cacheKey);
    if (hit?.spokenText) {
      return {
        text: hit.spokenText,
        romanized: romanizationFor(hit.spokenText, code),
        audioBase64: hit.audioBase64,
        format: hit.format,
      };
    }
  } catch {
    // A cache we cannot read is not a call we cannot make. Fall through and
    // build the line from scratch.
  }

  const text = await localizedCallLineText(lineKey, code, deps);
  const romanized = romanizationFor(text, code);
  if (!text) return { text: "", romanized: null, audioBase64: null, format: null };

  try {
    const buffer = await deps.synthesize(text);
    if (buffer.length === 0) return { text, romanized, audioBase64: null, format: null };
    const audioBase64 = buffer.toString("base64");
    // Written before the answer goes out, so the next call in this language is a
    // hit. A cache write that fails costs the next learner a synthesis, never
    // this one their line.
    await deps
      .saveCached({ cacheKey, audioBase64, format: CHACHA_AUDIO_FORMAT, spokenText: text })
      .catch(() => {});
    return { text, romanized, audioBase64, format: CHACHA_AUDIO_FORMAT };
  } catch (err) {
    logger.warn(
      { err, line: lineKey, languageCode: code },
      "[chacha-call] canned line would not synthesize, sending the caption alone",
    );
    return { text, romanized, audioBase64: null, format: null };
  }
}

/**
 * Pre-synthesizes the FIXED lines of Chacha-ji's phone call for one language.
 *
 * SEPARATE FROM warmChachaLines BECAUSE THE CALL IS WHERE LATENCY ACTUALLY
 * BITES. His stall lines are allowed to be slow: the chai grant and the
 * celebration never wait on them. A call is not, and the canned lines are the
 * whole reason the call feels instant. Without this the first call after a
 * deploy synthesizes his hello on demand, which measured 1735 ms on 2026-08-28,
 * WORSE than the live gpt-audio turn the canned line exists to protect against.
 *
 * Same voice, model and instructions as the stall lines, and its own cache
 * namespace via callLineCacheKey, so rewording a call line cannot orphan a
 * stall clip or the reverse.
 */
export async function warmChachaCallLines(
  languageCode: string = CALL_SOURCE_LANGUAGE,
  deps: CallLineDeps = defaultDeps,
): Promise<void> {
  try {
    let synthesized = 0;
    let alreadyCached = 0;
    let failed = 0;

    for (const key of Object.keys(CALL_CANNED_LINES)) {
      try {
        const cacheKey = callLineCacheKey(key, languageCode);
        const hit = await deps.findCached(cacheKey);
        if (hit?.spokenText) {
          alreadyCached++;
          continue;
        }
        const line = await callLine(key, languageCode, deps);
        if (line.audioBase64) synthesized++;
        else failed++;
      } catch (err) {
        // One line failing must not cost the others. The route builds a miss on
        // demand, so the call still happens, just slower for that beat.
        failed++;
        logger.warn({ err, line: key }, "TTS pre-warm: Chacha call line failed");
      }
    }

    logger.info(
      {
        version: CALL_CACHE_KEY_VERSION,
        languageCode,
        alreadyCached,
        synthesized,
        failed,
      },
      "[chacha-call-tts] prewarm complete",
    );
  } catch (err) {
    logger.warn({ err }, "TTS pre-warm: Chacha call warm-up error (non-fatal)");
  }
}
