// The language picker wears each language's RAIL LINE ACCENT — the same colour
// that language's boarding pass and journey map use (lib/journeyLines.ts).
// These tests pin the join: the stub stripe on every tile carries that
// language's accent, and the SELECTED tile is outlined in its own accent
// rather than the theme primary. If the accent table and the picker ever drift
// apart, a learner picks one colour and travels on another.

import React from 'react';
import { render } from '@testing-library/react-native';
import { JOURNEY_LINES } from '@/lib/journeyLines';

const mockState: Record<string, any> = {
  activeLang: 'hi',
  isLanguageAllowed: (_code: string) => true,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  // The picker gained useFocusEffect on 2026-08-28 to clear the search box when
  // the modal is reopened; it is a modal ROUTE that stays mounted, so without
  // that reset a learner who searched "guj", closed and reopened found the box
  // still holding it. Running the callback once on mount is the closest a test
  // renderer gets to a focus, and it is what the screen needs here: the initial
  // load of the recent-languages list rides in the same effect.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(cb, [cb]);
  },
}));

// hi (active), gu, ta (locked) — three different lines, three different
// accents, covering every tile branch.
const LANGUAGES = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'Devanagari',
    fontFamily: 'Noto Sans Devanagari',
    rtl: false,
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    script: 'Gujarati',
    fontFamily: 'Noto Sans Gujarati',
    rtl: false,
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    script: 'Tamil',
    fontFamily: 'Noto Sans Tamil',
    rtl: false,
  },
];

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    languages: LANGUAGES,
    activeLang: mockState.activeLang,
    adoptLanguageLocally: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    isLanguageAllowed: (code: string) => mockState.isLanguageAllowed(code),
  }),
}));

const COLORS = {
  foreground: '#1A1A1A',
  mutedForeground: '#6B7280',
  background: '#FAFAF7',
  card: '#FFFFFF',
  border: '#E5E7EB',
  muted: '#F3F4F6',
  primary: '#6C3FC5',
  gold: '#D4A017',
};

jest.mock('@/hooks/useColors', () => ({
  useColors: () => COLORS,
}));

jest.mock('@/constants/fonts', () => {
  const AppFonts = {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  };
  return {
    AppFonts,
    isTallCascadingScript: () => false,
    nativeTextStyle: () => ({ fontFamily: AppFonts.bold }),
  };
});

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View testID="screen">{children}</View>
    ),
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return { FunFactLoader: () => <View testID="fun-fact-loader" /> };
});

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));

jest.mock('@/lib/language-step', () => ({
  useExplicitLanguageChoice: () => ({ choose: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  ANALYTICS_EVENTS: { LANGUAGE_SELECTED: 'language_selected' },
}));

import LanguageModal from '@/app/(app)/language';

function flatten(style: any): Record<string, any> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === 'object' ? style : {};
}

beforeEach(() => {
  mockState.activeLang = 'hi';
  mockState.isLanguageAllowed = (code: string) => code !== 'ta';
});

describe('language picker line accents', () => {
  test('every tile wears its own line accent, locked ones included', () => {
    const { getByTestId } = render(<LanguageModal />);

    for (const code of ['hi', 'gu', 'ta']) {
      const rail = getByTestId(`lang-rail-${code}`);
      expect(flatten(rail.props.style).backgroundColor).toBe(
        JOURNEY_LINES[code].accent,
      );
    }

    // Three languages, three DISTINCT colours — a single shared accent would
    // satisfy the loop above while defeating the whole point.
    const accents = new Set(
      ['hi', 'gu', 'ta'].map((c) => JOURNEY_LINES[c].accent),
    );
    expect(accents.size).toBe(3);
  });

  test('the selected tile is outlined in its own accent, not the theme primary', () => {
    const { getByLabelText, rerender } = render(<LanguageModal />);

    const hindiTile = flatten(getByLabelText('Hindi').props.style);
    expect(hindiTile.borderColor).toBe(JOURNEY_LINES.hi.accent);
    expect(hindiTile.borderColor).not.toBe(COLORS.primary);
    expect(hindiTile.backgroundColor).toBe(`${JOURNEY_LINES.hi.accent}14`);

    // An unselected tile keeps the neutral card treatment; only the stripe
    // shows its colour.
    const gujaratiTile = flatten(getByLabelText('Gujarati').props.style);
    expect(gujaratiTile.borderColor).toBe(COLORS.border);
    expect(gujaratiTile.backgroundColor).toBe(COLORS.card);

    // Switching the active language moves the accent outline with it.
    mockState.activeLang = 'gu';
    rerender(<LanguageModal />);
    expect(flatten(getByLabelText('Gujarati').props.style).borderColor).toBe(
      JOURNEY_LINES.gu.accent,
    );
    expect(flatten(getByLabelText('Hindi').props.style).borderColor).toBe(
      COLORS.border,
    );
  });

  test('a locked tile is muted; an unlocked one is not', () => {
    // The fixture in this file hardcodes its own palette, so this asserts a
    // DIFFERENCE between two tiles rather than a value. Its
    // isLanguageAllowed fixture locks 'ta'.
    const { getByLabelText, getByText, getByTestId } = render(<LanguageModal />);

    // Locked Tamil vs unlocked Gujarati: different backgroundColor.
    const tamil = flatten(
      getByLabelText('Tamil — locked, preview its journey').props.style,
    );
    const gujarati = flatten(getByLabelText('Gujarati').props.style);
    expect(tamil.backgroundColor).not.toBe(gujarati.backgroundColor);
    expect(tamil.backgroundColor).toBe(COLORS.muted);
    expect(gujarati.backgroundColor).toBe(COLORS.card);

    // The native name dims with it; the English name below was already muted
    // on every tile, locked or not.
    expect(flatten(getByText('தமிழ்').props.style).color).not.toBe(
      flatten(getByText('ગુજરાતી').props.style).color,
    );

    // The RAIL is unaffected: both still carry their own accent. Dimming the
    // stripe would take away the one thing inviting a preview tap.
    expect(flatten(getByTestId('lang-rail-ta').props.style).backgroundColor).toBe(
      JOURNEY_LINES.ta.accent,
    );
    expect(flatten(getByTestId('lang-rail-gu').props.style).backgroundColor).toBe(
      JOURNEY_LINES.gu.accent,
    );
  });
});
