import { describe, it, expect } from 'vitest';
// LAST CALL REPLACES A VOICE STOP, IT NEVER ADDS A ROW. The web pins.
//
// Twin of bolo-mobile __tests__/stop-play.test.ts, case for case. The rule
// itself is ONE function, planStopPlay in @workspace/script-trace, called by
// both journey maps since Last Call slice 2 (2026-09-14); this copy exists
// because the second case replays the WEB planZoneRows (src/lib/journey-rows.ts),
// which is a hand-kept twin of mobile's and could drift on its own.
//
// Owner ruling, 2026-09-14, and the same day's clarification, verbatim:
// "essentially regardless of a game being in the middle, no 2 neighboring
// stops should be the same type of lesson."
//
// Written 2026-09-14 and NOT YET RUN (typecheck only while developing, per
// CLAUDE.md). Runs with the full web suite before the next publish.
import { planZoneRows } from '@/lib/journey-rows';
import {
  bestFitConvertedKind,
  isConvertedPlayKind,
  lastPlayedKind,
  mapRowKindOf,
  planStopPlay,
  type MapRowKind,
  type StopPlayKind,
} from '@workspace/script-trace';

const V: MapRowKind = 'voice';
const T: MapRowKind = 'trace';
const S: MapRowKind = 'story';
const L: MapRowKind = 'letter';
const LC: StopPlayKind = 'last_call';
const AB: StopPlayKind = 'answer_back';

describe('planStopPlay, the owner examples', () => {
  it('India zone 1: V T S L V V V SE SE SE SE SE becomes V T S L V LC V LC SE LC SE LC', () => {
    // Phrase and sentence stages are one voice family (SE is a voice row).
    const rows = [V, T, S, L, V, V, V, V, V, V, V, V];
    expect(planStopPlay({ rows, speechCapability: 'supported', previousZoneLastKind: null })).toEqual([
      V, T, S, L, V, LC, V, LC, V, LC, V, LC,
    ]);
  });

  it('the India zone 1 rows above are what the map actually draws for nine graded stops', () => {
    // Guards the example against drift: replay planZoneRows' three splices on
    // nine graded stops the same way journey.tsx does, and the run must be the
    // sequence the owner quoted. If the splices ever move, this fails first.
    const plan = planZoneRows({ lang: 'hi', zoneIndex: 0, gradedCount: 9 });
    const drawn: MapRowKind[] = Array.from({ length: 9 }, () => V);
    if (plan.traceIndex !== null) drawn.splice(plan.traceIndex, 0, T);
    if (plan.storyIndex !== null) drawn.splice(plan.storyIndex, 0, S);
    if (plan.letterIndex !== null) drawn.splice(plan.letterIndex, 0, L);
    expect(drawn).toEqual([V, T, S, L, V, V, V, V, V, V, V, V]);
    expect(planStopPlay({ rows: drawn, speechCapability: 'supported', previousZoneLastKind: null })).toHaveLength(
      plan.rowCount,
    );
  });

  it('the other forks, eleven rows: V S V V V V V V V V V becomes V S V LC V LC V LC V LC V', () => {
    const rows = [V, S, V, V, V, V, V, V, V, V, V];
    expect(planStopPlay({ rows, previousZoneLastKind: null })).toEqual([V, S, V, LC, V, LC, V, LC, V, LC, V]);
  });

  it('leaves an unsupported language exactly as it was: its voice stops stay compare stops', () => {
    const rows = [V, T, S, L, V, V, V, V, V];
    expect(planStopPlay({ rows, speechCapability: 'unsupported', previousZoneLastKind: 'voice' })).toEqual(rows);
  });

  it('converts a degraded language like a supported one: scoring still runs there', () => {
    expect(planStopPlay({ rows: [V, V], speechCapability: 'degraded', previousZoneLastKind: null })).toEqual([V, LC]);
  });

  it('reads an absent capability as supported, the LanguageContext default', () => {
    expect(planStopPlay({ rows: [V, V], speechCapability: undefined, previousZoneLastKind: null })).toEqual([V, LC]);
  });
});

