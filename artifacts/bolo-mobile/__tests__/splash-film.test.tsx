import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrandSplash, __resetBrandSplashForTests } from '@/components/BrandSplash';
import { SPLASH_WAVE, SPLASH_WAVE_FPS, SPLASH_MOTION_ENABLED } from '@/lib/splashFilm';

// jest-setup.js mocks reanimated globally with useReducedMotion: () => false.
// This file flips it per test, so the mutable flag lives INSIDE the factory:
// jest.mock is hoisted above every const here. Same idiom as
// bazaar-welcome.test.tsx.
jest.mock('react-native-reanimated', () => {
  const motion = { reduce: false };
  return { __esModule: true, __motion: motion, useReducedMotion: () => motion.reduce };
});

jest.mock('@/lib/splashReady', () => ({ __esModule: true, useHomeReady: () => false }));

const { __motion } = jest.requireMock('react-native-reanimated') as {
  __motion: { reduce: boolean };
};

// ---------------------------------------------------------------------------
// The splash had NO tests, which is how two different renderers reached the
// ROOT layout and killed the app before anyone could see why. These do not try
// to prove the splash looks right, which no test can. They pin the census: what
// is allowed to render on the launch path, and what is not.
//
// The history, because it is the reason every rule below exists. Three builds,
// same app, one import apart:
//   d429f289  react-native Image, still poster   5 launches, 0 crashes
//   c56157f0  expo-image, animated WebP          5 launches, 5 crashes
//   0f349d37  expo-image, same still poster      5 launches, 5 crashes
// The film was never the variable. The Image component was.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const APP_SOURCES = ['app', 'components', 'lib'].flatMap((d) => sourceFiles(join(ROOT, d)));

/** Files whose CODE matches, ignoring comments, which discuss both bans at length. */
function importers(pattern: RegExp): string[] {
  return APP_SOURCES.filter((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && pattern.test(line)),
  ).map((f) => f.replace(ROOT, ''));
}

describe('THE LAUNCH PATH RENDERS NO VIDEO AND NO expo-image', () => {
  // Both bans are empirical, not stylistic, and both were paid for on device.
  // A third renderer would arrive the same quiet way the first two did:
  // bundled, unmentioned, and visible only as a crash on a real phone.

  it('nothing requires an .mp4 or .mov', () => {
    expect(importers(/require\([^)]*\.(mp4|mov)['"]\)/)).toEqual([]);
  });

  it('nothing imports expo-video', () => {
    expect(importers(/from ['"]expo-video['"]/)).toEqual([]);
  });

  it('NOTHING IMPORTS expo-image, which is the one that crashed 5 of 5', () => {
    // expo-image-picker is a different package and is allowed; the boundary is
    // an exact module specifier, not a prefix.
    expect(importers(/from ['"]expo-image['"]/)).toEqual([]);
  });

  it('and neither is a dependency that autolinks a decoder we do not use', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }['expo-video']).toBeUndefined();
  });
});

describe('the WebP survives on disk but reaches no bundle', () => {
  it('the encoded film is still there for whoever finds a renderer', () => {
    // Kept deliberately: the encode was the fiddly part of that attempt and the
    // asset itself was never at fault. lib/splashFilm.ts carries the recipe.
    expect(existsSync(join(ROOT, 'assets/splash/welcome-bolo.webp'))).toBe(true);
  });

  it('but nothing requires it, so Metro does not ship it', () => {
    // A module-scope require bundles an asset whether or not anything reads it.
    // That is how 4MB of unplayable mp4 rode along in every install for a day.
    expect(importers(/require\([^)]*welcome-bolo\.webp['"]\)/)).toEqual([]);
  });
});

describe('THE GREETING WAVE, and what it falls back to', () => {
  // These follow SPLASH_MOTION_ENABLED rather than hard-coding it, deliberately.
  // The switch has been flipped twice in one evening and each flip rewrote the
  // assertions, which is churn that teaches nothing. What is worth pinning is
  // the RELATIONSHIP: the switch and Reduce Motion each decide which source is
  // handed over, and the fallback is never a decoded animation with a still
  // laid over it. The switch's actual value is pinned once, at source level, in
  // the block below, where a change to it is a deliberate edit with a reason.
  //
  // includeHiddenElements is REQUIRED and is not a workaround. The overlay sets
  // accessibilityElementsHidden and importantForAccessibility="no-hide-
  // descendants" on purpose, because a splash must never be announced to a
  // screen reader, and RNTL's queries skip hidden subtrees by default. Without
  // it every query below returns null and the suite passes vacuously.
  const q = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });
  const MOVING = SPLASH_MOTION_ENABLED ? 'splash-wave' : 'splash-still';

  beforeEach(() => {
    __resetBrandSplashForTests();
    __motion.reduce = false;
  });

  it(`renders ${SPLASH_MOTION_ENABLED ? 'the wave' : 'the poster'} when motion is allowed`, () => {
    render(<BrandSplash />);
    expect(q(MOVING)).not.toBeNull();
  });

  it('REDUCE MOTION GETS THE POSTER, and no wave frame is referenced at all', () => {
    __motion.reduce = true;
    render(<BrandSplash />);
    expect(q('splash-still')).not.toBeNull();
    expect(q('splash-wave')).toBeNull();
  });

  it('covers the screen, so nothing is corner-cropped', () => {
    // A bare absoluteFill Image lays out at its intrinsic size on iOS, which is
    // why the style carries explicit 100% and why resizeMode is asserted here.
    render(<BrandSplash />);
    expect(q(MOVING)?.props.resizeMode).toBe('cover');
  });

  (SPLASH_MOTION_ENABLED ? describe : describe.skip)('while the wave is on', () => {
    it('starts on the first frame, so the opening pose is never mid-wave', () => {
      render(<BrandSplash />);
      expect(q('splash-wave')?.props.source).toBe(SPLASH_WAVE[0]);
    });

    it('ping-pongs rather than snapping back to the start', () => {
      render(<BrandSplash />);
      const seen: number[] = [];
      for (let i = 0; i < SPLASH_WAVE.length + 4; i++) {
        act(() => { jest.advanceTimersByTime(Math.round(1000 / SPLASH_WAVE_FPS)); });
        seen.push(SPLASH_WAVE.indexOf(q('splash-wave')!.props.source));
      }
      expect(Math.max(...seen)).toBe(SPLASH_WAVE.length - 1);
      const peak = seen.indexOf(SPLASH_WAVE.length - 1);
      expect(seen[peak + 1]).toBe(SPLASH_WAVE.length - 2);
    });
  });
});

describe('THE SWITCH IS OFF, and that is a finding rather than a default', () => {
  const src = readFileSync(join(ROOT, 'lib/splashFilm.ts'), 'utf8');

  // INVERTED. This pinned `true` for one build. That build swapped twelve
  // frames a second through the SAME Image component the poster build had just
  // survived ten launches on, added no library at all, and crashed nine times
  // out of ten. Churn on the launch path is what the underlying Hermes bug
  // reacts to, so the switch is off until that bug is fixed rather than until
  // someone finds a fourth renderer.
  it('SPLASH_MOTION_ENABLED is false', () => {
    expect(src).toMatch(/export const SPLASH_MOTION_ENABLED = false;/);
  });

  it('and the wave frames survive on disk for the day it can be turned back on', () => {
    expect(SPLASH_WAVE).toHaveLength(12);
  });
});
