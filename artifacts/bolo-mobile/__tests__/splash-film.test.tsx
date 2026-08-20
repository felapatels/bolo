import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BrandSplash, __resetBrandSplashForTests } from '@/components/BrandSplash';

// Same idiom as bazaar-welcome.test.tsx: jest.mock is hoisted above every const
// in the file, so the mutable flag lives INSIDE the factory and comes back out
// on a __ property. jest-setup.js mocks reanimated globally with
// useReducedMotion: () => false; this file needs to flip it per test.
jest.mock('react-native-reanimated', () => {
  const motion = { reduce: false };
  return { __esModule: true, __motion: motion, useReducedMotion: () => motion.reduce };
});

jest.mock('@/lib/splashReady', () => ({ __esModule: true, useHomeReady: () => false }));

// BrandSplash is the ONLY file in the app that imports expo-image, so there is
// no global double to reuse. A View passes testID straight through, which is
// all these tests read: the component picks the testID from the same boolean
// that picks the source, so the id IS the evidence of which one was handed to
// the decoder.
jest.mock('expo-image', () => ({ __esModule: true, Image: require('react-native').View }));

const { __motion } = jest.requireMock('react-native-reanimated') as {
  __motion: { reduce: boolean };
};

// ---------------------------------------------------------------------------
// The splash had NO tests, which is how a film ended up decoding at the root
// layout on every cold start and killing the app three or four launches out of
// five (2026-08-19, fifteen crashes). These do not try to prove the animation
// looks right, which no test can. They pin the two things that actually cost
// the day: that nothing requires a video on any path, and that Reduce Motion
// and the kill switch both really reach the decoder rather than merely hiding
// a decoded frame.
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

describe('NOTHING REQUIRES A VIDEO, on any path', () => {
  // The strongest guard available here, and the cheapest. expo-video is gone,
  // but a require() of an .mp4 is what put a decoder on the launch path in the
  // first place, and a second one would arrive the same quiet way: bundled,
  // unmentioned, and only visible as an intermittent crash on a real device.
  const files = ['app', 'components', 'lib'].flatMap((d) => sourceFiles(join(ROOT, d)));

  it('finds no .mp4 or .mov require anywhere in app, components or lib', () => {
    const offenders = files.filter((f) => /require\([^)]*\.(mp4|mov)['"]\)/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });

  it('finds no import of expo-video', () => {
    const offenders = files.filter((f) => /from ['"]expo-video['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });

  it('and expo-video is not a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }['expo-video']).toBeUndefined();
  });
});

describe('the splash assets are what the component thinks they are', () => {
  it('the film is an ANIMATED webp, not a still with the wrong suffix', () => {
    // A single-frame webp would render as a frozen splash that nobody notices
    // is broken until someone asks why the bird stopped moving.
    const bytes = readFileSync(join(ROOT, 'assets/splash/welcome-bolo.webp'));
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
    expect(bytes.includes(Buffer.from('ANIM'))).toBe(true);
    // ANMF is one chunk per frame. A real film has plenty.
    expect(bytes.toString('binary').split('ANMF').length - 1).toBeGreaterThan(30);
  });

  it('and it is not larger than the mp4 it replaced', () => {
    // The whole trade was "same film, different decoder, no size penalty". If a
    // re-encode ever breaks that, it should fail here rather than in an install.
    const webp = statSync(join(ROOT, 'assets/splash/welcome-bolo.webp')).size;
    expect(webp).toBeLessThan(statSync(join(ROOT, 'assets/splash/welcome-bolo.mp4')).size);
  });
});

describe('THE KILL SWITCH, pinned at source like lib/entrance.ts', () => {
  const src = readFileSync(join(ROOT, 'lib/splashFilm.ts'), 'utf8');

  // INVERTED 2026-08-19, hours after it was written. This pinned `true` while
  // the animated WebP was believed safe. It crashed five cold starts out of
  // five, so the constant is false and the assertion pins that instead of being
  // deleted along with the belief.
  it('is a single constant, and it is OFF after the 5-of-5 crash', () => {
    expect(src).toMatch(/export const SPLASH_MOTION_ENABLED = false;/);
  });

  it('no longer exports SPLASH_FILM, so the mp4 path cannot be half-restored', () => {
    expect(src).not.toContain('SPLASH_FILM');
  });
});

describe('THE SWITCH REACHES THE DECODER, it does not merely cover a frame', () => {
  // INVERTED 2026-08-19, hours after it was written. This block asserted that
  // the film played whenever motion was allowed. It crashed five cold starts
  // out of five, so SPLASH_MOTION_ENABLED is false and the still is what
  // renders in every mode.
  //
  // The invariant being pinned did not change and is the entire safety
  // argument: the animated source is NEVER HANDED OVER, rather than being
  // decoded and then hidden behind the poster. If it were merely covered, the
  // kill switch would be cosmetic and would not have saved the launch.
  //
  // includeHiddenElements is REQUIRED and is not a workaround. The overlay sets
  // accessibilityElementsHidden and importantForAccessibility="no-hide-
  // descendants" on purpose, because a splash must never be announced to a
  // screen reader, and RNTL's queries skip hidden subtrees by default. Without
  // it every query returns null and these pass vacuously.
  const q = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });

  beforeEach(() => {
    __resetBrandSplashForTests();
    __motion.reduce = false;
  });

  it.each([false, true])(
    'renders the STILL with reduceMotion=%s, because the switch is off',
    (reduce) => {
      __motion.reduce = reduce;
      render(<BrandSplash />);
      expect(q('splash-still')).not.toBeNull();
      expect(q('splash-film')).toBeNull();
    },
  );

  it('carries the still as its placeholder too, so nothing paints empty', () => {
    // The overlay's ground is the film's opening plate; drop the placeholder
    // and a cold start flashes white before anything decodes.
    render(<BrandSplash />);
    expect(q('splash-still')?.props.placeholder).toBeDefined();
  });
});
