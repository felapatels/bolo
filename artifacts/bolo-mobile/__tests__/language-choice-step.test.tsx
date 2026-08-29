/**
 * B1 parity — the full-screen choose-language step and the picker modal flag:
 *
 *  • The step lists every language with NO lock badging (no PlusPill), shows
 *    the listening-only badge only for speechCapability === 'unsupported',
 *    and renders the community-reviewed footnote.
 *  • Picking a language sends ONE PATCH carrying activeLanguage AND
 *    hasChosenLanguage: true, then lands on home.
 *  • Skip sets the in-memory session flag (nothing server-side) and continues
 *    to home.
 *  • An explicit pick in the existing language picker modal sends the same
 *    combined PATCH.
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import {
  hasSkippedLanguageStep,
  resetLanguageStepSkipForTests,
} from '@/lib/language-step';

const mockState = {
  mutate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  adoptLanguageLocally: jest.fn(),
  /** The route's search params; { next: 'welcome' } inside the walkthrough. */
  params: {} as Record<string, string>,
};

const LANGUAGES = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'Devanagari',
    rtl: false,
    communityReviewed: false,
    speechCapability: 'supported',
  },
  {
    code: 'mni',
    name: 'Manipuri',
    nativeName: 'ꯃꯤꯇꯩ ꯂꯣꯟ',
    script: 'Meitei Mayek',
    rtl: false,
    communityReviewed: true,
    speechCapability: 'unsupported',
  },
  {
    code: 'ks',
    name: 'Kashmiri',
    nativeName: 'كٲشُر',
    script: 'Nastaliq',
    rtl: true,
    communityReviewed: true,
    speechCapability: 'degraded',
  },
];

jest.mock('@workspace/api-client-react', () => ({
  // Added 2026-08-28: practice and review headers now show a Chai balance
  // beside the XP meter, so this screen reads the tokens query. Same
  // shape every other Chai surface gets.
  useGetTokens: () => ({ data: { balance: 23 }, isLoading: false, isError: false, refetch: jest.fn() }),
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useUpdateAccountPreferences: () => ({ mutate: mockState.mutate }),
  getGetAccountQueryKey: () => ['account'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => undefined),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  // Added 2026-08-28: the language picker clears its search on FOCUS, because
  // it is a modal route that stays mounted between openings. Running the
  // callback once on mount is the closest a test renderer gets to a focus.
  useFocusEffect: (cb) => { const R = require('react'); R.useEffect(cb, [cb]); },
  useRouter: () => ({
    replace: mockState.replace,
    push: jest.fn(),
    back: mockState.back,
  }),
  // Build 19: the chooser reads ?next=welcome to continue to the cards.
  useLocalSearchParams: () => mockState.params,
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    languages: LANGUAGES,
    activeLang: 'hi',
    adoptLanguageLocally: mockState.adoptLanguageLocally,
    setActiveLang: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isLanguageAllowed: () => true }),
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return { FunFactLoader: () => <View testID="fun-fact-loader" /> };
});

jest.mock('@/components/PlusUpsell', () => {
  const { View } = require('react-native');
  return { PlusPill: () => <View testID="plus-pill" /> };
});

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  isTallCascadingScript: () => false,
  nativeTextStyle: () => ({}),
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  ANALYTICS_EVENTS: { LANGUAGE_SELECTED: 'language_selected' },
}));

import ChooseLanguageScreen from '@/app/(app)/choose-language';
import LanguageModal from '@/app/(app)/language';

beforeEach(() => {
  resetLanguageStepSkipForTests();
  mockState.mutate = jest.fn();
  mockState.replace = jest.fn();
  mockState.back = jest.fn();
  mockState.adoptLanguageLocally = jest.fn();
  mockState.params = {};
});

describe('ChooseLanguageScreen', () => {
  test('lists all languages with no lock badging and the community footnote', () => {
    render(<ChooseLanguageScreen />);

    for (const l of LANGUAGES) {
      expect(screen.getByTestId(`choose-lang-${l.code}`)).toBeTruthy();
      expect(screen.getByText(l.nativeName)).toBeTruthy();
    }
    expect(screen.queryByTestId('plus-pill')).toBeNull();
    expect(screen.getByTestId('community-note')).toBeTruthy();
  });

  test('listening-only badge appears only for unsupported speech capability', () => {
    render(<ChooseLanguageScreen />);

    expect(screen.getByTestId('listening-badge-mni')).toBeTruthy();
    // Supported and degraded languages render without the badge.
    expect(screen.queryByTestId('listening-badge-hi')).toBeNull();
    expect(screen.queryByTestId('listening-badge-ks')).toBeNull();
  });

  test('picking sends one PATCH with activeLanguage + hasChosenLanguage and lands on home', async () => {
    render(<ChooseLanguageScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('choose-lang-hi'));
    });

    expect(mockState.mutate).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockState.mutate.mock.calls[0];
    expect(payload).toEqual({
      data: { activeLanguage: 'hi', hasChosenLanguage: true },
    });

    // Simulate mutation success → local adopt + navigate home.
    await act(async () => {
      opts.onSuccess({ preferences: { learning: {} } });
    });
    expect(mockState.adoptLanguageLocally).toHaveBeenCalledWith('hi');
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/(tabs)');
  });

  test('skip sets the session flag, writes nothing, and continues to home', async () => {
    render(<ChooseLanguageScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('skip-language-step'));
    });

    expect(hasSkippedLanguageStep()).toBe(true);
    expect(mockState.mutate).not.toHaveBeenCalled();
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/(tabs)');
  });

  // Build 19: opened as step one of the first-run walkthrough, the step
  // continues to the cards instead of home, whichever way it is left.
  test('as walkthrough step one (?next=welcome), a pick continues to the cards', async () => {
    mockState.params = { next: 'welcome' };
    render(<ChooseLanguageScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('choose-lang-hi'));
    });
    const [, opts] = mockState.mutate.mock.calls[0];
    await act(async () => {
      opts.onSuccess({ preferences: { learning: {} } });
    });
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/welcome');
  });

  test('as walkthrough step one, skip continues to the cards too', async () => {
    mockState.params = { next: 'welcome' };
    render(<ChooseLanguageScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('skip-language-step'));
    });
    expect(hasSkippedLanguageStep()).toBe(true);
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/welcome');
  });
});

describe('LanguageModal explicit pick', () => {
  test('also sends hasChosenLanguage: true via the shared helper', async () => {
    render(<LanguageModal />);

    await act(async () => {
      fireEvent.press(screen.getByText('हिन्दी'));
    });

    expect(mockState.adoptLanguageLocally).toHaveBeenCalledWith('hi');
    expect(mockState.mutate).toHaveBeenCalledTimes(1);
    expect(mockState.mutate.mock.calls[0][0]).toEqual({
      data: { activeLanguage: 'hi', hasChosenLanguage: true },
    });
    expect(mockState.back).toHaveBeenCalled();
  });
});
