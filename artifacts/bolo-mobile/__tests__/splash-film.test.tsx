import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrandSplash, __resetBrandSplashForTests } from '@/components/BrandSplash';

// jest-setup.js mocks reanimated globally with useReducedMotion: () => false.
// This file flips it per test, so the mutable flag lives INSIDE the factory:
// jest.mock is hoisted above every const here. Same idiom as
// bazaar-welcome.test.tsx.
// BrandSplash moved onto reanimated on 2026-08-20, so this double has to carry
// the pieces it now uses. The fade is asserted by behaviour elsewhere; here the
// shared value is a plain box and withTiming resolves immediately, because what
// these tests care about is WHICH SOURCE reaches the decoder, not the easing.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const motion = { reduce: false };
  return {
    __esModule: true,
    __motion: motion,
    default: { View: (props: Record<string, unknown>) => React.createElement(View, props) },
    useReducedMotion: () => motion.reduce,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (to: unknown, _cfg?: unknown, cb?: (f: boolean) => void) => {
      cb?.(true);
      return to;
    },
    runOnJS: (fn: (...a: unknown[]) => unknown) => fn,
  };
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

describe('THE SPLASH IS A STILL, in every motion mode', () => {
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

  it.each([false, true])('renders the poster with reduceMotion=%s', (reduce) => {
    __motion.reduce = reduce;
    render(<BrandSplash />);
    expect(q('splash-still')).not.toBeNull();
  });

  it('and covers the screen, so the poster is never corner-cropped', () => {
    // A bare absoluteFill Image lays out at its intrinsic size on iOS, which is
    // why the style carries explicit 100% and why resizeMode is asserted here.
    render(<BrandSplash />);
    expect(q('splash-still')?.props.resizeMode).toBe('cover');
  });
});

describe('THE SPLASH USES ONE ANIMATION SYSTEM, and it is reanimated', () => {
  // THE BUG THIS PREVENTS, in full, because it cost two days and nothing else
  // would have caught it.
  //
  // BrandSplash used react-native's own Animated with useNativeDriver on a
  // full-screen view at the ROOT layout, zIndex 9999, wrapping the entire app.
  // It was the ONLY component in the app doing so; everything else animates
  // through reanimated. Two native animation systems, with react-native's
  // sitting on top of the whole tree, and on the New Architecture reanimated's
  // view updates below it never applied. Every animation in every RELEASE build
  // was frozen from the day this component was created.
  //
  // It was invisible to everything: install, typecheck, 1120 tests and dev
  // builds were all green, because dev builds animate fine. It took two store
  // builds differing only in whether this component was mounted.
  const src = readFileSync(join(ROOT, 'components/BrandSplash.tsx'), 'utf8');

  it("does not import react-native's Animated", () => {
    const rnImport = /import\s*\{([^}]*)\}\s*from\s*'react-native'/.exec(src)?.[1] ?? '';
    expect(rnImport).not.toMatch(/\bAnimated\b/);
  });

  it('animates through reanimated instead', () => {
    expect(src).toMatch(/import Animated[^;]*from 'react-native-reanimated'/s);
    expect(src).toContain('useSharedValue');
    expect(src).toContain('useAnimatedStyle');
  });

  it('and nothing else at the root layout uses react-native Animated either', () => {
    // The root is where this matters: an animated node there wraps everything
    // below it. Elsewhere in the tree the two systems coexist fine, which is
    // why PressableScale is not covered by this.
    const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');
    const rnImport = /import\s*\{([^}]*)\}\s*from\s*'react-native'/.exec(layout)?.[1] ?? '';
    expect(rnImport).not.toMatch(/\bAnimated\b/);
  });
});
