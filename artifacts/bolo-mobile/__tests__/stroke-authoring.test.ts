// Tests for @workspace/script-trace/authoring.
//
// The package has no test runner of its own (no build step, it exports source),
// so its tests live in the consumer that already runs jest. Same arrangement as
// every other shared-logic test in here.
//
// What is worth asserting is narrow and specific: this module exists so that
// ORDER and DIRECTION survive the trip from a finger to a source file, because
// those are the two facts a font outline cannot carry and the only reason
// authored data is worth the effort. Shape is checked only to the extent that
// simplification must not destroy it.

import {
  cleanStroke,
  glyphPointCount,
  serializeAuthoredGlyph,
  serializeAuthoredGlyphs,
  simplifyTrace,
  smoothTrace,
  traceToAuthoredGlyph,
  parseTracePayload,
  mergeTracePayloads,
  resolveTracePayload,
  compareContributions,
  isTestContributor,
  alphabetForScript,
  SCRIPT_NAMES,
  SCRIPT_BY_LANGUAGE,
  PLAYABLE_GLYPH_FLOOR,
  type ScriptId,
  TracePayloadError,
  SIMPLIFY_EPSILON,
  SHAPE_TOLERANCE,
  scoreGlyph,
  type StrokePoint,
} from '@workspace/script-trace';

/**
 * A dense finger trace along a straight line, the way a real drag arrives.
 *
 * `wobble` is a slow hand tremor, a few cycles across the whole stroke, which
 * is what a hand actually does. `noise` is per-sample digitiser jitter, which
 * is what a touchscreen adds on top. They are separate arguments because the
 * module treats them differently: smoothing is meant to kill the second without
 * touching the first.
 */
function densLine(
  from: StrokePoint,
  to: StrokePoint,
  n = 120,
  wobble = 0,
  noise = 0,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Deterministic, so this is a fixture and not a flake.
    const w = wobble === 0 ? 0 : Math.sin(t * Math.PI * 3) * wobble;
    const j = noise === 0 ? 0 : (i % 2 === 0 ? noise : -noise);
    pts.push({
      x: from.x + (to.x - from.x) * t + w + j,
      y: from.y + (to.y - from.y) * t,
    });
  }
  return pts;
}

/** Shortest distance from a point to a polyline, the property RDP bounds. */
function distanceToPolyline(p: StrokePoint, line: StrokePoint[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

describe('simplifyTrace', () => {
  it('collapses a dense straight drag to its endpoints', () => {
    const out = simplifyTrace(densLine({ x: 10, y: 10 }, { x: 90, y: 10 }, 200));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ x: 10, y: 10 });
    expect(out[1]).toEqual({ x: 90, y: 10 });
  });

  it('keeps the corner in an L', () => {
    const l = [
      ...densLine({ x: 20, y: 20 }, { x: 20, y: 80 }, 80),
      ...densLine({ x: 20, y: 80 }, { x: 80, y: 80 }, 80),
    ];
    const out = simplifyTrace(l);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThan(10);
    // The corner survives.
    expect(out.some((p) => Math.abs(p.x - 20) < 2 && Math.abs(p.y - 80) < 2)).toBe(true);
  });

  it('keeps every original point within epsilon of the simplified line', () => {
    // This is RDP's actual guarantee, and the reason the epsilon can be read
    // against SHAPE_TOLERANCE to know simplification is invisible to scoring.
    const wobbly = densLine({ x: 5, y: 50 }, { x: 95, y: 50 }, 300, 3);
    const out = simplifyTrace(wobbly);
    expect(out.length).toBeLessThan(wobbly.length);
    for (const p of wobbly) {
      expect(distanceToPolyline(p, out)).toBeLessThanOrEqual(SIMPLIFY_EPSILON);
    }
  });

  it('stays well inside the scorer\'s tolerance', () => {
    // If simplification could move a stroke by more than SHAPE_TOLERANCE it
    // would be able to fail a trace of the very glyph it authored.
    expect(SIMPLIFY_EPSILON).toBeLessThan(SHAPE_TOLERANCE / 4);
  });

  it('does not blow the stack on a very long drag', () => {
    // The recursive form of RDP dies here. This is the reason the shipped one
    // is iterative, so it is worth a test rather than a comment.
    const huge = densLine({ x: 0, y: 0 }, { x: 100, y: 100 }, 60000, 2);
    expect(() => simplifyTrace(huge)).not.toThrow();
  });
});

