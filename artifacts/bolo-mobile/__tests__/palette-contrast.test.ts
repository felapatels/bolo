import colors from '@/constants/colors';

// ---------------------------------------------------------------------------
// DARK MODE HAD NO TEST. useColors() is exercised in 60-odd suites, but every
// one of them renders in the LIGHT palette, so the dark half of
// constants/colors.ts shipped unread by anything except a device.
//
// This is the invariant that actually matters for "does text disappear": every
// foreground token must stay legible on the surface it is named for, in BOTH
// palettes. It is arithmetic, so it needs no renderer and cannot rot.
//
// The floor is WCAG AA for UI components and large text, 3:1. These tokens are
// button fills and chips carrying bold text, not body copy, so 3:1 is the
// honest bar. The pairs that clear the stricter 4.5:1 body-text bar are pinned
// separately below, so the gap is visible rather than quietly tolerated.
// ---------------------------------------------------------------------------

const UI_FLOOR = 3;
const BODY_FLOOR = 4.5;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** WCAG 2.1 relative contrast, 1:1 (identical) to 21:1 (black on white). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const PAIRS = [
  ['background', 'foreground'],
  ['card', 'cardForeground'],
  ['primary', 'primaryForeground'],
  ['secondary', 'secondaryForeground'],
  ['muted', 'mutedForeground'],
  ['accent', 'accentForeground'],
  ['destructive', 'destructiveForeground'],
  ['success', 'successForeground'],
] as const;

const PALETTES = ['light', 'dark'] as const;

describe('sanity: the contrast maths is right before it judges anything', () => {
  it('black on white is 21:1 and a colour on itself is 1:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#4F46E5', '#4F46E5')).toBeCloseTo(1, 5);
  });
});

describe('BOTH palettes exist and are complete', () => {
  it.each(PALETTES)('%s defines every token a pair needs', (name) => {
    const p = colors[name] as Record<string, string>;
    // Jest's expect takes no message argument, so the diagnostic goes in the
    // VALUE: a list of what is missing reads better than eight bare booleans.
    const missing = PAIRS.flatMap(([bg, fg]) =>
      [bg, fg].filter((k) => !/^#[0-9a-fA-F]{6}$/.test(p[k] ?? '')),
    );
    expect(missing).toEqual([]);
  });

  it('the two palettes are genuinely different, not a copy', () => {
    expect(colors.dark.background).not.toBe(colors.light.background);
    expect(colors.dark.foreground).not.toBe(colors.light.foreground);
  });

  it('each palette puts LIGHT text on DARK ground, or the reverse, consistently', () => {
    // A palette whose background is darker than its foreground is a dark
    // palette. Getting this backwards is how a whole app inverts by accident.
    expect(luminance(colors.light.background)).toBeGreaterThan(
      luminance(colors.light.foreground),
    );
    expect(luminance(colors.dark.background)).toBeLessThan(
      luminance(colors.dark.foreground),
    );
  });
});

describe('NOTHING DISAPPEARS: every pair clears the UI floor in both palettes', () => {
  for (const name of PALETTES) {
    for (const [bg, fg] of PAIRS) {
      it(`${name}: ${fg} on ${bg}`, () => {
        const p = colors[name] as Record<string, string>;
        // The test NAME already says which pair this is, so a bare number is
        // enough: the failure reads "expected 2.54 >= 3".
        expect(contrast(p[bg]!, p[fg]!)).toBeGreaterThanOrEqual(UI_FLOOR);
      });
    }
  }
});

describe('THE KNOWN GAP, pinned so it stays visible', () => {
  // These clear the 3:1 UI floor but not the 4.5:1 body-text bar. Recorded
  // rather than fixed, because raising them means changing brand colours and
  // that is the owner's call. If one is improved, this test fails and the
  // record gets updated; if one regresses further, the floor test above fails.
  const BELOW_BODY: [string, string, string][] = [
    ['light', 'secondary', 'secondaryForeground'],
    ['light', 'muted', 'mutedForeground'],
    ['light', 'destructive', 'destructiveForeground'],
    ['dark', 'primary', 'primaryForeground'],
    ['dark', 'muted', 'mutedForeground'],
  ];

  it.each(BELOW_BODY)('%s: %s / %s is still under 4.5:1', (name, bg, fg) => {
    const p = colors[name as 'light' | 'dark'] as Record<string, string>;
    expect(contrast(p[bg]!, p[fg]!)).toBeLessThan(BODY_FLOOR);
  });

  it('and everything NOT on that list clears the body-text bar', () => {
    const known = new Set(BELOW_BODY.map(([n, bg]) => `${n}.${bg}`));
    const shortfalls: string[] = [];
    for (const name of PALETTES) {
      const p = colors[name] as Record<string, string>;
      for (const [bg, fg] of PAIRS) {
        if (known.has(`${name}.${bg}`)) continue;
        const r = contrast(p[bg]!, p[fg]!);
        if (r < BODY_FLOOR) {
          shortfalls.push(`${name}.${fg} on ${name}.${bg} = ${r.toFixed(2)}:1`);
        }
      }
    }
    // Naming the offenders in the VALUE, since Jest cannot carry a message.
    expect(shortfalls).toEqual([]);
  });
});
