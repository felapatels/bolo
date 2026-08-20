import {
  useReducedMotion,
  prefersReducedMotion,
  inLaunchQuietWindow,
  __settleLaunchForTests,
  __resetLaunchForTests,
} from '@/lib/motionPrefs';
import { renderHook } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The global double in jest-setup replaces this module for component suites.
// This one tests the real thing.
jest.unmock('@/lib/motionPrefs');

// ---------------------------------------------------------------------------
// THE LAUNCH QUIET WINDOW.
//
// Seven builds, no exceptions: every configuration where reanimated animations
// RAN crashed the app 200ms to 600ms after launch, and every configuration that
// launched had animations that were not running. Build 57 narrowed it to
// execution rather than registration, because the clean builds still mounted
// every animated component.
//
// So nothing animates until the window closes. These pin the two properties
// that make that safe: that it actually suppresses motion, and that it closes
// while the splash is still covering the screen so nobody ever sees it.
// ---------------------------------------------------------------------------

describe('nothing animates inside the launch window', () => {
  beforeEach(() => __resetLaunchForTests());
  afterEach(() => __settleLaunchForTests());

  it('reports reduced motion while the window is open, whatever the OS says', () => {
    expect(inLaunchQuietWindow()).toBe(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('and the imperative reader agrees, so both paths stay still', () => {
    // Two readers disagreeing would animate half the app and leave the rest
    // frozen, which is worse than either.
    expect(prefersReducedMotion()).toBe(true);
  });

  it('releases once the window closes', () => {
    __settleLaunchForTests();
    expect(inLaunchQuietWindow()).toBe(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe('THE WINDOW CLOSES BEHIND THE SPLASH, which is why nobody sees it', () => {
  const prefs = readFileSync(join(__dirname, '..', 'lib', 'motionPrefs.ts'), 'utf8');
  const film = readFileSync(join(__dirname, '..', 'lib', 'splashFilm.ts'), 'utf8');

  const quiet = Number(/LAUNCH_QUIET_MS = (\d+)/.exec(prefs)?.[1]);
  const minHold = Number(/SPLASH_MIN_HOLD_MS = (\d+)/.exec(film)?.[1]);

  it('outlasts the splash minimum hold', () => {
    // Closing first would put the first animation frame back inside the window
    // this exists to empty, and the user would see a flat app come alive a
    // beat before the splash lifted.
    expect(quiet).toBeGreaterThan(minHold);
  });

  it('but not so long that the app feels dead in the hand', () => {
    // The splash releases at the LATER of the ready signal and the hold, so a
    // slow launch already waits. This must not add a visible second on top.
    expect(quiet).toBeLessThanOrEqual(minHold + 1000);
  });
});