describe('smoothTrace', () => {
  it('keeps each endpoint anchored without copying its noise through', () => {
    // Endpoints are smoothed one-sided rather than preserved raw. Preserving
    // them raw tilts the chord RDP measures against and defeats simplification
    // entirely, which is measured in the jitter test below.
    const raw = densLine({ x: 13, y: 27 }, { x: 81, y: 66 }, 50, 2, 1);
    const out = smoothTrace(raw);
    expect(out).toHaveLength(raw.length);
    expect(Math.hypot(out[0].x - raw[0].x, out[0].y - raw[0].y)).toBeLessThan(2);
    const n = raw.length - 1;
    expect(Math.hypot(out[n].x - raw[n].x, out[n].y - raw[n].y)).toBeLessThan(2);
  });

  it('does not reverse or reorder anything', () => {
    // Direction is which end comes first in the array. Smoothing must never
    // touch that, whatever it does to the coordinates.
    const raw = densLine({ x: 20, y: 90 }, { x: 20, y: 10 }, 40, 2, 1);
    const out = smoothTrace(raw);
    expect(out[0].y).toBeGreaterThan(out[out.length - 1].y);
  });

  it('removes per-sample digitiser noise from the interior', () => {
    // Interior only, on purpose. The ends are smoothed one-sided and weighted
    // two parts in three toward themselves, so they move far less than the
    // interior does; a metric spanning them measures mostly that anchoring
    // rather than the noise removal this test is about.
    const noisy = densLine({ x: 10, y: 50 }, { x: 90, y: 50 }, 100, 0, 1.2);
    const clean = densLine({ x: 10, y: 50 }, { x: 90, y: 50 }, 100, 0, 0);
    const interiorMax = (pts: StrokePoint[]) =>
      pts.slice(1, -1).reduce((m, p, i) => Math.max(m, Math.abs(p.x - clean[i + 1].x)), 0);

    expect(interiorMax(noisy)).toBeCloseTo(1.2, 5);
    expect(interiorMax(smoothTrace(noisy))).toBeLessThan(1.2 / 2);
  });

  it('rescues a drag whose jitter exceeds the simplifier\'s epsilon', () => {
    // The two together are the real contract. Below epsilon, RDP copes alone;
    // above it, RDP faithfully preserves every spike and a straight line comes
    // back as hundreds of points. 2.5 units is a shaky hand on a cheap screen,
    // and it is exactly the case smoothing exists for.
    //
    // A VERTICAL stroke, because densLine puts its noise on x: on a horizontal
    // line that noise runs along the direction of travel and produces no
    // perpendicular deviation at all, so RDP rightly sees a straight line and
    // there is nothing for smoothing to rescue.
    const noisy = densLine({ x: 50, y: 10 }, { x: 50, y: 90 }, 200, 0, 2.5);
    const withoutSmoothing = simplifyTrace(noisy).length;
    const withSmoothing = cleanStroke(noisy)!.length;
    expect(withoutSmoothing).toBeGreaterThan(50);
    expect(withSmoothing).toBeLessThan(6);
  });
});

describe('cleanStroke', () => {
  it('rejects a tap', () => {
    expect(cleanStroke([{ x: 40, y: 40 }])).toBeNull();
  });

  it('rejects a graze that rounds down to one point', () => {
    expect(cleanStroke([{ x: 40.1, y: 40.1 }, { x: 40.2, y: 40.2 }])).toBeNull();
  });

  it('clamps a finger that left the canvas', () => {
    const out = cleanStroke(densLine({ x: -12, y: 50 }, { x: 118, y: 50 }, 40));
    expect(out).not.toBeNull();
    for (const p of out!) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
    }
  });

  it('emits whole numbers only', () => {
    const out = cleanStroke(densLine({ x: 12.4, y: 33.7 }, { x: 71.9, y: 64.2 }, 90));
    expect(out).not.toBeNull();
    for (const p of out!) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });
});

