import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// THE LAUNCH WINDOW HAS A REANIMATED BUDGET, and this test is how it is kept.
//
// On 2026-08-19 and -20 this app died inside the Hermes garbage collector
// 200ms to 600ms after launch. Five version combinations were tried:
//
//   reanimated 4.1.7 + worklets 0.5.1   animations working   CRASH
//   reanimated 4.1.7 + worklets 0.8.3   animations DEAD      clean
//   reanimated 4.3.2 + worklets 0.8.3   animations working   CRASH 10/10
//   reanimated 3.19.5, new arch         animations DEAD      clean
//   reanimated 3.19.5, old arch         animations working   CRASH 10/10
//
// Every configuration where animations RAN crashed. Every one that launched had
// animations that were silently dead. It was never a version bug: it is the
// volume of worklet registrations mounting at once, each one serialising a
// closure across the runtime boundary while the GC is at its busiest.
//
// PressableScale was the single worst offender because it is not one component,
// it is one component times every tappable surface on the launch screen.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..');
const REANIMATED_IMPORT = /from ['"]react-native-reanimated['"]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

function codeLines(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

describe('HIGH-MULTIPLICITY COMPONENTS STAY OFF REANIMATED', () => {
  // These render many times on one screen, so their per-instance hook cost is
  // multiplied by every use. They must use react-native's own Animated, which
  // hands the work to the native driver and creates no worklets at all.
  const MULTIPLIED = ['components/PressableScale.tsx'];

  it.each(MULTIPLIED)('%s does not import reanimated', (rel) => {
    expect(REANIMATED_IMPORT.test(codeLines(join(ROOT, rel)))).toBe(false);
  });

  it('PressableScale animates through react-native Animated on the native driver', () => {
    // useNativeDriver is the whole point: without it the animation runs on the
    // JS thread and the win is only in worklet count, not in thread pressure.
    const src = readFileSync(join(ROOT, 'components/PressableScale.tsx'), 'utf8');
    expect(src).toContain("from 'react-native'");
    expect(src).toContain('useNativeDriver: true');
  });

  it('and reads Reduce Motion from the OS, not from reanimated', () => {
    // Two reasons, and the second one is the bigger. reanimated's
    // useReducedMotion costs a worklet-runtime subscription per call site,
    // which here is one per tappable surface. And it answers from reanimated's
    // own native module, returning TRUE when that module has not initialised,
    // which flattened the entire app for two builds while the owner had the
    // setting switched off. lib/motionPrefs reads AccessibilityInfo directly.
    const src = readFileSync(join(ROOT, 'components/PressableScale.tsx'), 'utf8');
    expect(src).toContain("from '@/lib/motionPrefs'");
  });

  it('AND NOTHING IN THE APP reads Reduce Motion through reanimated', () => {
    // The whole-app version of the rule above. One wrong answer from that hook
    // turns off every animation at once, silently, with nothing logged.
    const offenders = ['app', 'components', 'lib'].flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => {
        const code = codeLines(f);
        return /useReducedMotion/.test(code) && /react-native-reanimated/.test(code)
          && new RegExp("useReducedMotion[^}]*\\}\\s*from\\s*'react-native-reanimated'", 's').test(code);
      })
      .map((f) => f.replace(ROOT, ''));
    expect(offenders).toEqual([]);
  });
});

describe('the reanimated footprint of the launch screen is measured, not assumed', () => {
  // Not a threshold that fails the build on one extra hook. A number, printed
  // where anyone adding to the home screen will see it, because the failure it
  // guards against is invisible in every other signal: install, typecheck and
  // the whole suite stayed green through all five crashing builds.
  it('reports how many reanimated hooks the home screen mounts', () => {
    const home = join(ROOT, 'app/(app)/(tabs)/index.tsx');
    const src = codeLines(home);
    const hooks = (src.match(/useAnimatedStyle|useSharedValue|useAnimatedProps|useLoopProgress/g) ?? [])
      .length;
    // The screen's own hooks only; children carry their own and are counted by
    // whoever next has to reduce this.
    expect(hooks).toBeLessThanOrEqual(8);
  });
});
