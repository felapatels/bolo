/**
 * The Script Trace stop: one tracing lesson inside every fare zone.
 *
 * WHY THIS IS DATA AND NOT A COMPONENT. Requested 2026-08-23, for all 22
 * languages across both journeys at once. Web and mobile render the journey
 * map from two hand-maintained twins (CLAUDE.md, "Reuse before you write"), so
 * a ladder defined in either one would be a second definition of the
 * curriculum within a week. Everything about WHICH letters a stop teaches lives
 * here; the two apps keep only their canvas and their chrome.
 *
 * ADDED, NEVER SUBSTITUTED. The instruction was explicit: a trace stop is an
 * EXTRA stop in the zone, not a phrase stop repurposed. Nothing that already
 * teaches phrases is displaced, so a zone that had ten stops has eleven.
 *
 * THE LADDER, and why it is weighted rather than even. Four bands of rising
 * difficulty over twelve zones. An even split would put a quarter of the
 * curriculum on the sentences, and no script HAS that much: the alphabets run
 * 27 to 57 characters while the word sets are 6 to 8 and the sentence sets are
 * 3 to 6. So journey 1 spends all six zones walking the alphabet, and journey 2
 * spends its six on the compositions.
 *
 *   journey 1, zones 1-6   the alphabet, in six contiguous chunks
 *   journey 2, zones 1-2   the shorter half of the words
 *   journey 2, zones 3-4   the longer half of the words
 *   journey 2, zones 5-6   the sentences
 *
 * Chunks are computed from what a script actually has rather than fixed at N
 * per stop, which is what makes one ladder fit Tamil's 33 letters and Sindhi's
 * 62 without a per-script table. Journey 3 and beyond extend TRACE_STOP_LADDER
 * and nothing else.
 */
import { SCRIPT_TRACE_CHAPTERS, LANG_CHAPTER_IDS, type TraceCharacter } from "./chapters";
import { SCRIPT_BY_LANGUAGE, traceReadyFor, type ScriptId } from "./scripts";

/** Rising difficulty. The order here IS the difficulty order. */
export type TraceStopBand = "letters" | "short-words" | "long-words" | "sentences";

export const TRACE_STOP_BAND_TITLE: Record<TraceStopBand, string> = {
  letters: "Trace the letters",
  "short-words": "Trace a word",
  "long-words": "Trace a longer word",
  sentences: "Trace a sentence",
};

/** What one item of a band is called, so a stop can count its own contents. */
export const TRACE_STOP_BAND_NOUN: Record<
  TraceStopBand,
  { one: string; many: string }
> = {
  letters: { one: "letter", many: "letters" },
  "short-words": { one: "word", many: "words" },
  "long-words": { one: "word", many: "words" },
  sentences: { one: "sentence", many: "sentences" },
};

/** One rung: which band a zone draws from, and which slice of that band. */
export type TraceStopRung = {
  journey: number;
  /** 1-based within its journey, matching JOURNEY_ZONES order. */
  zone: number;
  band: TraceStopBand;
  /** 0-based index of this zone among the zones sharing its band... */
  slice: number;
  /** ...out of this many, which is how the band gets divided up. */
  slices: number;
};

function rung(
  journey: number,
  zone: number,
  band: TraceStopBand,
  slice: number,
  slices: number,
): TraceStopRung {
  return { journey, zone, band, slice, slices };
}

export const TRACE_STOP_LADDER: readonly TraceStopRung[] = [
  // Journey 1: the whole alphabet, split six ways. Contiguous and in roster
  // order, so a learner meets the vowels before the consonants without the
  // ladder having to know which is which.
  ...[1, 2, 3, 4, 5, 6].map((z) => rung(1, z, "letters", z - 1, 6)),
  // Journey 2: compositions. Words are split short-half then long-half, which
  // is the difficulty ramp the request asked for, measured rather than curated.
  rung(2, 1, "short-words", 0, 2),
  rung(2, 2, "short-words", 1, 2),
  rung(2, 3, "long-words", 0, 2),
  rung(2, 4, "long-words", 1, 2),
  rung(2, 5, "sentences", 0, 2),
  rung(2, 6, "sentences", 1, 2),
];

/**
 * A character resolved for a stop, tagged with the chapter it came from.
 *
 * WHY THE TAG. A stop's characters are a slice ACROSS chapters: Gujarati zone
 * 2 runs from the last vowels into the first consonants, so one stop spans
 * "gujarati-vowels" and "gujarati-consonants". The progress endpoint keys on a
 * real chapter id and rejects anything else (isTraceChapterId), so a session
 * driven from a stop has to remember, per character, which chapter to record
 * against. Added 2026-08-23 when the tracing stop learned to run as its own
 * session rather than sending the learner to a chapter menu.
 */
export type TraceStopCharacter = TraceCharacter & { chapterId: string };

/** A resolved stop: the rung plus the characters this language actually has. */
export type TraceStop = TraceStopRung & {
  languageCode: string;
  script: ScriptId;
  title: string;
  characters: TraceStopCharacter[];
};

