import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// THE SHARE'S NATIVE MODULES STAY OFF THE LAUNCH PATH (2026-09-16).
//
// react-native-view-shot and expo-sharing arrived with Share your story, and
// CLAUDE.md records what a native module on the launch path cost this app
// (expo-video, and expo-image, which is still banned). So both are required by
// ONE file, at the press rather than at its top (expo-router evaluates every
// route file at startup in development), and that file is imported by ONE
// screen, the storybook. The census is the same shape as splash-film.test.tsx's
// expo-image ban, and it matches import, require and import() alike.

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

const SOURCES = ['app', 'components', 'lib', 'hooks', 'contexts', 'constants'].flatMap((d) =>
  sourceFiles(join(ROOT, d)),
);

/** Files whose CODE matches, ignoring comment lines. */
function importers(pattern: RegExp): string[] {
  return SOURCES.filter((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && pattern.test(line)),
  )
    .map((f) => f.replace(ROOT, ''))
    .sort();
}

describe('the share modules have one importer each', () => {
  test('react-native-view-shot and expo-sharing: only StoryShareButton', () => {
    // Non-vacuous: the detector finds the one file that does import them, so
    // an empty result elsewhere means absent rather than unsearched.
    expect(importers(/(from |require\(|import\()['"]react-native-view-shot['"]/)).toEqual([
      '/components/games/StoryShareButton.tsx',
    ]);
    expect(importers(/(from |require\(|import\()['"]expo-sharing['"]/)).toEqual([
      '/components/games/StoryShareButton.tsx',
    ]);
  });

  test('and that file requires them at the press, never at its top', () => {
    const src = readFileSync(join(ROOT, 'components/games/StoryShareButton.tsx'), 'utf8');
    expect(src).not.toMatch(/^import[^;]*from ['"](react-native-view-shot|expo-sharing)['"]/m);
    expect(src).toMatch(/require\('expo-sharing'\)/);
    expect(src).toMatch(/require\('react-native-view-shot'\)/);
  });

  test('StoryShareButton: only the storybook screen', () => {
    expect(importers(/from ['"]@\/components\/games\/StoryShareButton['"]/)).toEqual([
      '/app/(app)/(tabs)/games/storybook.tsx',
    ]);
  });
});