describe('traceToAuthoredGlyph', () => {
  const identity = { id: 'deva-test', char: 'क', label: 'ka' };

  it('preserves stroke ORDER, which is the whole point', () => {
    const first = densLine({ x: 20, y: 20 }, { x: 20, y: 80 });
    const second = densLine({ x: 60, y: 20 }, { x: 60, y: 80 });
    const third = densLine({ x: 12, y: 22 }, { x: 88, y: 22 }); // shirorekha, last
    const glyph = traceToAuthoredGlyph(identity, [first, second, third]);

    expect(glyph.strokes).toHaveLength(3);
    expect(glyph.strokes[0][0].x).toBe(20);
    expect(glyph.strokes[1][0].x).toBe(60);
    // The head-line is last, which is the rule the shipped outline game cannot
    // check and the reason this data is worth authoring at all.
    const last = glyph.strokes[2];
    expect(last[0].y).toBe(22);
    expect(last[last.length - 1].x).toBe(88);
  });

  it('preserves stroke DIRECTION', () => {
    const downward = densLine({ x: 50, y: 10 }, { x: 50, y: 90 });
    const glyph = traceToAuthoredGlyph(identity, [downward]);
    const s = glyph.strokes[0];
    expect(s[0].y).toBeLessThan(s[s.length - 1].y);

    const upward = densLine({ x: 50, y: 90 }, { x: 50, y: 10 });
    const other = traceToAuthoredGlyph(identity, [upward]);
    const t = other.strokes[0];
    expect(t[0].y).toBeGreaterThan(t[t.length - 1].y);
  });

  it('drops taps without shifting the order of the strokes around them', () => {
    const a = densLine({ x: 10, y: 10 }, { x: 10, y: 60 });
    const tap = [{ x: 44, y: 44 }];
    const b = densLine({ x: 80, y: 10 }, { x: 80, y: 60 });
    const glyph = traceToAuthoredGlyph(identity, [a, tap, b]);
    expect(glyph.strokes).toHaveLength(2);
    expect(glyph.strokes[0][0].x).toBe(10);
    expect(glyph.strokes[1][0].x).toBe(80);
  });

  it('produces a glyph small enough to read in a diff', () => {
    const strokes = [
      densLine({ x: 20, y: 30 }, { x: 20, y: 70 }, 200, 1, 0.4),
      densLine({ x: 74, y: 26 }, { x: 74, y: 78 }, 200, 1, 0.4),
      densLine({ x: 12, y: 22 }, { x: 88, y: 22 }, 200, 1, 0.4),
    ];
    const glyph = traceToAuthoredGlyph(identity, strokes);
    // Three strokes of ~200 raw points each must not land as 600 points.
    expect(glyphPointCount(glyph)).toBeLessThan(40);
  });

  it('round-trips through the scorer as a passing trace of itself', () => {
    // The real contract: what this module emits must be something scoreGlyph
    // accepts. If authoring and scoring ever disagree about the shape of the
    // data, every authored glyph is silently unusable.
    const strokes = [
      densLine({ x: 20, y: 30 }, { x: 20, y: 70 }, 150),
      densLine({ x: 74, y: 26 }, { x: 74, y: 78 }, 150),
      densLine({ x: 12, y: 22 }, { x: 88, y: 22 }, 150),
    ];
    const glyph = traceToAuthoredGlyph(identity, strokes);
    const perfect = glyph.strokes.map((s) => s.map((p) => ({ ...p })));
    const result = scoreGlyph(perfect, glyph);
    expect(result.faults).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(100 - SHAPE_TOLERANCE);
  });
});

