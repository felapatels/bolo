import fs from 'node:fs';
import path from 'node:path';
import { appearDown, appearUp, appearZoom, appearPlain } from '@/lib/entrance';

// ---------------------------------------------------------------------------
// THE RULE: an entrance animation may never be the reason content is visible.
//
// Confirmed on device 2026-08-19: in a preview build on reanimated 4.1.1 with
// the New Architecture, FadeInDown mounted the home screen at opacity 0 and
// never ran. Layout was perfect and the page was blank. The old guard was a
// blocklist of environments known to break, and a blocklist fails OPEN: any
// environment nobody anticipated got the animation, and an animation that does
// not run is an invisible screen.
//
// So the entrances carry no opacity. They move and nothing else. This test is
// the rule, not the workaround, and it is arithmetic over the returned
// descriptor rather than a render, so it cannot rot.
// ---------------------------------------------------------------------------

const MOVERS = { appearDown, appearUp, appearZoom } as const;

/** The descriptor reanimated consumes: what the view looks like at frame one. */
function initialOf(build: ReturnType<typeof appearDown>) {
  return build({} as never).initialValues as Record<string, unknown>;
}

describe('NO ENTRANCE TOUCHES OPACITY', () => {
  it.each(Object.keys(MOVERS))('%s starts fully opaque', (name) => {
    const initial = initialOf(MOVERS[name as keyof typeof MOVERS](0));
    // Absent is correct: reanimated leaves untouched props alone, so the view
    // inherits its natural opacity of 1.
    expect(initial).not.toHaveProperty('opacity');
  });

  it.each(Object.keys(MOVERS))('%s animates only transforms', (name) => {
    const build = MOVERS[name as keyof typeof MOVERS](0);
    const animations = build({} as never).animations as Record<string, unknown>;
    expect(Object.keys(animations)).toEqual(['transform']);
  });

  it('a bare fade has no safe form, so it is dropped rather than faked', () => {
    // There is no way to fade in from nothing safely: the initial state IS
    // invisible. Losing a fade costs nothing; losing the screen cost an
    // afternoon.
    expect(appearPlain()).toBeUndefined();
  });
});

describe('the movement is real, so this is not just a disabled animation', () => {
  it('appearDown starts below its resting place and travels to zero', () => {
    const initial = initialOf(appearDown(0)) as { transform: { translateY: number }[] };
    expect(initial.transform[0]!.translateY).toBeGreaterThan(0);
  });

  it('appearUp starts above it', () => {
    const initial = initialOf(appearUp(0)) as { transform: { translateY: number }[] };
    expect(initial.transform[0]!.translateY).toBeLessThan(0);
  });

  it('appearZoom starts smaller, but never at zero scale', () => {
    // A zero scale is invisible for the same reason a zero opacity is.
    const initial = initialOf(appearZoom(0)) as { transform: { scale: number }[] };
    const scale = initial.transform[0]!.scale;
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.5);
  });

  it('a stalled entrance leaves content within a few pixels of home', () => {
    // The whole degradation argument: if it never runs, nobody notices.
    const down = initialOf(appearDown(0)) as { transform: { translateY: number }[] };
    expect(Math.abs(down.transform[0]!.translateY)).toBeLessThanOrEqual(24);
  });
});

describe('THE FADE PRESETS ARE GONE FROM THE APP', () => {
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') sources(p, out);
      } else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) {
        out.push(p);
      }
    }
    return out;
  }

  const ROOT = path.join(__dirname, '..');
  const files = [
    ...sources(path.join(ROOT, 'app')),
    ...sources(path.join(ROOT, 'components')),
  ];

  it('reads real files, so an empty result means something', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('no screen imports a reanimated ENTERING preset', () => {
    // Every one of these mounts its view at opacity 0. One reintroduced import
    // is one more screen that can go blank on a device nobody tested.
    //
    // EXITING presets (FadeOut, FadeOutUp) are deliberately not listed. An exit
    // that never runs leaves content on screen a moment longer, which is the
    // benign direction: the view was being removed anyway, so nothing is lost.
    // Only entrances can make content that should exist fail to appear.
    const offenders = files.filter((f) =>
      /\b(FadeIn|FadeInDown|FadeInUp|ZoomIn)\b/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });
});