describe('planStopPlay never adds, removes or moves a row', () => {
  it('keeps the row count and every non-voice row where it was', () => {
    const rows = [V, V, T, V, V, S, L, V, V, V];
    const played = planStopPlay({ rows, previousZoneLastKind: null });
    expect(played).toHaveLength(rows.length);
    rows.forEach((kind, i) => {
      if (kind !== V) expect(played[i]).toBe(kind);
      else expect([V, LC]).toContain(played[i]);
    });
  });
});

describe('zone boundaries count', () => {
  it('turns the first row into Last Call when the previous zone ended on a voice stop', () => {
    expect(planStopPlay({ rows: [V, T, V], previousZoneLastKind: 'voice' })).toEqual([LC, T, V]);
  });

  it('leaves the first row as voice when the previous zone ended on Last Call', () => {
    expect(planStopPlay({ rows: [V, V, V], previousZoneLastKind: 'last_call' })).toEqual([V, LC, V]);
  });

  it('leaves the first row as voice after a trace, story or letter row', () => {
    for (const prev of [T, S, L] as const) {
      expect(planStopPlay({ rows: [V, V], previousZoneLastKind: prev })).toEqual([V, LC]);
    }
  });

  it('carries the last played kind to the next zone, and straight through an empty zone', () => {
    const zone1 = planStopPlay({ rows: [V, T, V], previousZoneLastKind: null });
    const carry1 = lastPlayedKind(zone1, null);
    expect(carry1).toBe('voice');
    // An empty zone is not a neighbour of anything.
    const carry2 = lastPlayedKind(planStopPlay({ rows: [], previousZoneLastKind: carry1 }), carry1);
    expect(carry2).toBe('voice');
    expect(planStopPlay({ rows: [V], previousZoneLastKind: carry2 })).toEqual([LC]);
  });
});

describe('the invariant, swept: no two neighbouring stops of the same type', () => {
  // Every row sequence up to six long over the four map kinds, from every
  // possible previous-zone ending. 4^6 = 4096 sequences per start, small enough
  // to be exhaustive rather than sampled.
  const KINDS: MapRowKind[] = [V, T, S, L];
  const PREVS: (StopPlayKind | null)[] = [null, V, T, S, L, LC];
  function* sequences(len: number, prefix: MapRowKind[] = []): Generator<MapRowKind[]> {
    if (prefix.length === len) {
      yield prefix;
      return;
    }
    for (const k of KINDS) yield* sequences(len, [...prefix, k]);
  }

  it('never leaves voice next to voice, or Last Call next to Last Call, across the boundary too', () => {
    let checked = 0;
    for (const prev of PREVS) {
      for (let len = 1; len <= 6; len++) {
        for (const rows of sequences(len)) {
          const played = planStopPlay({ rows, speechCapability: 'supported', previousZoneLastKind: prev });
          const line: (StopPlayKind | null)[] = [prev, ...played];
          for (let i = 0; i + 1 < line.length; i++) {
            const a = line[i];
            const b = line[i + 1];
            if (a === null) continue;
            const sameVoice = a === V && b === V;
            const sameConverted = a === LC && b === LC;
            if (sameVoice || sameConverted) {
              throw new Error(`prev=${prev} rows=${rows.join(',')} played=${played.join(',')} at ${i}`);
            }
          }
          checked++;
        }
      }
    }
    // Proves the sweep ran rather than passing vacuously.
    expect(checked).toBe(PREVS.length * (4 + 16 + 64 + 256 + 1024 + 4096));
  });
});

describe('the open union: a later converted kind shares the slots', () => {
  it('asks chooseConverted for each converted slot, counting them from zero', () => {
    const seen: { rowIndex: number; ordinal: number }[] = [];
    const played = planStopPlay({
      rows: [V, V, V, V, V],
      previousZoneLastKind: null,
      chooseConverted: (slot) => {
        seen.push(slot);
        return 'last_call';
      },
    });
    expect(played).toEqual([V, LC, V, LC, V]);
    expect(seen).toEqual([
      { rowIndex: 1, ordinal: 0 },
      { rowIndex: 3, ordinal: 1 },
    ]);
  });
});