/**
 * Every character a language has at one stage, deduped, in chapter order.
 *
 * Joins on LANG_CHAPTER_IDS for the reason alphabetForScript documents at
 * length: chapters.ts spells Manipuri's script "Meitei Mayek" while
 * SCRIPT_NAMES says "Meetei Mayek", so anything joining on the display name
 * silently finds nothing for one language and reports it as empty.
 */
export function charactersAt(
  languageCode: string,
  stage: string,
): TraceStopCharacter[] {
  const wanted = new Set(LANG_CHAPTER_IDS[languageCode] ?? []);
  const seen = new Set<string>();
  const out: TraceStopCharacter[] = [];
  for (const chapter of SCRIPT_TRACE_CHAPTERS) {
    if (!wanted.has(chapter.id) || chapter.stage !== stage) continue;
    for (const c of chapter.characters) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      // First chapter wins, matching the dedupe above: a character shared by
      // two chapters records against the one the learner meets first.
      out.push({ ...c, chapterId: chapter.id });
    }
  }
  return out;
}

/**
 * The alphabet ONE LANGUAGE teaches, which is not the same as its script's.
 *
 * alphabetForScript() unions every language on a script, which is right for
 * budgeting authored glyphs (the unit of that work is the script) and wrong for
 * a curriculum. Perso-Arabic is the case that proves it: Urdu teaches 39
 * letters, Kashmiri 44 and Sindhi 62, so the union is 62 and an Urdu learner
 * would be handed 23 letters that are not in their alphabet.
 *
 * Added 2026-08-23 when a trace-stop test asserted journey 1 covered the whole
 * alphabet and Urdu failed it by exactly Sindhi's extra letters.
 */
export function alphabetForLanguage(languageCode: string): TraceStopCharacter[] {
  return charactersAt(languageCode, "alphabet");
}

/**
 * Split `items` into `slices` contiguous chunks and return chunk `slice`.
 *
 * Front-loaded when it does not divide evenly, so the earlier and easier stops
 * absorb the remainder rather than the last stop being the long one.
 */
function chunk<T>(items: readonly T[], slice: number, slices: number): T[] {
  if (slices <= 0 || items.length === 0) return [];
  const base = Math.floor(items.length / slices);
  const extra = items.length % slices;
  const start = slice * base + Math.min(slice, extra);
  const size = base + (slice < extra ? 1 : 0);
  return items.slice(start, start + size);
}

/** The words this language traces, shortest first, so the halves are a ramp. */
function wordsByLength(languageCode: string): TraceStopCharacter[] {
  return [...charactersAt(languageCode, "words")].sort(
    (a, b) => [...a.char].length - [...b.char].length || a.id.localeCompare(b.id),
  );
}

/** The pool a band draws from, before it is sliced. */
function poolFor(languageCode: string, band: TraceStopBand): TraceStopCharacter[] {
  if (band === "letters") return charactersAt(languageCode, "alphabet");
  if (band === "sentences") return charactersAt(languageCode, "sentences");
  // Short and long are the two halves of one measured list. Splitting by
  // length rather than by a hand-picked list is what keeps this working for a
  // script nobody on the team reads.
  const words = wordsByLength(languageCode);
  const half = Math.ceil(words.length / 2);
  return band === "short-words" ? words.slice(0, half) : words.slice(half);
}

/**
 * The trace stop for one zone, or null when there is nothing to teach there.
 *
 * Null rather than an empty stop, and gated on traceReadyFor() as well, for the
 * reason PLAYABLE_GLYPH_FLOOR exists: a stop that opens onto two characters
 * reads as broken rather than short.
 */
export function traceStopFor(
  languageCode: string,
  journey: number,
  zone: number,
): TraceStop | null {
  const script = SCRIPT_BY_LANGUAGE[languageCode];
  if (!script || !traceReadyFor(languageCode)) return null;

  const rungFound = TRACE_STOP_LADDER.find(
    (r) => r.journey === journey && r.zone === zone,
  );
  if (!rungFound) return null;

  const characters = chunk(
    poolFor(languageCode, rungFound.band),
    rungFound.slice,
    rungFound.slices,
  );
  if (!characters.length) return null;

  return {
    ...rungFound,
    languageCode,
    script,
    title: TRACE_STOP_BAND_TITLE[rungFound.band],
    characters,
  };
}

/** Every trace stop a language offers, in journey then zone order. */
export function traceStopsFor(languageCode: string): TraceStop[] {
  return TRACE_STOP_LADDER.map((r) =>
    traceStopFor(languageCode, r.journey, r.zone),
  ).filter((s): s is TraceStop => s !== null);
}

/**
 * Where the trace stop sits among a zone's existing stops, 0-based.
 *
 * The MIDDLE, which is the request: "maybe stop 5, 15, so on" describes a
 * tracing break roughly halfway through each zone rather than a reward bolted
 * on the end. A zone of ten phrase stops therefore runs five phrase stops, the
 * trace stop, then five more.
 *
 * Both clients must call this rather than each choosing a position, or the web
 * and the phone will disagree about which stop a learner is on.
 */
