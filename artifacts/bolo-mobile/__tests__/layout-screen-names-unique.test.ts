/**
 * Router-level merge fallout guard.
 *
 * expo-router crashes on mount with "Screen names must be unique" when a
 * layout registers the same screen twice — exactly what a rebase once did to
 * app/(app)/_layout.tsx (duplicate "phrasebook" entry). Component tests never
 * mount the real layouts, so the suite stayed green while the app crashed.
 *
 * This test statically scans EVERY _layout file under app/ and asserts that
 * each layout's <*.Screen name="..."> registrations are unique. It also
 * asserts that every .Screen tag carrying a name was captured, so a Screen
 * written with name in a later attribute position fails loudly instead of
 * slipping past the regex.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.join(__dirname, '..', 'app');

function findLayouts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findLayouts(full));
    else if (/^_layout\.(t|j)sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('every _layout registers unique screen names', () => {
  const layouts = findLayouts(APP_DIR);

  it('found the layout files', () => {
    // (app)/_layout, (app)/(tabs)/_layout, (auth)/_layout, root _layout...
    expect(layouts.length).toBeGreaterThanOrEqual(3);
  });

  it.each(layouts.map((f) => [path.relative(APP_DIR, f), f]))(
    '%s has no duplicate Screen names',
    (_rel, file) => {
      const src = fs.readFileSync(file as string, 'utf8');

      // name-first form: <Stack.Screen name="x" — the codebase convention.
      const names = [...src.matchAll(/<\w+\.Screen\s+name="([^"]+)"/g)].map(
        (m) => m[1],
      );
      // Every .Screen tag that declares a name anywhere must have been
      // captured above; a name in a later attribute slot fails here.
      const screensWithName = [
        ...src.matchAll(/<\w+\.Screen\b(?:(?!\/>|<\/|>\s*<)[\s\S])*?name="/g),
      ].length;
      expect(names.length).toBe(screensWithName);

      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes).toEqual([]);
    },
  );
});
