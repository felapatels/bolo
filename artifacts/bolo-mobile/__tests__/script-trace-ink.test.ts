// PENCIL INK (build 29). Pressure changes how writing LOOKS, never how it is
// scored: the owner's ruling, "for now keep it identical".
//
// The property worth protecting is the phone one. An iPad affordance must cost
// a phone nothing, so with no pressure anywhere the banding has to collapse to
// the single constant-width path the game has always drawn.
import { inkWidthFor, inkBands, canvasSizeFor } from '../app/(app)/(tabs)/games/script-trace';

const line = (n: number, p?: number) =>
  Array.from({ length: n }, (_, i) => ({ x: i * 5, y: i * 5, ...(p === undefined ? {} : { p }) }));

describe('ink width from pen pressure', () => {
  test('NO pressure is the width a finger has always drawn', () => {
    expect(inkWidthFor(undefined)).toBe(5);
  });

  test('a light touch is thinner than a hard press', () => {
    expect(inkWidthFor(0.05)).toBeLessThan(inkWidthFor(0.95));
  });

  test('out-of-range pressure is clamped rather than trusted', () => {
    expect(inkWidthFor(-3)).toBe(inkWidthFor(0));
    expect(inkWidthFor(99)).toBe(inkWidthFor(1));
    expect(inkWidthFor(Number.NaN)).toBe(5);
  });

  test('widths are quantised, so a stroke cannot emit a path per point', () => {
    const widths = new Set(
      Array.from({ length: 200 }, (_, i) => inkWidthFor(i / 199)),
    );
    expect(widths.size).toBeLessThanOrEqual(5);
  });
});

describe('THE PHONE PROPERTY: no pressure means no change', () => {
  test('a pressureless stroke collapses to ONE band at the old width', () => {
    const bands = inkBands([line(20)], 300);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.width).toBe(5);
  });

  test('several pressureless strokes stay one band each, never split', () => {
    const bands = inkBands([line(10), line(10), line(10)], 300);
    expect(bands).toHaveLength(3);
    expect(bands.every((b) => b.width === 5)).toBe(true);
  });

  test('a stroke too short to draw contributes nothing', () => {
    expect(inkBands([[{ x: 1, y: 1 }]], 300)).toHaveLength(0);
  });
});

describe('a Pencil stroke bands by pressure', () => {
  test('constant pressure is still a single band', () => {
    const bands = inkBands([line(20, 0.8)], 300);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.width).toBe(inkWidthFor(0.8));
  });

  test('pressure that changes splits the stroke into bands', () => {
    const stroke = [
      ...line(6, 0.05),
      ...line(6, 0.95).map((pt) => ({ ...pt, x: pt.x + 40 })),
    ];
    const bands = inkBands([stroke], 300);
    expect(bands.length).toBeGreaterThan(1);
    expect(Math.max(...bands.map((b) => b.width))).toBeGreaterThan(
      Math.min(...bands.map((b) => b.width)),
    );
  });

  test('bands MEET rather than leaving a gap in the line', () => {
    // Each band after the first must start where the previous one ended, or
    // the ink shows a visible break every time the learner presses harder.
    const stroke = [...line(4, 0.1), ...line(4, 0.9).map((pt) => ({ ...pt, x: pt.x + 30 }))];
    const bands = inkBands([stroke], 100);
    const endOf = (d: string) => d.trim().split(/\s+(?=[ML])/).pop()!.replace(/^[ML]\s*/, '');
    const startOf = (d: string) => d.trim().split(/\s+(?=[ML])/)[0]!.replace(/^M\s*/, '');
    for (let i = 1; i < bands.length; i++) {
      expect(startOf(bands[i]!.d)).toBe(endOf(bands[i - 1]!.d));
    }
  });
});

// ---------------------------------------------------------------------------
// THE WRITING SURFACE (build 29). The iPad half of the Pencil work: a Pencil is
// wasted on a 300pt square, which is what a 13-inch iPad used to get.
// ---------------------------------------------------------------------------
describe('canvas size', () => {
  test('EVERY PHONE IS UNCHANGED, which is the whole safety property', () => {
    // The old expression was Math.min(width - 48, 300). These must match it
    // exactly, or an iPad affordance has quietly resized every phone.
    const phones: [number, number][] = [
      [320, 568], // the smallest screen still supported
      [375, 667],
      [390, 844], // the reference device in CLAUDE.md
      [402, 874], // iPhone 17 Pro
      [430, 932], // Pro Max
    ];
    for (const [w, h] of phones) {
      expect(canvasSizeFor(w, h)).toBe(Math.min(w - 48, 300));
    }
  });

  test('an iPad gets a surface worth writing on', () => {
    // iPad mini, 11 inch, 13 inch, all portrait.
    for (const [w, h] of [[744, 1133], [834, 1194], [1032, 1366]] as [number, number][]) {
      const size = canvasSizeFor(w, h);
      expect(size).toBeGreaterThan(300);
      expect(size).toBeLessThanOrEqual(560);
    }
  });

  test('it never outgrows the 600pt content column', () => {
    for (const w of [700, 1032, 1366, 2000]) {
      expect(canvasSizeFor(w, 1400)).toBeLessThanOrEqual(560);
    }
  });

  test('landscape is bounded by HEIGHT, so the letter cannot push the buttons off', () => {
    // 13-inch landscape: half of 1032 is the binding constraint, not the width.
    expect(canvasSizeFor(1366, 1032)).toBe(516);
    // And a short window shrinks it further rather than overflowing.
    expect(canvasSizeFor(1366, 700)).toBe(350);
  });

  test('the boundary at the column width does not jump', () => {
    // Just inside the column is a phone; just outside is a tablet. The step
    // between them should be an increase, never a shrink.
    expect(canvasSizeFor(601, 1200)).toBeGreaterThanOrEqual(canvasSizeFor(600, 1200));
  });
});