describe("ONE WORKLET PER ANIMATION, FOR THE APP'S WHOLE LIFETIME", () => {
  // These are called from inside render bodies at ~100 sites. Unmemoised, that
  // is a new worklet per render per site, each serialised across to
  // reanimated's UI runtime. Build 40 died twice inside HadesGC with
  // KERN_INVALID_ADDRESS in CardTable::updateBoundaries, which is heap
  // CORRUPTION rather than exhaustion, and cross-runtime traffic is where that
  // comes from.
  it.each(Object.keys(MOVERS))('%s returns the SAME object for the same args', (name) => {
    const make = MOVERS[name as keyof typeof MOVERS];
    expect(make(60, 500)).toBe(make(60, 500));
    expect(make()).toBe(make());
  });

  it('different args are still different animations', () => {
    // Memoising must not collapse two call sites into one shared animation, or
    // the stagger disappears and every block enters at once.
    expect(appearDown(0, 500)).not.toBe(appearDown(60, 500));
    expect(appearDown(60, 500)).not.toBe(appearDown(60, 350));
  });

  it('and the three kinds never collide in the cache', () => {
    expect(appearDown(0, 500)).not.toBe(appearUp(0, 500));
    expect(appearDown(0, 500)).not.toBe(appearZoom(0, 500));
    expect(appearUp(0, 500)).not.toBe(appearZoom(0, 500));
  });

  it('a memoised worklet still describes the same motion', () => {
    // Caching the object must not cache a STALE descriptor.
    const first = appearDown(0)({} as never).initialValues as {
      transform: { translateY: number }[];
    };
    const second = appearDown(0)({} as never).initialValues as {
      transform: { translateY: number }[];
    };
    expect(first.transform[0]!.translateY).toBe(second.transform[0]!.translateY);
    expect(first).not.toHaveProperty('opacity');
  });
});

describe('THE KILL SWITCH is wired through every path', () => {
  // The switch exists because build 40 died repeatedly inside the Hermes GC and
  // reanimated was the leading suspect. Turning it off CLEARED reanimated (the
  // crashes carried on without it) and removing expo-video stopped them, so it
  // is back on. The switch stays wired because the next VM-level scare should
  // cost one edit rather than an afternoon.
  //
  // Asserted at SOURCE level because the value is a compile-time constant: the
  // switch is on in tests either way, so no render test can tell on from off.
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'lib', 'entrance.ts'),
    'utf8',
  ) as string;

  // INVERTED 2026-08-19. This pinned __DEV__, the off-in-release state, while
  // reanimated was under suspicion. The experiment cleared it, so the assertion
  // now pins the restored value instead of being deleted with the suspicion.
  it('is a single constant, so toggling animations is one edit', () => {
    expect(src).toMatch(/const ENTRANCES_ENABLED = true;/);
  });

  it.each(['appear<', 'useAppearSkip'])('the %s guard consults it', (fn) => {
    const body = src.slice(src.indexOf(`export function ${fn}`));
    expect(body.slice(0, 400)).toContain('ENTRANCES_ENABLED');
  });

  // INVERTED. useAppear used to name the switch itself. It now DELEGATES to
  // useAppearSkip, because that hook latches its answer at first render and two
  // hooks deciding the same thing independently is how they drift apart.
  it('useAppear< delegates to useAppearSkip rather than deciding again', () => {
    const body = src.slice(src.indexOf('export function useAppear<'));
    expect(body.slice(0, 200)).toContain('useAppearSkip()');
  });

  it('and each factory refuses independently, so a missed guard still yields nothing', () => {
    for (const fn of ['appearDown', 'appearUp', 'appearZoom']) {
      const body = src.slice(src.indexOf(`export function ${fn}`));
      expect(body.slice(0, 300)).toContain('if (!ENTRANCES_ENABLED) return NO_ENTRANCE;');
    }
  });

  it('the disabled entrance sets no opacity either', () => {
    // Even the no-op must obey the rule that started all this: an entrance may
    // never be the reason content is invisible.
    const noop = src.slice(src.indexOf('const NO_ENTRANCE'), src.indexOf('const NO_ENTRANCE') + 220);
    expect(noop).not.toContain('opacity');
  });
});

describe('THE ENTRANCE DECISION IS NOT LATCHED, and that is deliberate again', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'lib', 'entrance.ts'),
    'utf8',
  ) as string;

  // REVERTED 2026-08-20, same day it was added. The latch existed only because
  // lib/motionPrefs held a launch quiet window that made reduced motion flip
  // from true to false 1800ms into every launch, and handing a mounted view a
  // new `entering` prop at that moment applied the animation's initial offset
  // and displaced content. That window has been removed: it was suppressing
  // every animation in the app to prevent a crash that turned out to be an
  // artifact of ad-hoc internal builds, not of animating.
  //
  // With reduced motion no longer flipping mid-life, latching would only hide
  // a genuine OS preference change from a mounted screen. So the hook answers
  // honestly again, and this pins that rather than deleting the reasoning.
  it('useAppearSkip reads the current preference, with no ref', () => {
    const body = src.slice(src.indexOf('export function useAppearSkip'));
    const fn = body.slice(0, body.indexOf('\n}'));
    expect(fn).not.toContain('useRef');
    expect(fn).toContain('useReducedMotion()');
  });

  it('and lib/motionPrefs holds no launch window any more', () => {
    // The window is gone. If it ever comes back, it needs the latch back with
    // it, and this failing is how that gets remembered.
    const prefs = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'lib', 'motionPrefs.ts'),
      'utf8',
    ) as string;
    expect(prefs).not.toContain('LAUNCH_QUIET_MS');
  });
});
