import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrandSplash, __resetBrandSplashForTests } from '@/components/BrandSplash';

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

describe('THE ROOT LAYOUT MOUNTS NO FULL-SCREEN JS OVERLAY', () => {
  // The most expensive bug of this app's life, and the only guard against it
  // coming back is this test. A full-screen JS view at the ROOT freezes every
  // reanimated animation for the life of the app in RELEASE builds, and no dev
  // build, local check or green suite can show it: dev builds animate while the
  // release build of the same commit is frozen. Five store builds established
  // it (150, 170, 180, 190 frozen; 160, not mounted, animating).
  //
  // components/BrandSplash.tsx is kept on disk on purpose. This test is what
  // makes keeping it safe.

  const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');

  it('NOTHING UNDER app/ RENDERS BrandSplash', () => {
    // The guard is on the MOUNT, not the import. app/_layout.tsx keeps the
    // import on purpose: build 160, the one that animates 10 for 10, carried
    // it with the component unmounted, and Metro does not tree-shake, so the
    // module is bundled either way. Dropping the import would quietly make
    // this a different build from the one that was actually measured.
    const appFiles = sourceFiles(join(ROOT, 'app')).filter((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .some(
          (line) =>
            !/^\s*(\/\/|\*|\/\*)/.test(line) && /<BrandSplash[\s/>]/.test(line),
        ),
    );
    expect(appFiles.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });

  it('and the root layout renders no absoluteFill of its own', () => {
    const code = layout
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/absoluteFill/);
    expect(code).not.toMatch(/StyleSheet\.create/);
  });
});

describe('THE NATIVE SPLASH MUST GET OUT OF THE WAY EARLY', () => {
  const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');

  it('holds the native splash at module load', () => {
    expect(layout).toMatch(/SplashScreen\.preventAutoHideAsync\(\)/);
  });

  it('and releases it, or the app never gets past the splash', () => {
    expect(layout).toMatch(/SplashScreen\.hideAsync\(\)/);
  });

  it('AND RELEASES IT ON FONTS, WHICH IS EARLY, AND MUST STAY THAT WAY', () => {
    // Build 201 is why this is a test. It held the splash until Clerk resolved
    // plus 1500ms, mounted no JS overlay at all, and froze every animation
    // exactly like the overlay builds. Dependency sets were identical and the
    // hold was the only functional difference from the build that animates.
    expect(layout).toMatch(/fontsLoaded \|\| fontError/);
  });

  it('and holds it no longer than that, on a timer or otherwise', () => {
    const code = layout
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/setTimeout/);
    expect(code).not.toMatch(/HOLD_MS/);
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
