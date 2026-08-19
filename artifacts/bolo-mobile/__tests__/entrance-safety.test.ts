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