describe('serializeAuthoredGlyph', () => {
  const glyph = traceToAuthoredGlyph(
    { id: 'deva-na', char: 'न', label: 'na' },
    [
      densLine({ x: 20, y: 30 }, { x: 20, y: 70 }, 40),
      densLine({ x: 12, y: 22 }, { x: 88, y: 22 }, 40),
    ],
  );

  it('emits the character where a reviewer will see it', () => {
    const src = serializeAuthoredGlyph(glyph);
    expect(src).toContain('char: "न"');
    expect(src).toContain('label: "na"');
    expect(src).toContain('id: "deva-na"');
  });

  it('numbers the strokes so writing order is legible in review', () => {
    const src = serializeAuthoredGlyph(glyph);
    expect(src).toContain('// 1');
    expect(src).toContain('// 2');
  });

  it('wraps a whole set in a pasteable const', () => {
    const src = serializeAuthoredGlyphs([glyph], 'DEVANAGARI_GLYPHS');
    expect(src).toContain('export const DEVANAGARI_GLYPHS: AuthoredGlyph[] = [');
    expect(src.trimEnd().endsWith('];')).toBe(true);
  });
});

describe('the wire format contributors paste back', () => {
  // The writer lives in the shared web page and the reader lives here. They are
  // tested against each other because a tool that collects data nobody can read
  // back in is not a tool.
  function encodeLikeThePage(
    script: string,
    glyphs: { id: string; strokes: StrokePoint[][] }[],
    who = 'Ba',
  ) {
    return (
      'bolo1|' +
      script.replace(/ /g, '_') +
      '|' +
      who +
      '|' +
      glyphs
        .map(
          (g) =>
            g.id +
            ':' +
            g.strokes.map((s) => s.map((p) => `${p.x},${p.y}`).join(';')).join('~'),
        )
        .join('|')
    );
  }

  const sample = [
    { id: 'gu_a', strokes: [[{ x: 20, y: 30 }, { x: 20, y: 70 }], [{ x: 60, y: 20 }, { x: 60, y: 80 }]] },
    { id: 'gu_aa', strokes: [[{ x: 12, y: 22 }, { x: 88, y: 22 }]] },
  ];

  it('round-trips a payload the page would produce', () => {
    const parsed = parseTracePayload(encodeLikeThePage('Gujarati', sample));
    expect(parsed.script).toBe('Gujarati');
    expect(parsed.contributor).toBe('Ba');
    expect(parsed.glyphs).toHaveLength(2);
    expect(parsed.glyphs[0].id).toBe('gu_a');
    expect(parsed.glyphs[0].strokes).toEqual(sample[0].strokes);
    expect(parsed.glyphs[1].strokes).toEqual(sample[1].strokes);
  });

  it('restores a script name that had a space in it', () => {
    expect(parseTracePayload(encodeLikeThePage('Meitei Mayek', sample)).script).toBe('Meitei Mayek');
  });

  it('survives the newlines a message app inserts', () => {
    const raw = encodeLikeThePage('Gujarati', sample);
    const wrapped = raw.slice(0, 20) + '\n ' + raw.slice(20, 40) + '\r\n' + raw.slice(40);
    expect(parseTracePayload(wrapped).glyphs).toHaveLength(2);
  });

  it('refuses anything that is not a payload rather than guessing', () => {
    expect(() => parseTracePayload('')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('hello can you help')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('bolo1|Gujarati')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('bolo1|Gujarati|Ba')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('bolo1|Gujarati|Ba|noColonHere')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('bolo1|Gujarati|Ba|gu_a:5,5')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('bolo1|Gujarati|Ba|gu_a:5,5;900,4')).toThrow(TracePayloadError);
    expect(() => parseTracePayload('bolo1|Gujarati|Ba|gu_a:5,5;x,4')).toThrow(TracePayloadError);
  });

  it('reports unknown ids instead of silently dropping them', () => {
    const parsed = parseTracePayload(
      encodeLikeThePage('Gujarati', [...sample, { id: 'gu_from_an_old_page', strokes: sample[1].strokes }]),
    );
    const known: Record<string, { id: string; char: string; label: string }> = {
      gu_a: { id: 'gu_a', char: 'અ', label: 'a' },
      gu_aa: { id: 'gu_aa', char: 'આ', label: 'aa' },
    };
    const { glyphs, unknownIds } = resolveTracePayload(parsed, (id) => known[id]);
    expect(glyphs).toHaveLength(2);
    expect(glyphs[0].char).toBe('અ');
    expect(unknownIds).toEqual(['gu_from_an_old_page']);
  });

  it('produces glyphs the serializer and the scorer both accept', () => {
    const parsed = parseTracePayload(encodeLikeThePage('Gujarati', sample));
    const { glyphs } = resolveTracePayload(parsed, (id) => ({ id, char: 'અ', label: 'a' }));
    expect(serializeAuthoredGlyphs(glyphs, 'GUJARATI_GLYPHS')).toContain('export const GUJARATI_GLYPHS');
    const g = glyphs[0];
    const result = scoreGlyph(g.strokes.map((s) => s.map((p) => ({ ...p }))), g);
    expect(result.faults).toEqual([]);
  });
});

