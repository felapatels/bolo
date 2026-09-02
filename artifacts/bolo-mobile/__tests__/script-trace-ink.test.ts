// PENCIL INK (build 29). Pressure changes how writing LOOKS, never how it is
// scored: the owner's ruling, "for now keep it identical".
//
// The property worth protecting is the phone one. An iPad affordance must cost
// a phone nothing, so with no pressure anywhere the banding has to collapse to
// the single constant-width path the game has always drawn.
import { inkWidthFor, inkBands } from '../app/(app)/(tabs)/games/script-trace';

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