describe('Answer Back shares the slots: BEST FIT per slot', () => {
  // INVERTED 2026-09-14 on the owner's ruling "c": "Each replaced stop picks
  // Answer Back when its phrases make at least 3 pairs, and Last Call
  // otherwise." These cases replace the strict-alternation pins written earlier
  // the same day (Last Call on even converted ordinals, Answer Back on odd,
  // carried across zones). That alternation put India zone 1's Answer Back
  // slots on sentence stops with almost no pairs; the alternation expectations
  // are inverted below into best-fit ones rather than deleted.
  // Written 2026-09-14, NOT YET RUN (typecheck only while developing).

  it('picks Answer Back at three exchanges or more, Last Call below or unknown', () => {
    expect(bestFitConvertedKind(3)).toBe(AB);
    expect(bestFitConvertedKind(6)).toBe(AB);
    expect(bestFitConvertedKind(2)).toBe(LC);
    expect(bestFitConvertedKind(0)).toBe(LC);
    expect(bestFitConvertedKind(undefined)).toBe(LC);
  });

  // India zone 1 as the map draws it: V T S L then graded stops 2 to 9, so the
  // graded stops sit at rows 0 and 4 to 11. Group ids are the stop numbers.
  const ZONE1_ROWS = [V, T, S, L, V, V, V, V, V, V, V, V];
  const ZONE1_IDS = [1, undefined, undefined, undefined, 2, 3, 4, 5, 6, 7, 8, 9];
  const countsOf = (list: number[]) => Object.fromEntries(list.map((n, i) => [i + 1, n]));
  const zone1 = (counts: number[]) =>
    planStopPlay({
      rows: ZONE1_ROWS,
      speechCapability: 'supported',
      previousZoneLastKind: null,
      rowGroupIds: ZONE1_IDS,
      answerBackCounts: countsOf(counts),
    });

  it('Hindi zone 1, measured counts 6 6 3 3 . 0 0 1 0 0: Answer Back only on stop 3, the one converted slot at 3 or more', () => {
    expect(zone1([6, 6, 3, 3, 0, 0, 1, 0, 0])).toEqual([V, T, S, L, V, AB, V, LC, V, LC, V, LC]);
  });

  it('Gujarati 5 4 4 4 . 5 0 0 5 1, Tamil 6 4 2 0 . 1 1 2 3 2, Bengali 6 4 1 1 . 2 2 0 0 0', () => {
    expect(zone1([5, 4, 4, 4, 5, 0, 0, 5, 1])).toEqual([V, T, S, L, V, AB, V, AB, V, LC, V, LC]);
    expect(zone1([6, 4, 2, 0, 1, 1, 2, 3, 2])).toEqual([V, T, S, L, V, LC, V, LC, V, LC, V, LC]);
    expect(zone1([6, 4, 1, 1, 2, 2, 0, 0, 0])).toEqual([V, T, S, L, V, LC, V, LC, V, LC, V, LC]);
  });

  it('with no counts at all, every converted slot is Last Call, as before Answer Back', () => {
    expect(
      planStopPlay({ rows: ZONE1_ROWS, previousZoneLastKind: null, rowGroupIds: ZONE1_IDS }),
    ).toEqual([V, T, S, L, V, LC, V, LC, V, LC, V, LC]);
  });

  it('inverted from "continues the alternation into the next zone": the next zone decides by content, and only the last played kind carries', () => {
    const counts = { 1: 5, 2: 5, 3: 5, 4: 0, 5: 5, 6: 5, 7: 5 };
    const first = planStopPlay({ rows: [V, V, V], previousZoneLastKind: null, rowGroupIds: [1, 2, 3], answerBackCounts: counts });
    expect(first).toEqual([V, AB, V]);
    // Under alternation this was [AB, T, V, LC]; under best fit both converted
    // rows read their own groups: 4 has 0 exchanges, 7 has 5.
    const second = planStopPlay({
      rows: [V, T, V, V],
      previousZoneLastKind: lastPlayedKind(first, null),
      rowGroupIds: [4, undefined, 5, 7],
      answerBackCounts: counts,
    });
    expect(second).toEqual([LC, T, V, AB]);
  });

  it('never converts an unsupported language, whatever the content', () => {
    expect(
      planStopPlay({
        rows: [V, V, V, V],
        speechCapability: 'unsupported',
        previousZoneLastKind: 'voice',
        rowGroupIds: [1, 2, 3, 4],
        answerBackCounts: { 1: 9, 2: 9, 3: 9, 4: 9 },
      }),
    ).toEqual([V, V, V, V]);
    expect(isConvertedPlayKind('answer_back')).toBe(true);
    expect(isConvertedPlayKind('voice')).toBe(false);
  });

  it('THE INVARIANT, swept for all-sufficient, all-insufficient and mixed content, across the boundary too', () => {
    // No two neighbouring rows share a play kind, and no two are both voice or
    // both converted. Sequences up to six rows over the four map kinds, from
    // every previous-zone ending including both games. Adjacent identical
    // tracing, story or letter rows are skipped: planZoneRows never draws them,
    // and this rule only relabels voice rows, so it could not separate them.
    const KINDS: MapRowKind[] = [V, T, S, L];
    const PREVS: (StopPlayKind | null)[] = [null, V, T, S, L, LC, AB];
    function* sequences(len: number, prefix: MapRowKind[] = []): Generator<MapRowKind[]> {
      if (prefix.length === len) {
        yield prefix;
        return;
      }
      for (const k of KINDS) {
        const last = prefix[prefix.length - 1];
        if (k !== V && k === last) continue;
        yield* sequences(len, [...prefix, k]);
      }
    }
    const CONTENT: Record<string, (rowIndex: number) => number> = {
      allSufficient: () => 5,
      allInsufficient: () => 0,
      mixedEven: (r) => (r % 2 === 0 ? 5 : 1),
      mixedOdd: (r) => (r % 2 === 1 ? 5 : 1),
      ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((only) => [`only${only}`, (r: number) => (r === only ? 3 : 2)])),
    };
    let checked = 0;
    for (const prev of PREVS) {
      for (const [name, countAt] of Object.entries(CONTENT)) {
        for (let len = 1; len <= 6; len++) {
          for (const rows of sequences(len)) {
            if (prev !== null && !isConvertedPlayKind(prev) && prev !== V && rows[0] === prev) continue;
            const ids = rows.map((_, i) => i + 100);
            const counts = Object.fromEntries(ids.map((id, i) => [id, countAt(i)]));
            const played = planStopPlay({
              rows,
              speechCapability: 'supported',
              previousZoneLastKind: prev,
              rowGroupIds: ids,
              answerBackCounts: counts,
            });
            played.forEach((k, i) => {
              if (isConvertedPlayKind(k)) expect(k).toBe(bestFitConvertedKind(countAt(i)));
            });
            const line: (StopPlayKind | null)[] = [prev, ...played];
            for (let i = 0; i + 1 < line.length; i++) {
              const a = line[i];
              const b = line[i + 1] ?? null;
              if (a === null) continue;
              if (a === b || (isConvertedPlayKind(a) && isConvertedPlayKind(b))) {
                throw new Error(`${name} prev=${prev} rows=${rows.join(',')} played=${played.join(',')} at ${i}`);
              }
            }
            checked++;
          }
        }
      }
    }
    // Proves the sweep ran rather than passing vacuously.
    expect(checked).toBeGreaterThan(PREVS.length * Object.keys(CONTENT).length * 500);
  });
});

describe('mapRowKindOf', () => {
  it('reads the three synthesised rows off their discriminators and everything else as voice', () => {
    expect(mapRowKindOf({ trace: {} })).toBe('trace');
    expect(mapRowKindOf({ story: {} })).toBe('story');
    expect(mapRowKindOf({ letter: {} })).toBe('letter');
    expect(mapRowKindOf({})).toBe('voice');
  });
});
