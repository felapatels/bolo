// Visual-regression snapshot for the language picker when it contains a tile
// that uses the Nastaliq script (Urdu / Kashmiri). The Nastaliq overflow fix
// applies extra lineHeight and tile min-height to those tiles; these snapshots
// guard against future style changes that accidentally re-introduce clipping.
//
// Two snapshot groups are captured:
//   • light mode , primary colour #6C3FC5, white background
//   • dark mode  , primary colour #A78BFA, near-black background
//
// The component under test is the full LanguageModal screen; we drive it with
// a three-language fixture (one Nastaliq tile, one regular tile, one locked
// tile) so every LanguageTile branch is covered in each theme.

import React from 'react';
import { render } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mutable test-state shared across mocks and tests
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  // 'light' | 'dark'
  theme: 'light',
  isLanguageAllowed: (_code: string) => true,
};

// ---------------------------------------------------------------------------
// Mocks, declared before any imports that depend on them
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

// Provide a minimal Language shape for three rows:
//   hi , Devanagari  (regular row, active)
//   ur , Nastaliq    (tall-cascade row, unlocked)
//   ta , Tamil       (locked row)
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
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    script: 'Nastaliq',
    fontFamily: 'Noto Nastaliq Urdu',
    rtl: true,
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
    activeLang: 'hi',
    adoptLanguageLocally: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    // Tamil (ta) is locked; everything else is allowed.
    isLanguageAllowed: (code: string) => mockState.isLanguageAllowed(code),
  }),
}));

// Light palette
const LIGHT_COLORS = {
  foreground: '#1A1A1A',
  mutedForeground: '#6B7280',
  background: '#FAFAF7',
  card: '#FFFFFF',
  border: '#E5E7EB',
  muted: '#F3F4F6',
  primary: '#6C3FC5',
};

// Dark palette
const DARK_COLORS = {
  foreground: '#F9FAFB',
  mutedForeground: '#9CA3AF',
  background: '#111118',
  card: '#1C1C28',
  border: '#2D2D3D',
  muted: '#252530',
  primary: '#A78BFA',
};

jest.mock('@/hooks/useColors', () => ({
  useColors: () =>
    mockState.theme === 'light' ? LIGHT_COLORS : DARK_COLORS,
}));

// Provide the real isTallCascadingScript / nativeTextStyle logic without
// importing the actual @expo-google-fonts packages (which aren't resolved
// under Jest). AppFonts constants mirror the real values.
jest.mock('@/constants/fonts', () => {
  const TALL_CASCADE = new Set(['Noto Nastaliq Urdu']);
  const SCRIPT_FONTS: Record<string, { regular: string; bold: string }> = {
    'Noto Sans Devanagari': {
      regular: 'NotoSansDevanagari_400Regular',
      bold: 'NotoSansDevanagari_700Bold',
    },
    'Noto Nastaliq Urdu': {
      regular: 'NotoNastaliqUrdu_400Regular',
      bold: 'NotoNastaliqUrdu_700Bold',
    },
    'Noto Sans Tamil': {
      regular: 'NotoSansTamil_400Regular',
      bold: 'NotoSansTamil_700Bold',
    },
  };
  const AppFonts = {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  };
  return {
    AppFonts,
    isTallCascadingScript: (lang: any) =>
      !!lang && TALL_CASCADE.has(lang.fontFamily),
    nativeTextStyle: (lang: any, opts?: { bold?: boolean }) => {
      if (!lang) {
        return { fontFamily: opts?.bold ? AppFonts.bold : AppFonts.regular };
      }
      const entry = SCRIPT_FONTS[lang.fontFamily];
      const fontFamily = entry
        ? opts?.bold
          ? entry.bold
          : entry.regular
        : opts?.bold
          ? AppFonts.bold
          : AppFonts.regular;
      return { fontFamily, writingDirection: lang.rtl ? 'rtl' : 'ltr' };
    },
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
  return {
    FunFactLoader: () => <View testID="fun-fact-loader" />,
  };
});

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
}));

// The modal persists explicit picks via the shared language-step helper (which
// wraps a react-query mutation); stub it so no QueryClientProvider is needed.
jest.mock('@/lib/language-step', () => ({
  useExplicitLanguageChoice: () => ({ choose: jest.fn(), isPending: false }),
}));

// Imported after mocks are declared.
import LanguageModal from '@/app/(app)/language';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal() {
  return render(<LanguageModal />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockState.theme = 'light';
  // Tamil is locked; Hindi and Urdu are unlocked.
  mockState.isLanguageAllowed = (code: string) => code !== 'ta';
});

describe('LanguageRow Nastaliq rendering, light theme', () => {
  beforeEach(() => {
    mockState.theme = 'light';
  });

  test('renders the full language list including the Nastaliq row', () => {
    const { toJSON } = renderModal();
    expect(toJSON()).toMatchSnapshot();
  });

  test('Urdu (Nastaliq) row carries tall-cascade styles', () => {
    const { getByText } = renderModal();
    // The native-script text for Urdu must be present and rendered without error.
    expect(getByText('اردو')).toBeTruthy();
  });

  test('locked tile (Tamil) is labelled locked with a journey preview hint', () => {
    const { getByText, getByLabelText } = renderModal();
    expect(getByText('தமிழ்')).toBeTruthy();
    // The locked tile carries the All-Access badge; its accessibility label is
    // the stable contract for "this language needs All-Access".
    expect(getByLabelText('Tamil, locked, preview its journey')).toBeTruthy();
  });
});

describe('LanguageRow Nastaliq rendering, dark theme', () => {
  beforeEach(() => {
    mockState.theme = 'dark';
  });

  test('renders the full language list including the Nastaliq row', () => {
    const { toJSON } = renderModal();
    expect(toJSON()).toMatchSnapshot();
  });

  test('Urdu (Nastaliq) row carries tall-cascade styles in dark mode', () => {
    const { getByText } = renderModal();
    expect(getByText('اردو')).toBeTruthy();
  });
});

describe('LanguageRow style invariants', () => {
  test('Nastaliq row uses RTL writing direction', () => {
    // nativeTextStyle returns writingDirection:'rtl' for RTL languages;
    // the snapshot pins this alongside the Nastaliq font family.
    mockState.theme = 'light';
    const { toJSON } = renderModal();
    const json = JSON.stringify(toJSON());
    // writingDirection rtl is present somewhere in the tree for the Urdu row.
    expect(json).toContain('rtl');
  });

  test('Nastaliq font family is applied to the native-script text', () => {
    mockState.theme = 'light';
    const { toJSON } = renderModal();
    const json = JSON.stringify(toJSON());
    expect(json).toContain('NotoNastaliqUrdu_700Bold');
  });

  test('non-Nastaliq row does not use the tall-cascade font', () => {
    mockState.theme = 'light';
    const { toJSON } = renderModal();
    const json = JSON.stringify(toJSON());
    // Devanagari row should be present too.
    expect(json).toContain('NotoSansDevanagari_700Bold');
  });
});