describe('comparing several people who traced the same alphabet', () => {
  // The reason to ask more than one relative. Stroke order carries real
  // variation AND plain misremembering, and one contributor cannot separate
  // them. These are the two facts the comparison has to surface.
  function payload(who: string, glyphs: Record<string, number>) {
    return parseTracePayload(
      'bolo1|Gujarati|' +
        who +
        '|' +
        Object.entries(glyphs)
          .map(
            ([id, strokeCount]) =>
              id +
              ':' +
              Array.from({ length: strokeCount }, (_, i) => `${10 + i},20;${10 + i},80`).join('~'),
          )
          .join('|'),
    );
  }

  it('marks a letter everyone drew the same way as settled', () => {
    const out = compareContributions([
      payload('Ba', { gu_a: 2 }),
      payload('Kaka', { gu_a: 2 }),
      payload('Masi', { gu_a: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].agreed).toBe(true);
    expect(out[0].contributors).toBe(3);
    expect(out[0].byStrokeCount[0]).toEqual({ strokeCount: 2, contributors: ['Ba', 'Kaka', 'Masi'] });
  });

  it('names who disagreed, so the odd one out can be asked', () => {
    const out = compareContributions([
      payload('Ba', { gu_a: 2 }),
      payload('Kaka', { gu_a: 2 }),
      payload('Masi', { gu_a: 3 }),
    ]);
    expect(out[0].agreed).toBe(false);
    // Majority first.
    expect(out[0].byStrokeCount[0]).toEqual({ strokeCount: 2, contributors: ['Ba', 'Kaka'] });
    expect(out[0].byStrokeCount[1]).toEqual({ strokeCount: 3, contributors: ['Masi'] });
  });

  it('puts disagreements first, because those are the ones to look at', () => {
    const out = compareContributions([
      payload('Ba', { gu_a: 2, gu_aa: 1, gu_i: 2 }),
      payload('Kaka', { gu_a: 2, gu_aa: 3, gu_i: 2 }),
    ]);
    expect(out[0].id).toBe('gu_aa');
    expect(out[0].agreed).toBe(false);
    expect(out.slice(1).every((g) => g.agreed)).toBe(true);
  });

  it('counts a letter only one person traced without calling it agreement worth trusting', () => {
    const out = compareContributions([payload('Ba', { gu_a: 2 })]);
    expect(out[0].agreed).toBe(true);
    // One voice. The count is what tells you not to lean on it.
    expect(out[0].contributors).toBe(1);
  });
});

describe('alphabetForScript', () => {
  // A REGRESSION TEST, not a nicety. SCRIPT_NAMES spells it "Meetei Mayek" and
  // the generated chapters.ts spells it "Meitei Mayek", so any join on the
  // display name reports an empty alphabet for Manipuri instead of failing.
  // Joining on LANG_CHAPTER_IDS is what makes this correct.
  it('finds letters for every script, including the one whose name is spelled two ways', () => {
    const scripts = Object.keys(SCRIPT_NAMES) as ScriptId[];
    const empty = scripts.filter((s) => alphabetForScript(s).length === 0);
    expect(empty).toEqual([]);
  });

  it('finds Meetei Mayek specifically', () => {
    expect(alphabetForScript('meitei').length).toBeGreaterThan(0);
  });

  it('clears the playable floor for every script', () => {
    for (const s of Object.keys(SCRIPT_NAMES) as ScriptId[]) {
      expect(alphabetForScript(s).length).toBeGreaterThanOrEqual(PLAYABLE_GLYPH_FLOOR);
    }
  });

  it('gives the eight Devanagari languages the same one alphabet', () => {
    const deva = alphabetForScript('devanagari');
    expect(deva.length).toBeGreaterThan(0);
    // One authored set, eight languages. This is the arithmetic the roadmap
    // rests on, so it is worth pinning.
    const langs = Object.entries(SCRIPT_BY_LANGUAGE).filter(([, s]) => s === 'devanagari');
    expect(langs).toHaveLength(8);
  });

  it('returns each character once even though chapters overlap', () => {
    const ids = alphabetForScript('devanagari').map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a practice run must not become teaching data', () => {
  // The first person to open the page is whoever built it, and they may not
  // write the script at all. Marking that in the DATA rather than remembering
  // it out of band is the only version that survives a handover.
  const glyphs = 'gu_a:20,30;20,70~60,20;60,80';

  it('reads the ! prefix as practice and strips it from the name', () => {
    const p = parseTracePayload(`bolo1|Gujarati|!Aakesh|${glyphs}`);
    expect(p.isPractice).toBe(true);
    expect(p.contributor).toBe('Aakesh');
  });

  it('treats an unmarked payload as real', () => {
    const p = parseTracePayload(`bolo1|Gujarati|Ba|${glyphs}`);
    expect(p.isPractice).toBe(false);
    expect(p.contributor).toBe('Ba');
  });

  it('handles a practice run from someone who gave no name', () => {
    const p = parseTracePayload(`bolo1|Gujarati|!|${glyphs}`);
    expect(p.isPractice).toBe(true);
    expect(p.contributor).toBe('-');
  });

  it('drops practice runs from the comparison BY DEFAULT', () => {
    const real = parseTracePayload(`bolo1|Gujarati|Ba|${glyphs}`);
    const practice = parseTracePayload(`bolo1|Gujarati|!Aakesh|gu_a:20,30;20,70`);
    const out = compareContributions([real, practice]);
    expect(out).toHaveLength(1);
    expect(out[0].contributors).toBe(1);
    expect(out[0].byStrokeCount[0].contributors).toEqual(['Ba']);
    // Forgetting the option must fail SAFE, so the default is exclusion.
    expect(out[0].agreed).toBe(true);
  });

  it('can include them when someone explicitly asks', () => {
    const real = parseTracePayload(`bolo1|Gujarati|Ba|${glyphs}`);
    const practice = parseTracePayload(`bolo1|Gujarati|!Aakesh|gu_a:20,30;20,70`);
    const out = compareContributions([real, practice], { includePractice: true });
    expect(out[0].contributors).toBe(2);
  });

  it('returns nothing at all when every payload is practice', () => {
    const practice = parseTracePayload(`bolo1|Gujarati|!Aakesh|${glyphs}`);
    expect(compareContributions([practice])).toEqual([]);
  });
});

describe("the team's own testing never becomes teaching data", () => {
  // There is no "this is a test" checkbox on the page any more, on purpose: it
  // sat by the name field and a real contributor would tick it. This is what
  // replaced it, and it is code rather than a note because a note survives only
  // as long as the person who read it.
  const g = 'gu_a:20,30;20,70~60,20;60,80';
  const p = (who: string) => parseTracePayload(`bolo1|Gujarati|${who}|${g}`);

  it('recognises the developer testing under any spelling', () => {
    for (const n of ['Test Aakesh', 'test aakesh', 'TEST AAKESH', 'testing123', 'Test', 'Aakesh']) {
      expect(isTestContributor(n)).toBe(true);
    }
  });

  it('recognises the probes used to check the live endpoint', () => {
    expect(isTestContributor('PROBE_CLAUDE')).toBe(true);
    expect(isTestContributor('smoke')).toBe(true);
    // The practice marker is stripped before matching.
    expect(isTestContributor('!Test Aakesh')).toBe(true);
  });

  it('leaves real contributors alone', () => {
    for (const n of ['Ba', 'Kaka', 'Masi', 'Protima', 'Testa']) {
      // "Testa" is the interesting one: a real name that merely starts with the
      // same four letters. It is knowingly caught by the prefix rule, and that
      // is the trade: losing one real contributor named Testa is recoverable,
      // teaching a child from a developer's scribble is not.
      if (n === 'Testa') { expect(isTestContributor(n)).toBe(true); continue; }
      expect(isTestContributor(n)).toBe(false);
    }
  });

  it('drops test contributors from the comparison by default', () => {
    const out = compareContributions([p('Ba'), p('Test Aakesh'), p('PROBE_CLAUDE')]);
    expect(out).toHaveLength(1);
    expect(out[0].contributors).toBe(1);
    expect(out[0].byStrokeCount[0].contributors).toEqual(['Ba']);
  });

  it('returns nothing when every payload is the team testing', () => {
    expect(compareContributions([p('Test Aakesh'), p('Aakesh')])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Merging a returning contributor's work. The page cannot read a submission
// back, so a second visit starts blank with the same session id; without a
// merge, coming back to add two letters replaces forty-five with two.
// ---------------------------------------------------------------------------

describe("mergeTracePayloads", () => {
  const P = (...glyphs: string[]) => ["bolo1", "Gujarati", "Bharti", ...glyphs].join("|");

  test("keeps letters the new submission does not mention", () => {
    // The bug this exists for, in one assertion.
    const merged = mergeTracePayloads(P("gu_a:1,1;2,2", "gu_aa:3,3;4,4"), P("gu_ksha:9,9;8,8"));
    expect(merged).toBe(P("gu_a:1,1;2,2", "gu_aa:3,3;4,4", "gu_ksha:9,9;8,8"));
  });

  test("a retraced letter is replaced, not duplicated", () => {
    const merged = mergeTracePayloads(P("gu_a:1,1;2,2", "gu_aa:3,3;4,4"), P("gu_a:7,7;6,6"));
    expect(merged).toBe(P("gu_a:7,7;6,6", "gu_aa:3,3;4,4"));
    expect(parseTracePayload(merged).glyphs).toHaveLength(2);
  });

  test("existing order holds and new letters append", () => {
    const merged = mergeTracePayloads(P("gu_a:1,1;2,2", "gu_aa:2,2;3,3"), P("gu_ka:5,5;6,6", "gu_aa:9,9;8,8"));
    expect(parseTracePayload(merged).glyphs.map((g) => g.id)).toEqual([
      "gu_a",
      "gu_aa",
      "gu_ka",
    ]);
  });

  test("the newer header wins, so a corrected name sticks", () => {
    const merged = mergeTracePayloads(
      ["bolo1", "Gujarati", "Bharti", "gu_a:1,1;2,2"].join("|"),
      ["bolo1", "Gujarati", "Bharti_P", "gu_aa:2,2;3,3"].join("|"),
    );
    expect(parseTracePayload(merged).contributor).toBe("Bharti_P");
  });

  test("a different script REPLACES rather than merging", () => {
    // Merging Gujarati into Gurmukhi would produce a set belonging to neither.
    const gu = ["bolo1", "Gujarati", "B", "gu_a:1,1;2,2"].join("|");
    const pa = ["bolo1", "Gurmukhi", "B", "pa_a:2,2;3,3"].join("|");
    expect(mergeTracePayloads(gu, pa)).toBe(pa);
  });

  test("coordinates are never re-encoded, so a merge cannot drift them", () => {
    const existing = P("gu_a:12,30;20,58~74,26;74,78");
    const merged = mergeTracePayloads(existing, P("gu_aa:1,1;2,2"));
    expect(merged).toContain("gu_a:12,30;20,58~74,26;74,78");
  });

  test("the merged result is still readable by the parser", () => {
    const merged = mergeTracePayloads(P("gu_a:1,1;2,2"), P("gu_aa:2,2;3,3"));
    expect(() => parseTracePayload(merged)).not.toThrow();
    expect(parseTracePayload(merged).script).toBe("Gujarati");
  });
});
