// HOW A STOP IS PLAYED, decided in ONE place, and never WHICH stops exist.
//
// Owner ruling, 2026-09-14 (Last Call, slice 1): Last Call REPLACES a voice
// stop, it never adds a row. The lesson group behind the row is unchanged; only
// the way the learner plays it changes. Clarified the same day, verbatim:
// "essentially regardless of a game being in the middle, no 2 neighboring stops
// should be the same type of lesson."
//
// So this runs AFTER planZoneRows (mobile lib/journeyRows.ts, web
// src/lib/journey-rows.ts) has spliced the tracing, story and letter rows in,
// and it only relabels. Row numbers, "Stop N of M", the trackside signals,
// Chacha-ji's stations and the zone closeout all count off the graded stations
// or the row plan, and none of them read this, which is why converting a row
// cannot move any of them.
//
// WHY IT LIVES IN @workspace/script-trace. Written for mobile in slice 1 as an
// import-free file so it could move here verbatim; slice 2 (web, 2026-09-14)
// moved it, because BOTH clients calling one rule is the only way the map and
// the phone agree on which rows are Last Call. This package was the fit that
// needed no manifest or lockfile change: both artifacts already depend on it,
// it already owns the journey placement rules this sits beside
// (traceStopIndexIn, letterStopIndexIn), and it already holds a non-stroke game
// (letter-match.ts). A new package would have needed `pnpm install`, which
// rewrites the lockfile (CLAUDE.md, "Prefer pnpm install --frozen-lockfile").
// It imports only a constant from its sibling answer-back.ts, nothing outside
// this package, which keeps the package's "pure" promise.
//
// ANSWER BACK SHARES THE SLOTS, BY BEST FIT (owner ruling 2026-09-14, reply
// "c"): each converted slot plays ANSWER BACK when its lesson group resolves to
// at least ANSWER_BACK_MIN_EXCHANGES exchanges (answer-back.ts
// answerBackExchangesFor), and LAST CALL otherwise. This REPLACED a strict
// alternation (Last Call, Answer Back, ... along the line) written earlier the
// same day, which put India zone 1's Answer Back slots on sentence stops that
// field almost no pairs, so Hindi zone 1 never showed one. Best fit needs no
// counter and no cross-zone carry of one: each slot decides from its own
// group alone. The neighbour rule is untouched, because converted slots are
// never neighbours (each needs a voice row before it), so any mix of the two
// kinds keeps "no 2 neighboring stops the same type".
//
// PURE: the exchange count per group comes IN (answerBackCounts), it is never
// fetched here. A group with no count yet reads as Last Call, so the map shows
// Last Call until it has the group's phrases.
//
// Callers: bolo-mobile app/(app)/journey.tsx and gujarati-coach
// src/pages/journey.tsx. Pinned twice, by bolo-mobile __tests__/stop-play.test.ts
// and gujarati-coach src/test/stop-play.test.ts.

/**
 * What a map row IS, independent of how it is played. `voice` is every graded
 * lesson group, phrase stage and sentence stage alike: both are played through
 * the same record, score and attempt path, so for "same type of lesson" they
 * are one family. That is what makes the owner's India zone 1 example
 * (V V V SE SE) convert across the phrase/sentence seam.
 */
export type MapRowKind = 'voice' | 'trace' | 'story' | 'letter';

import { ANSWER_BACK_MIN_EXCHANGES } from './answer-back';

/**
 * The play kinds a voice slot can be CONVERTED into. Open on purpose: Answer
 * Back joined Last Call here as a new member, not a new function shape, which
 * is what this union was left open for.
 */
export type ConvertedPlayKind = 'last_call' | 'answer_back';

/** How a row is played on the map, after conversion. */
export type StopPlayKind = MapRowKind | ConvertedPlayKind;

/** Mirrors the generated LanguageSpeechCapability, restated so this file stays import-free. */
export type SpeechCapabilityInput = 'supported' | 'degraded' | 'unsupported';

export function isConvertedPlayKind(kind: StopPlayKind | null | undefined): kind is ConvertedPlayKind {
  return kind === 'last_call' || kind === 'answer_back';
}

/**
 * BEST FIT for one converted slot: Answer Back when the group's exchange count
 * reaches the minimum, Last Call otherwise, including when the count is not
 * known yet (owner ruling 2026-09-14, "c").
 */
export function bestFitConvertedKind(exchangeCount: number | null | undefined): ConvertedPlayKind {
  return typeof exchangeCount === 'number' && exchangeCount >= ANSWER_BACK_MIN_EXCHANGES ? 'answer_back' : 'last_call';
}

