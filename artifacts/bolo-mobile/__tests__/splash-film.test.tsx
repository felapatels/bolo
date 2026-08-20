import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrandSplash, __resetBrandSplashForTests } from '@/components/BrandSplash';
import {
  SPLASH_SHORT_START_S,
  SPLASH_MIN_HOLD_MS,
  SPLASH_FULL_PLAY_MS,
} from '@/lib/splashFilm';

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

describe('THE LAUNCH PATH BANS expo-image, AND ONLY expo-image', () => {
  // Both bans are empirical, not stylistic, and both were paid for on device.
  // A third renderer would arrive the same quiet way the first two did:
  // bundled, unmentioned, and visible only as a crash on a real phone.

  // INVERTED 2026-08-20. These banned expo-video and every .mp4 require. That
  // ban was NEVER EARNED: expo-video was the first thing removed on 2026-08-19
  // and the crash carried on without it, so it was suspicion standing in for
  // evidence. The real cause was react-native-worklets 0.5.1, which crashed
  // this app thirty launches out of thirty. The film is back, and the
  // assertions now pin exactly where it is allowed to live.
  // Two films now, and the census names both rather than counting them: the
  // splash's, at the ROOT layout, and the bazaar greeting's, which is not on
  // the launch path at all. A THIRD require appearing here should fail this
  // test and make somebody explain it, which is the whole point of a census.
  it('films are required in exactly two known places', () => {
    expect(importers(/require\([^)]*\.(mp4|mov)['"]\)/).sort()).toEqual([
      '/components/BazaarWelcome.tsx',
      '/lib/splashFilm.ts',
    ]);
  });

  it('and expo-video is imported by exactly those two components', () => {
    expect(importers(/from ['"]expo-video['"]/).sort()).toEqual([
      '/components/BazaarWelcome.tsx',
      '/components/BrandSplash.tsx',
    ]);
  });

  it('NOTHING IMPORTS expo-image, which is the one that crashed 5 of 5', () => {
    // expo-image-picker is a different package and is allowed; the boundary is
    // an exact module specifier, not a prefix.
    expect(importers(/from ['"]expo-image['"]/)).toEqual([]);
  });

  it('expo-image is still banned, and that one WAS earned', () => {
    // 5 crashes in 5, twice, including a build where it rendered nothing but a
    // still. That result stands on its own evidence, unlike expo-video's did.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(importers(/from ['"]expo-image['"]/)).toEqual([]);
    expect(pkg.dependencies['expo-video']).toBe('~3.0.16');
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

describe('THE FILM, and what it falls back to', () => {
  // includeHiddenElements is REQUIRED and is not a workaround. The overlay sets
  // accessibilityElementsHidden and importantForAccessibility="no-hide-
  // descendants" on purpose, because a splash must never be announced to a
  // screen reader, and RNTL's queries skip hidden subtrees by default. Without
  // it every query below returns null and the suite passes vacuously.
  const q = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });

  beforeEach(() => {
    __resetBrandSplashForTests();
    __motion.reduce = false;
  });

  it('mounts the film when motion is allowed', () => {
    render(<BrandSplash />);
    expect(q('splash-film')).not.toBeNull();
  });

  it('REDUCE MOTION MOUNTS NO VideoView AT ALL', () => {
    // The distinction is the safety argument: the fallback must never be a
    // decoded film with a still laid over it, or the guard would be cosmetic.
    __motion.reduce = true;
    render(<BrandSplash />);
    expect(q('splash-film')).toBeNull();
    expect(q('splash-still')).not.toBeNull();
  });

  it('keeps the still underneath in BOTH modes, so nothing paints empty', () => {
    // expo-video has no poster prop. The still is a plain underlay and the film
    // paints over it once its first frame decodes.
    render(<BrandSplash />);
    expect(q('splash-still')).not.toBeNull();
  });

  it('and the still covers the screen rather than corner-cropping', () => {
    render(<BrandSplash />);
    expect(q('splash-still')?.props.resizeMode).toBe('cover');
  });
});

describe('THE SWITCH IS ON', () => {
  const src = readFileSync(join(ROOT, 'lib/splashFilm.ts'), 'utf8');
  it('SPLASH_MOTION_ENABLED is true', () => {
    expect(src).toMatch(/export const SPLASH_MOTION_ENABLED = true;/);
  });
  it('and the wave frames stay on disk as the measured fallback', () => {
    // 908KB at full resolution, 42MB decoded at the 640px encode that shipped
    // in build 47 and went 10 cold starts for 10. If the film fails, this is
    // what it falls back to, and it is already proven.
    expect(existsSync(join(ROOT, 'assets/splash/wave/01.jpg'))).toBe(true);
  });
});

describe('THE SHORT SPLASH MUST CONTAIN THE MASCOT', () => {
  // Shipped as build 50 and caught on device: SPLASH_MIN_HOLD_MS is 1500 and
  // Bolo does not enter the frame until ~1.8s, so every launch except the day's
  // first showed Chacha-ji waving at an empty sky. The film was fine. The
  // WINDOW was wrong.
  //
  // These pin the window against the film's actual beats. If the film is ever
  // re-cut, the numbers below move and these fail loudly rather than shipping
  // another splash with the mascot edited out of it.
  const BOLO_ENTERS_S = 1.8;
  const BOLO_LANDS_S = 3.9;
  const FILM_LENGTH_S = 5.042;

  it('opens AFTER Bolo has entered the frame', () => {
    expect(SPLASH_SHORT_START_S).toBeGreaterThan(BOLO_ENTERS_S);
  });

  it('and holds long enough to reach the landing', () => {
    const endsAt = SPLASH_SHORT_START_S + SPLASH_MIN_HOLD_MS / 1000;
    expect(endsAt).toBeGreaterThan(BOLO_LANDS_S);
  });

  it('without running past the end of the film', () => {
    expect(SPLASH_SHORT_START_S).toBeLessThan(FILM_LENGTH_S);
  });

  it('and the FULL timer still outlasts the whole film, so the last frame is not cut', () => {
    expect(SPLASH_FULL_PLAY_MS / 1000).toBeGreaterThan(FILM_LENGTH_S);
  });

  it('the seek is wired at BOTH ends: short opens late, FULL rewinds to zero', () => {
    // Asserted at source because the expo-video double has no timeline to
    // inspect: a player mock that accepted currentTime and did nothing would
    // let a broken seek pass a render test.
    const src = readFileSync(join(ROOT, 'components/BrandSplash.tsx'), 'utf8');
    expect(src).toContain('p.currentTime = SPLASH_SHORT_START_S;');
    expect(src).toContain('player.currentTime = 0;');
  });
});
