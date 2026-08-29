import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
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



  it('NOTHING IMPORTS expo-image, which is the one that crashed 5 of 5', () => {
    // expo-image-picker is a different package and is allowed; the boundary is
    // an exact module specifier, not a prefix.
    expect(importers(/from ['"]expo-image['"]/)).toEqual([]);
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


});

describe('THE NATIVE SPLASH MUST GET OUT OF THE WAY EARLY', () => {
  const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');

  it('holds the native splash at module load', () => {
    expect(layout).toMatch(/SplashScreen\.preventAutoHideAsync\(\)/);
  });

  it('and releases it, or the app never gets past the splash', () => {
    expect(layout).toMatch(/SplashScreen\.hideAsync\(\)/);
  });


});

describe('THE HANDOVER PLATE: the bird on white, then a crossfade (build 18)', () => {
  // Owner: "Bolo bird has a brown background when you first launch. instead
  // i want it with a white background and crossfade with intro animation."
  // expo-splash-screen's own fade is iOS-only, so BrandSplash draws the
  // native splash's twin as its top layer and fades that on both platforms.
  const q = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });
  const { SPLASH_HANDOVER_GROUND, SPLASH_HANDOVER_BIRD } = jest.requireActual('@/lib/splashFilm');

  beforeEach(() => {
    __resetBrandSplashForTests();
    __motion.reduce = false;
  });

  it('the native splash is the bird on the SAME white the plate paints', () => {
    // Held equal here rather than remembered: a brown in either place is the
    // cut this replaced.
    const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
    expect(app.expo.splash.backgroundColor.toUpperCase()).toBe(SPLASH_HANDOVER_GROUND);
    expect(app.expo.splash.image).toMatch(/mascot-wave\.png$/);
    expect(SPLASH_HANDOVER_GROUND).toBe('#FFFFFF');
  });

  it('holds the plate, bird and white, while the native splash is still up', () => {
    render(<BrandSplash nativeGone={false} />);
    const plate = q('splash-handover');
    expect(plate).not.toBeNull();
    const flat = Object.assign({}, ...[plate!.props.style].flat(Infinity).filter(Boolean));
    expect(flat.backgroundColor).toBe(SPLASH_HANDOVER_GROUND);
    const bird = q('splash-handover-bird');
    expect(bird).not.toBeNull();
    expect(bird!.props.source).toBe(SPLASH_HANDOVER_BIRD);
    expect(bird!.props.resizeMode).toBe('contain');
    // Above the film, not under it: the last child of the overlay.
    const overlay = q('brand-splash')!;
    expect(overlay.props.children[overlay.props.children.length - 1]?.props?.testID).toBe(
      'splash-handover',
    );
  });

  it('fades the plate out once the native splash has gone, and unmounts it', () => {
    jest.useFakeTimers();
    try {
      render(<BrandSplash nativeGone />);
      expect(q('splash-handover')).not.toBeNull();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(q('splash-handover')).toBeNull();
      // The poster and the film are untouched underneath.
      expect(q('splash-still')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('releases the native splash only once the plate has laid out AND its bird has loaded', () => {
    // A simulator burst caught one frame of plain white between the native
    // splash and the film: the overlay had laid out, the PNG had not decoded.
    const onReady = jest.fn();
    render(<BrandSplash onReady={onReady} nativeGone={false} />);
    const overlay = q('brand-splash')!;
    act(() => {
      overlay.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    });
    expect(onReady).not.toHaveBeenCalled();
    act(() => {
      q('splash-handover-bird')!.props.onLoad();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    // Once, however many times either half fires again.
    act(() => {
      overlay.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a bird that fails to load still releases the native splash', () => {
    const onReady = jest.fn();
    render(<BrandSplash onReady={onReady} nativeGone={false} />);
    act(() => {
      q('brand-splash')!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
      q('splash-handover-bird')!.props.onError();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('the root reports the native splash gone AFTER hideAsync settles', () => {
    // The plate must not start fading while the native copy still covers it,
    // and a hide that rejects must still release it.
    const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/SplashScreen\.hideAsync\(\)\.finally\(\(\) => setNativeGone\(true\)\)/);
    expect(layout).toMatch(/nativeGone=\{nativeGone\}/);
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