/**
 * The row's kind from the discriminators the journey map already carries on
 * a Station. Anything that is not one of the three synthesised rows is a
 * graded lesson group, which is the same test the map's own onPress uses.
 */
export function mapRowKindOf(row: { trace?: unknown; story?: unknown; letter?: unknown }): MapRowKind {
  if (row.trace) return 'trace';
  if (row.story) return 'story';
  if (row.letter) return 'letter';
  return 'voice';
}

export interface PlanStopPlayInput {
  /** The zone's map rows IN DRAWN ORDER, after the trace, story and letter splices. */
  rows: readonly MapRowKind[];
  /**
   * The language's speech capability. 'unsupported' languages never get a
   * converted stop: their voice stops are listen-record-compare stops with no
   * scored band, and a timed recall round needs a band to board anyone.
   * Absent reads as 'supported', the same default LanguageContext applies.
   */
  speechCapability?: SpeechCapabilityInput | null;
  /**
   * How the LAST row of the previous zone is played, or null when there is no
   * previous zone (the first zone of the line) or nothing before it has rows.
   *
   * ZONE BOUNDARIES COUNT (owner clarification, 2026-09-14): the last stop of
   * zone N and the first stop of zone N+1 are neighbours on the line, so a
   * zone that ends on a voice stop turns the next zone's opening voice stop
   * into a converted stop.
   *
   * Only map rows are neighbours. Signal games, Chacha-ji's stalls and calls
   * sit BETWEEN rows and are not rows, so they never break a run and are
   * never passed in here.
   */
  previousZoneLastKind: StopPlayKind | null;
  /**
   * The lesson group id behind each row, index-aligned with `rows`, undefined
   * for a row that is not a graded group. Only read for converted slots.
   */
  rowGroupIds?: readonly (number | undefined)[];
  /**
   * Answer Back exchanges each group can field, by group id (the caller runs
   * answerBackExchangesFor on phrases it already has). A missing entry is
   * "not known yet" and plays Last Call. Absent altogether: every converted
   * slot is Last Call, which is exactly the pre-Answer-Back behaviour.
   */
  answerBackCounts?: Readonly<Record<number, number>>;
  /**
   * Overrides the best-fit choice. For the pins; the journey maps do not pass
   * it. `ordinal` counts converted slots within this call from 0.
   */
  chooseConverted?: (slot: { rowIndex: number; ordinal: number }) => ConvertedPlayKind;
}

/**
 * THE RULE. Walk the rows in order; a voice row whose previous row (as PLAYED,
 * including the previous zone's last row for the first one) is also a voice
 * row still being played as voice becomes a converted stop.
 *
 * Reading "as played" is what makes it alternate rather than convert every
 * voice row after the first: V V V becomes V LC V, because the second row's
 * conversion means the third one's neighbour is no longer a voice stop.
 *
 * It therefore holds the owner's invariant for every kind: no two neighbouring
 * rows are both voice (the second would have converted), and no two are both
 * converted of ANY kind (a conversion needs a voice row before it), which is
 * why best fit can pick either game for any slot without breaking it.
 */
export function planStopPlay({
  rows,
  speechCapability,
  previousZoneLastKind,
  rowGroupIds,
  answerBackCounts,
  chooseConverted,
}: PlanStopPlayInput): StopPlayKind[] {
  if (speechCapability === 'unsupported') return [...rows];
  const choose =
    chooseConverted ??
    (({ rowIndex }: { rowIndex: number }) => {
      const id = rowGroupIds?.[rowIndex];
      return bestFitConvertedKind(id === undefined ? undefined : answerBackCounts?.[id]);
    });
  const out: StopPlayKind[] = [];
  let previous: StopPlayKind | null = previousZoneLastKind;
  let ordinal = 0;
  rows.forEach((kind, rowIndex) => {
    const played: StopPlayKind =
      kind === 'voice' && previous === 'voice'
        ? choose({ rowIndex, ordinal: ordinal++ })
        : kind;
    out.push(played);
    previous = played;
  });
  return out;
}

/**
 * The value to hand the NEXT zone as `previousZoneLastKind`. A zone with no
 * rows (nothing served for it) is not a neighbour of anything, so the carry
 * passes straight through it rather than resetting to null.
 */
export function lastPlayedKind(
  played: readonly StopPlayKind[],
  carry: StopPlayKind | null,
): StopPlayKind | null {
  return played.length > 0 ? played[played.length - 1]! : carry;
}
