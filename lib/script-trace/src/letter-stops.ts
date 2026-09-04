/**
 * letter-stops.ts
 *
 * THE LETTER RECOGNITION STOP, stop 4 of every zone.
 *
 * Tracing teaches the hand and nothing ever taught the eye: a learner could
 * draw थ eight times at stop 2 and still not know it says "tha". This stop is
 * the other direction. Hear the sound, pick the romanisation.
 *
 * WHY STOP 4 AND NOT 3, since the fork asked for 3 and this says otherwise.
 * Stops 2 and 3 are already the two free tastes, tracing then story, settled
 * 2026-08-24 and documented at length in storyStopIndexIn. A Free learner gets
 * ONE phrase stop before the paywall, so a taste parked deeper is a taste
 * nobody reaches; putting letters at 3 would either displace the story taste or
 * push it past the wall. Splicing at 4 keeps both and reads better anyway:
 * write it, meet it in a story, then read it.
 *
 * BOTH CLIENTS CALL THIS AND NEITHER POSITIONS IT. Same rule as
 * traceStopIndexIn and storyStopIndexIn, for the same reason: the three splices
 * interact, each one pushes every graded stop at or after it down by one, and
 * two screens replaying that arithmetic separately is how they drifted before.
 */
import type { ScriptId } from "./scripts";
import { SCRIPT_BY_LANGUAGE } from "./scripts";
import {
  type TraceStopCharacter,
  traceStopFor,
  traceStopsFor,
} from "./trace-stops";

/** Questions in one letter stop. Matches the tracing stop, so the rhythm is one. */
export const LETTER_STOP_LENGTH = 8;

/** How many must be right. Mirrors the tracing stop's own bar. */
export const LETTER_STOP_PASS = 6;

/**
 * Wrong answers offered beside the right one.
 *
 * Three to begin with, four once the learner has had this letter right before,
 * which roughly halves the guess rate exactly where guessing has stopped being
 * the point. The caller supplies `seen`; the lib does not track progress.
 */
export const LETTER_CHOICES_FIRST = 3;
export const LETTER_CHOICES_SEEN = 4;

/**
 * Pairs a beginner genuinely confuses BY SHAPE, listed rather than derived.
 *
 * Edit distance on the romanisation catches the ear's confusions and misses the
 * eye's entirely: थ and श sound nothing alike and are near-identical on a
 * signboard. There is no rule that produces these, so they are written down,
 * and the list being short is honest rather than lazy.
 */
export const LETTER_LOOKALIKES: Readonly<Record<string, readonly string[]>> = {
  // Devanagari
  थ: ["श"],
  श: ["थ"],
  ध: ["घ"],
  घ: ["ध"],
  ब: ["व"],
  व: ["ब"],
  भ: ["म"],
  म: ["भ"],
  // Bengali
  ব: ["ধ"],
  ধ: ["ব"],
  // Gujarati
  ઘ: ["ધ"],
  ધ: ["ઘ"],
};

/** A resolved letter stop: what to ask, and the pool the wrong answers come from. */
export type LetterStop = {
  journey: number;
  zone: number;
  languageCode: string;
  script: ScriptId;
  title: string;
  /** The letters this stop asks about, in order. Never more than the length. */
  characters: TraceStopCharacter[];
  /**
   * Every letter the learner has met by this zone, tracing stops inclusive.
   * Wrong answers are drawn from here and NOWHERE else: offering a letter the
   * learner has never seen tests nothing and teaches less.
   */
  pool: TraceStopCharacter[];
};

export const LETTER_STOP_TITLE = "What sound does it make?";

/** Levenshtein, small strings only. Used to rank how confusable two sounds are. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[n]!;
}

/**
 * The unaspirated twin of an aspirated label, or null.
 *
 * "tha" -> "ta", "dha" -> "da", "kha" -> "ka". The single most common Indic
 * confusion and the one most worth drilling, so it is offered FIRST whenever
 * the alphabet actually contains it.
 */
export function unaspiratedTwin(label: string): string | null {
  const m = /^([kgcjtdpb])h(.*)$/i.exec(label);
  return m ? `${m[1]}${m[2]}` : null;
}

