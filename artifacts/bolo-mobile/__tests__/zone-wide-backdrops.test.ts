// THE WIDE ZONE PAINTINGS (build 29).
//
// A phone got six different zone paintings while an iPad got the SAME bazaar
// repeated behind all six, so the small screen told the richer story. These pin
// the per-zone set the owner is generating against docs/ipad-zone-backdrop-
// prompts.md.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  wideBackdrop,
  WIDE_BACKDROP,
  WIDE_BACKDROP_COUNT,
  WIDE_BACKDROP_ASPECT_H,
} from '@/lib/zoneBackdrops';

const ART = join(__dirname, '..', 'assets', 'journey');

describe('every zone has a wide painting', () => {
  test('there are six, one per fare zone', () => {
    expect(WIDE_BACKDROP_COUNT).toBe(6);
  });

  test('EVERY FILE EXISTS, because require resolves at bundle time', () => {
    // A missing file here is not a broken image, it is a build that does not
    // run at all. This is the assertion that catches a half-finished art drop.
    for (let n = 1; n <= 6; n++) {
      const f = join(ART, `zone-wide-${n}.jpg`);
      expect(existsSync(f)).toBe(true);
      expect(statSync(f).size).toBeGreaterThan(10_000);
    }
  });

  test('each zone resolves to something drawable', () => {
    for (let zi = 0; zi < 6; zi++) {
      expect(wideBackdrop(zi)).toBeTruthy();
    }
  });

  test('past the six it falls back to the shared tile, never to a hole', () => {
    // Journey 2 and anything beyond six zones must still have a backdrop. A
    // missing painting should look like the old app, not like a gap.
    expect(wideBackdrop(6)).toBe(WIDE_BACKDROP);
    expect(wideBackdrop(99)).toBe(WIDE_BACKDROP);
    expect(wideBackdrop(-1)).toBe(WIDE_BACKDROP);
  });

  test('the aspect the app stretches to is still 25:11', () => {
    // The journey draws these with resizeMode="stretch" at
    // windowW x windowW * WIDE_BACKDROP_ASPECT_H. New art at any other aspect
    // is distorted rather than cropped, which is why the brief pins 3200x1408.
    expect(WIDE_BACKDROP_ASPECT_H).toBeCloseTo(704 / 1600, 10);
    expect(704 / 1600).toBeCloseTo(11 / 25, 10);
  });
});
