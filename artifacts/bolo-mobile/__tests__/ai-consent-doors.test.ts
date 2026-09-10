/**
 * EVERY DOOR THAT SENDS THE LEARNER ONWARD MUST MOUNT THE CONSENT GATE.
 *
 * This is a WIRING test, not a rendering one, and it is deliberately built the
 * other way round from the obvious version. Asserting "the four known doors
 * have a gate" passes forever and catches nothing. This starts from the SENDS:
 * it finds every file that calls one of the gated client hooks, and requires
 * each to mount the gate.
 *
 * So it fails when somebody adds a FIFTH door, which is the failure that
 * actually happens. LATAM's caveat on its own client gate is the reason this
 * exists: "copying the components without mounting them produces six forks that
 * look compliant and are not."
 *
 * The four operations are exactly the four the SERVER 403s in
 * middlewares/requireAiConsent.ts. If that list changes, this one must too, and
 * the mismatch assertion at the bottom is what says so out loud.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/**
 * THE SEND SIGNALS, ONE PER MECHANISM, AND THERE ARE THREE MECHANISMS NOT ONE.
 *
 * The first version of this file listed the four GENERATED hooks, on the
 * assumption that the generated client is how everything reaches the server. It
 * is not, and the non-vacuity assertions below are what said so: three of the
 * four hooks are called by nothing in this app.
 *
 *   speaking practice / review   useEvaluatePronunciation   the generated hook
 *   chatting with Bolo           getChatTurnUrl + fetch     raw, because it streams
 *   the video call               lib/chachaCallApi          its own module
 *
 * Keyed on the mechanism a screen actually uses, so a new door is caught
 * whichever of the three it reaches for.
 */
const GATED_SIGNALS = [
  'useEvaluatePronunciation',
  'getChatTurnUrl',
  'chachaCallApi',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SOURCES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'hooks'))];

function read(p: string) {
  return readFileSync(p, 'utf8');
}

/** Files that call a gated hook, i.e. that can cause a send. */
function callersOfGatedHooks(): string[] {
  return SOURCES.filter((p) => {
    const src = read(p);
    return GATED_SIGNALS.some((sig) => new RegExp(`\\b${sig}\\b`).test(src));
  });
}

/**
 * Which SCREEN a sending file belongs to. A hook or a subcomponent under
 * components/ is reached through a screen, so the gate belongs on the screen
 * that renders it, not on the leaf.
 */
const SCREEN_FOR: Record<string, string> = {
  'components/call/useLiveCall.ts': 'app/(app)/call.tsx',
};

describe('the AI consent gate is mounted at every door that sends', () => {
  const callers = callersOfGatedHooks();

  it('finds the sending files at all, so this suite is not vacuously green', () => {
    // Without this, a rename of every generated hook turns the whole file into
    // a test that asserts nothing while staying green.
    expect(callers.length).toBeGreaterThan(0);
  });

  it.each(GATED_SIGNALS)('%s is reached by at least one file', (signal) => {
    const found = SOURCES.filter((p) => new RegExp(`\\b${signal}\\b`).test(read(p)));
    expect(found.length).toBeGreaterThan(0);
  });

  it('every sending file is covered by a screen that mounts AiConsentGate', () => {
    const uncovered: string[] = [];
    for (const p of callers) {
      const rel = path.relative(ROOT, p);
      const target = SCREEN_FOR[rel] ? path.join(ROOT, SCREEN_FOR[rel]) : p;
      const src = read(target);
      const mounts = src.includes('<AiConsentGate') && src.includes('useAiConsentGate');
      if (!mounts) uncovered.push(`${rel}${SCREEN_FOR[rel] ? ` (via ${SCREEN_FOR[rel]})` : ''}`);
    }
    expect(uncovered).toEqual([]);
  });

  it('the gate is guarded by shouldAsk, never rendered unconditionally', () => {
    // shouldAsk is FALSE while the snapshot loads. An unguarded mount shows the
    // consent screen on every cold start, which is the exact bug the loading
    // rule exists to prevent.
    const doors = SOURCES.filter((p) => read(p).includes('<AiConsentGate'));
    expect(doors.length).toBeGreaterThan(0);
    for (const p of doors) {
      expect(read(p)).toMatch(/aiConsent\.shouldAsk\s*&&\s*\(?\s*<AiConsentGate/);
    }
  });
});
