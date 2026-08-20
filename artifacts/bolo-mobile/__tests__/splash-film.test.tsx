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

  it('is a single constant, so falling back to the still is one edit', () => {
    expect(src).toMatch(/export const SPLASH_MOTION_ENABLED = true;/);
  });

  it('no longer exports SPLASH_FILM, so the mp4 path cannot be half-restored', () => {
    expect(src).not.toContain('SPLASH_FILM');
  });
});

describe('REDUCE MOTION REACHES THE DECODER, it does not just hide a frame', () => {
  // includeHiddenElements is REQUIRED here and is not a workaround. The overlay
  // sets accessibilityElementsHidden and importantForAccessibility="no-hide-
  // descendants" on purpose, because a splash must never be announced to a
  // screen reader, and RNTL's queries skip hidden subtrees by default. Without
  // this, every query returns null and the tests pass vacuously in the one
  // direction that matters least.
  const q = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });

  // The distinction is the entire safety argument. If the still were merely
  // painted over a decoded animation, Reduce Motion and the kill switch would
  // both be cosmetic and neither would help if the launch path went bad again.
  beforeEach(() => {
    __resetBrandSplashForTests();
    __motion.reduce = false;
  });

  it('plays the film when motion is allowed', () => {
    render(<BrandSplash />);
    expect(q('splash-film')).not.toBeNull();
    expect(q('splash-still')).toBeNull();
  });

  it('hands the decoder the STILL when Reduce Motion is on', () => {
    __motion.reduce = true;
    render(<BrandSplash />);
    expect(q('splash-still')).not.toBeNull();
    expect(q('splash-film')).toBeNull();
  });

  it.each([false, true])(
    'carries the still as placeholder with reduceMotion=%s, so nothing paints empty',
    (reduce) => {
      // The overlay's ground is the film's opening plate; drop the placeholder
      // and a cold start flashes white before the first frame decodes.
      __motion.reduce = reduce;
      render(<BrandSplash />);
      expect(q(reduce ? 'splash-still' : 'splash-film')?.props.placeholder).toBeDefined();
    },
  );
});
