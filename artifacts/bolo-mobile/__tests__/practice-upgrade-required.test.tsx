import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
//
// Drives the real practice screen (app/(app)/practice/[id].tsx) to guard the
// 402 "upgrade_required" branch: a Free learner who hits the daily lesson
// limit (or a locked language) must land on the full-screen upgrade prompt
// that routes to the paywall — never the misleading "No phrases to practice
// here yet." note. Non-402 failures must keep the retry screen.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  phrases: undefined,
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({
    push: mockState.push,
    back: mockState.back,
    replace: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super('ApiError');
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
  useListCategoryPhrases: () => mockState.phrases,
  // Sentence stage is disabled unless ?stage=sentences, which these suites don't use.
  useListCategorySentences: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  }),
  getListCategorySentencesQueryKey: () => ['sentences'],
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn() }),
  useEvaluatePronunciation: () => ({ mutateAsync: jest.fn() }),
  useCreateAttempt: () => ({ mutateAsync: jest.fn() }),
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
  }),
}));

jest.mock('@/lib/audio', () => ({
  prepareRecordingSession: jest.fn(),
  stopAndReadRecording: jest.fn(),
  playBase64Audio: jest.fn(),
  RECORDING_PRESET: {},
}));

// UpgradeRequiredScreen renders PlusPill from PlusUpsell, which imports the
// entitlements context (and through it @clerk/expo's native module) — stub it.
jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: false, isOneLanguage: false }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    TAB_BAR_CLEARANCE: 0,
  };
});

// Imported after the mocks are declared.
import PracticeScreen from '@/app/(app)/practice/[id]';
import { ApiError } from '@workspace/api-client-react';

function errorQuery(error: unknown) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    isFetching: false,
    error,
    refetch: jest.fn(),
  };
}

function upgrade402(overrides?: Record<string, unknown>) {
  return new (ApiError as unknown as new (s: number, d: unknown) => Error)(
    402,
    {
      error: 'upgrade_required',
      upgradeRequired: true,
      reason: 'daily_lesson_limit',
      message: "You've used today's free lessons. Upgrade for unlimited practice.",
      feature: null,
      requiredPlan: 'plus',
      ...overrides,
    },
  );
}

beforeEach(() => {
  mockState.push = jest.fn();
  mockState.back = jest.fn();
});

describe('402 upgrade_required on the practice screen', () => {
  test('daily lesson limit shows the upgrade screen, not the empty-phrases note', () => {
    mockState.phrases = errorQuery(upgrade402());

    render(<PracticeScreen />);

    expect(
      screen.getByText("You've hit today's free lessons"),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "You've used today's free lessons. Upgrade for unlimited practice.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText('No phrases to practice here yet.'),
    ).not.toBeOnTheScreen();
  });

  test('tapping the upgrade CTA routes to the paywall', () => {
    mockState.phrases = errorQuery(upgrade402());

    render(<PracticeScreen />);

    fireEvent.press(screen.getByText('Unlock with Plus'));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/paywall',
    });
  });

  test('a locked language unlockable by One-Language pre-picks it on the paywall', () => {
    mockState.phrases = errorQuery(
      upgrade402({
        reason: 'language_locked',
        message: 'Gujarati is locked on the Free plan.',
        feature: 'allLanguages',
        requiredPlan: 'one_language',
      }),
    );

    render(<PracticeScreen />);

    expect(screen.getByText('Unlock this language')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Unlock with Plus'));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/paywall',
      params: { lang: 'gu' },
    });
  });

  test('a non-402 failure still shows the retry screen, not the paywall', () => {
    mockState.phrases = errorQuery(
      new (ApiError as unknown as new (s: number, d: unknown) => Error)(502, {
        error: 'generation_failed',
      }),
    );

    render(<PracticeScreen />);

    expect(screen.getByText(/try again/i)).toBeOnTheScreen();
    expect(screen.queryByText('Unlock with Plus')).not.toBeOnTheScreen();
  });
});
