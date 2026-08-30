/**
 * The run ahead stays a gauge apart everywhere (build 22, owner: "tracks are
 * not staying equidistant apart"). Pure geometry, no render.
 */
import { railPairPaths } from '@/lib/railOffset';

function points(d: string): Array<[number, number]> {
  return d
    .split(/[ML]\s/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.trim().split(' ').map(Number);
      return [x, y];
    });
}

describe('railPairPaths', () => {
  it('keeps the two rails exactly a gauge apart along a diagonal S-curve', () => {
    const gauge = 12.5;
    const { left, right } = railPairPaths(92, 0, 298, 176, gauge, 24);
    const l = points(left);
    const r = points(right);
    expect(l).toHaveLength(25);
    expect(r).toHaveLength(25);
    for (let i = 0; i < l.length; i++) {
      const gap = Math.hypot(r[i][0] - l[i][0], r[i][1] - l[i][1]);
      expect(gap).toBeCloseTo(gauge, 1);
    }
  });

  it('starts and ends half a gauge either side of the centre, where the tangent is vertical', () => {
    const { left, right } = railPairPaths(92, 0, 298, 176, 12.5, 8);
    const l = points(left);
    const r = points(right);
    expect(l[0]).toEqual([92 - 6.25, 0]);
    expect(r[0]).toEqual([92 + 6.25, 0]);
    expect(l[l.length - 1]).toEqual([298 - 6.25, 176]);
    expect(r[r.length - 1]).toEqual([298 + 6.25, 176]);
  });

  it('survives a zero-length segment without NaN', () => {
    const { left, right } = railPairPaths(50, 50, 50, 50, 10, 4);
    expect(left).not.toMatch(/NaN/);
    expect(right).not.toMatch(/NaN/);
  });
});