export function traceStopIndexIn(phraseStopCount: number): number {
  const n = Math.max(0, phraseStopCount);
  if (n === 0) return 0;
  // NEVER FIRST, which floor(n/2) got wrong for a one-stop zone: it returned 0
  // and put tracing ahead of the learner's very first phrase stop. A journey
  // map that opens onto "trace the letters" before anyone has said a word
  // reads as the wrong app. Caught 2026-08-23 by the scroll-on-open test,
  // which noticed the first stop was no longer at the top of the line.
  return Math.max(1, Math.floor(n / 2));
}

/**
 * Whether a chapter id is real, and how many characters it holds.
 *
 * WHY THESE EXIST. games.ts hardcoded a four-item VALID_CHAPTERS list and a
 * CHAPTER_SIZE of 10 with the comment "All current chapters contain exactly 10
 * characters". Both were false by 2026-08-23: there are 48 chapters, exactly 2
 * of which hold 10 characters, and the alphabet chapters run 5 to 39. So
 * twenty of twenty-two languages could not record tracing progress at all, and
 * where they could, a chapter "completed" and paid XP after ten letters
 * regardless of whether it held five or thirty-nine.
 *
 * Derived from the chapter data rather than restated, so completing the
 * alphabets again cannot desynchronise them a second time.
 */
export function isTraceChapterId(id: string): boolean {
  return SCRIPT_TRACE_CHAPTERS.some((c) => c.id === id);
}

export function traceChapterSize(id: string): number {
  return SCRIPT_TRACE_CHAPTERS.find((c) => c.id === id)?.characters.length ?? 0;
}

/**
 * Whether a language actually studies a chapter.
 *
 * A chapter CANNOT tell you its language, which is the assumption
 * languageCodeFromChapter was built on: the Devanagari chapters serve Hindi,
 * Marathi, Nepali, Sanskrit, Maithili, Konkani, Dogri and Bodo alike, so
 * "hindi-vowels" belongs to eight languages at once. The caller has to say
 * which language the learner is studying; this is how that claim is checked.
 */
export function languageStudiesChapter(
  languageCode: string,
  chapterId: string,
): boolean {
  return (LANG_CHAPTER_IDS[languageCode] ?? []).includes(chapterId);
}

/** The chapters a language's trace stops draw from, for fetching progress. */
export function traceChaptersFor(languageCode: string): string[] {
  return [...(LANG_CHAPTER_IDS[languageCode] ?? [])];
}

/**
 * Where a learner stands on one trace stop, from the characters they have
 * passed.
 *
 * DERIVED, never stored, which is the convention lesson_group_progress already
 * follows: "Most unlock state is DERIVED at read time". A trace stop has no
 * row of its own and should not get one, because everything it needs is
 * already in script_trace_progress keyed per character.
 *
 * Note there is no "locked". A trace stop never gates the stops after it: it
 * teaches the alphabet, which is orthogonal to the phrases around it, and a
 * learner blocked from their next phrase stop because they had not traced
 * ળ would rightly be baffled.
 */
export type TraceStopStatus = "unlocked" | "in_progress" | "completed";

export function traceStopStatus(
  stop: TraceStop,
  passedCharacterIds: ReadonlySet<string>,
): TraceStopStatus {
  const passed = stop.characters.filter((c) => passedCharacterIds.has(c.id)).length;
  if (passed === 0) return "unlocked";
  return passed === stop.characters.length ? "completed" : "in_progress";
}

/** How many of this stop's characters the learner has already passed. */
export function traceStopPassedCount(
  stop: TraceStop,
  passedCharacterIds: ReadonlySet<string>,
): number {
  return stop.characters.filter((c) => passedCharacterIds.has(c.id)).length;
}

/**
 * The one line a tracing stop shows on the journey map.
 *
 * HERE RATHER THAN IN EITHER CLIENT, for the reason at the top of this file:
 * the web map and the phone map are hand-maintained twins, so copy defined in
 * one of them becomes two different copies inside a week.
 *
 * WHAT IT REPLACES, and why this function exists at all. The card fell through
 * to the phrase-stop line, `${station.phraseCount} phrases`, and a tracing stop
 * has no phrases — so every tracing stop in all 22 languages read
 * "Now boarding · undefined phrases" on bolo-india.app. Seen on the live site
 * 2026-08-23, the first time anyone opened the map after the stop shipped.
 * It also said nothing about tracing, so the stop was indistinguishable from
 * the phrase stops around it apart from the broken word.
 */
export function traceStopCopy(stop: TraceStop, passedCount: number): string {
  const total = stop.characters.length;
  const noun = TRACE_STOP_BAND_NOUN[stop.band];
  const word = total === 1 ? noun.one : noun.many;
  if (passedCount >= total) return `All ${total} ${word} traced`;
  if (passedCount > 0) return `${passedCount} of ${total} ${word} traced`;
  return `Trace ${total} ${word}`;
}