/**
 * Wrong answers for one letter, best first, deduped, never the answer itself.
 *
 * ORDER IS THE DESIGN. Random distractors make this free: Duolingo's
 * "na / tha / da" is not a random three, it is the three a beginner mixes up.
 *
 *   1. the unaspirated twin, if the alphabet has it
 *   2. a listed lookalike, which edit distance can never find
 *   3. nearest remaining labels by edit distance
 *
 * Drawn from `pool` only, so a letter the learner has not met can never appear.
 */
export function letterDistractorsFor(
  answer: TraceStopCharacter,
  pool: readonly TraceStopCharacter[],
  count: number,
): TraceStopCharacter[] {
  const others = pool.filter(
    (c) => c.id !== answer.id && c.label !== answer.label,
  );
  const out: TraceStopCharacter[] = [];
  const take = (c: TraceStopCharacter | undefined) => {
    if (!c) return;
    if (out.length >= count) return;
    if (out.some((o) => o.id === c.id || o.label === c.label)) return;
    out.push(c);
  };

  const twin = unaspiratedTwin(answer.label);
  if (twin) take(others.find((c) => c.label === twin));

  for (const look of LETTER_LOOKALIKES[answer.char] ?? []) {
    take(others.find((c) => c.char === look));
  }

  const byDistance = others
    .filter((c) => !out.some((o) => o.id === c.id))
    .map((c) => ({ c, d: editDistance(answer.label, c.label) }))
    .sort((a, b) => a.d - b.d || a.c.id.localeCompare(b.c.id));
  for (const { c } of byDistance) take(c);

  return out;
}

/**
 * The letter stop a language draws for a zone, or null when it has none.
 *
 * The questions are THIS zone's tracing characters when there are any, because
 * reading back what your hand just wrote is the whole pedagogy. Where a zone
 * has no tracing stop the stop still runs, on the most recent letters met, so
 * the drill does not simply vanish for half the journey.
 */
/**
 * Every letter the learner has met at or before this zone, in journey then zone
 * order, deduplicated.
 *
 * EXTRACTED so the match game can draw the same pool. It was inline in
 * letterStopFor, and the second caller would have been a second copy of "what
 * counts as met", which is the rule both games are revision against: a letter
 * nobody has been shown teaches nothing and tests less.
 */
export function lettersMetBy(
  languageCode: string,
  journey: number,
  zone: number,
): TraceStopCharacter[] {
  const out: TraceStopCharacter[] = [];
  const seen = new Set<string>();
  for (const stop of traceStopsFor(languageCode)) {
    if (stop.journey > journey) continue;
    if (stop.journey === journey && stop.zone > zone) continue;
    for (const c of stop.characters) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function letterStopFor(
  languageCode: string,
  journey: number,
  zone: number,
): LetterStop | null {
  const script = SCRIPT_BY_LANGUAGE[languageCode];
  if (!script) return null;

  const pool = lettersMetBy(languageCode, journey, zone);
  // Two wrong answers plus the right one is the smallest honest question.
  if (pool.length < LETTER_CHOICES_FIRST) return null;

  const here = traceStopFor(languageCode, journey, zone);
  const characters = (
    here?.characters.length ? here.characters : pool.slice(-LETTER_STOP_LENGTH)
  ).slice(0, LETTER_STOP_LENGTH);
  if (!characters.length) return null;

  return {
    journey,
    zone,
    languageCode,
    script,
    title: LETTER_STOP_TITLE,
    characters,
    pool,
  };
}

/**
 * Where the letter row lands in a run that ALREADY holds tracing and story.
 *
 * Straight after the story row, which puts it at stop 4, and never past the end
 * of the run. Same shape as storyStopIndexIn one level up, and the fallbacks
 * are the same idea: with no story row it follows tracing, and with neither it
 * takes the position those would have had.
 */
export function letterStopIndexIn(
  rowCount: number,
  journey: number,
  zone: number,
  traceIndex: number | null,
  storyIndex: number | null,
): number {
  const n = Math.max(0, rowCount);
  if (n === 0) return 0;
  if (storyIndex !== null) return Math.min(storyIndex + 1, n);
  if (traceIndex !== null) return Math.min(traceIndex + 1, n);
  if (journey === 1 && zone === 1) return Math.min(1, n);
  return Math.max(1, Math.floor(n / 2));
}
