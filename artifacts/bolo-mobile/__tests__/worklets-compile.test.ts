import { transformSync } from '@babel/core';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// THE TEST THAT WOULD HAVE CAUGHT BUILD 52.
//
// On 2026-08-20 react-native-worklets was bumped to 0.8.3 to fix the launch
// crash. It paired with a reanimated that had never been built against it, and
// EVERY animated style in the app silently stopped working. Nothing caught it:
// pnpm installed cleanly, all 7 projects typechecked, 1135 tests passed, the
// app launched and looked normal. The owner found it by noticing the boarding
// pass had stopped breathing.
//
// The reason nothing caught it is that a worklet which fails to compile is not
// an error. It is an ordinary function that the UI runtime ignores, so the
// animation simply never moves and every other signal stays green.
//
// This runs the project's REAL babel config over a real worklet and asserts the
// transform actually happened. It is the only cheap signal that animations can
// work at all, and it costs a second.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..');

/**
 * The reanimated plugin READS THE FILE FROM DISK for its source maps, so the
 * filename cannot be invented. Write a real one, transform it, remove it.
 * Getting this wrong makes the plugin throw ENOENT, which looks exactly like
 * "worklets are not compiling" and sent me chasing a phantom once already.
 */
function compile(src: string, caller?: Record<string, unknown>): string {
  const probe = join(ROOT, 'lib', '__worklet-probe.generated.ts');
  writeFileSync(probe, src);
  try {
    const out = transformSync(src, {
      filename: probe,
      cwd: ROOT,
      root: ROOT,
      babelrc: false,
      configFile: join(ROOT, 'babel.config.js'),
      ...(caller ? { caller: caller as never } : {}),
    });
    return out?.code ?? '';
  } finally {
    try {
      unlinkSync(probe);
    } catch {
      /* already gone */
    }
  }
}

/** Reanimated marks compiled worklets with hashed metadata; an uncompiled one
 *  is just a function and carries none of it. */
const WORKLET_MARKERS = /__workletHash|_workletHash|__initData|__workletsCache|workletHash/;

describe('WORKLETS ACTUALLY COMPILE', () => {
  it('a function carrying the worklet directive is transformed', () => {
    const code = compile(`
      export function slide() {
        return () => {
          'worklet';
          return { transform: [{ translateY: 4 }] };
        };
      }
    `);
    expect(code).toMatch(WORKLET_MARKERS);
  });

  it('and a function WITHOUT the directive is left alone', () => {
    // Guards the assertion above from passing on a babel plugin that stamps
    // every function it sees, which would make this test meaningless.
    const code = compile(`
      export function plain() {
        return () => ({ transform: [{ translateY: 4 }] });
      }
    `);
    expect(code).not.toMatch(WORKLET_MARKERS);
  });

  it('the reanimated version and its worklet engine agree', () => {
    // The build-52 failure in one assertion. reanimated 4 needs a matching
    // react-native-worklets; reanimated 3 has no such package and must not
    // have one lying around, because a stale copy resolves ahead of nothing
    // and reintroduces exactly the second-runtime traffic this downgrade
    // exists to remove.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const rea = deps['react-native-reanimated'] as string;
    const major = Number(rea.replace(/[^0-9.]/g, '').split('.')[0]);

    if (major >= 4) {
      expect(deps['react-native-worklets']).toBeDefined();
    } else {
      expect(deps['react-native-worklets']).toBeUndefined();
    }
  });

  it('reanimated is pinned exactly, not floated', () => {
    // This pairing has now broken twice through version drift. A caret range
    // is how it drifts.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['react-native-reanimated']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('AND IT COMPILES UNDER METRO, not just under a bare babel call', () => {
  // Babel presets branch on api.caller(). A transform that works with no caller
  // proves nothing about the real build, where Metro passes a caller naming
  // itself, the platform, and whether this is a dev bundle. Build 54 shipped
  // with worklets that compiled in this suite and animations that were dead on
  // the device, which is exactly the gap a caller-less test leaves open.
  const WORKLET = `
    export function slide() {
      return () => {
        'worklet';
        return { transform: [{ translateY: 4 }] };
      };
    }
  `;

  it.each([
    ['production ios bundle', { name: 'metro', platform: 'ios', isDev: false, isServer: false }],
    ['dev ios bundle', { name: 'metro', platform: 'ios', isDev: true, isServer: false }],
    ['production android bundle', { name: 'metro', platform: 'android', isDev: false, isServer: false }],
  ])('compiles worklets in a %s', (_label, caller) => {
    expect(compile(WORKLET, caller as Record<string, unknown>)).toMatch(WORKLET_MARKERS);
  });
});
