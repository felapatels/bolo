import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
//
// Drives the real practice screen (app/(app)/practice/[id].tsx) to guard the
// phrase-card deep link: tapping a phrase card on the category screen pushes
// `/practice/:id?phrase=<phraseId>`, and the session must start at exactly
// that phrase. Also guards the fallback (unknown/missing id -> first phrase)
// and that a mid-session refetch does not yank the learner back to the
// starting phrase.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  phrases: undefined,
  params: { id: '5' },
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => ({
    push: mockState.push,
    back: mockState.back,
    replace: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
    // Tests that use instanceof ApiError need the local class reference.
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
    useSynthesizeSpeech: () => ({
      // Never settles: the auto-play coach effect stays pending so it can't
      // trigger state updates outside act() after a test finishes.
      mutateAsync: jest.fn(() => new Promise(() => {})),
    }),
    useEvaluatePronunciation: () => ({ mutateAsync: jest.fn() }),
    useCreateAttempt: () => ({ mutateAsync: jest.fn() }),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
  }),
  useAudioRecorderState: () => ({}),
}));

jest.mock('@/lib/audio', () => ({
  meteringToAmplitude: (db: number) => Math.min(1, Math.max(0, (db + 50) / 50)),
  prepareRecordingSession: jest.fn(),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: jest.fn(),
  playBase64Audio: jest.fn(),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
}));

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
    RAISED_PARROT_CLEARANCE: 0,
  };
});

// Rendering-heavy celebration components aren't under test — keep them inert.
jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: (props: object) => <View {...props} /> };
});
jest.mock('@/components/Confetti', () => {
  const { View } = require('react-native');
  return { Confetti: (props: object) => <View {...props} /> };
});
jest.mock('@/components/BadgeUnlock', () => {
  const { View } = require('react-native');
  return { BadgeUnlock: (props: object) => <View {...props} /> };
});

// Imported after the mocks are declared.
import PracticeScreen from '@/app/(app)/practice/[id]';

function phrase(id: number) {
  return {
    id,
    nativeScript: `native-${id}`,
    romanized: `roman-${id}`,
    english: `english-${id}`,
    hint: null,
    premium: false,
    mastered: false,
    bestScore: null,
  };
}

function successQuery(data: unknown) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  };
}

const PHRASES = [phrase(11), phrase(12), phrase(13), phrase(14)];

beforeEach(() => {
  mockState.push = jest.fn();
  mockState.back = jest.fn();
  mockState.phrases = successQuery(PHRASES);
  mockState.params = { id: '5' };
});

describe('practice deep link via ?phrase=', () => {
  test('starts the session at the tapped phrase', () => {
    mockState.params = { id: '5', phrase: '13' };

    render(<PracticeScreen />);

    expect(screen.getByText('3 of 4')).toBeOnTheScreen();
    expect(screen.getByText('native-13')).toBeOnTheScreen();
    expect(screen.queryByText('native-11')).not.toBeOnTheScreen();
  });

  test('an unknown phrase id falls back to the first phrase', () => {
    mockState.params = { id: '5', phrase: '999' };

    render(<PracticeScreen />);

    expect(screen.getByText('1 of 4')).toBeOnTheScreen();
    expect(screen.getByText('native-11')).toBeOnTheScreen();
  });

  test('a missing phrase param starts at the first phrase', () => {
    render(<PracticeScreen />);

    expect(screen.getByText('1 of 4')).toBeOnTheScreen();
    expect(screen.getByText('native-11')).toBeOnTheScreen();
  });

  test('a non-numeric phrase param starts at the first phrase', () => {
    mockState.params = { id: '5', phrase: 'abc' };

    render(<PracticeScreen />);

    expect(screen.getByText('1 of 4')).toBeOnTheScreen();
  });

  test('starting phrase applies once the list finishes loading', () => {
    // First render happens while phrases are still loading — the deep link
    // must still land on the tapped phrase once data arrives.
    mockState.params = { id: '5', phrase: '12' };
    mockState.phrases = {
      ...successQuery(undefined),
      isLoading: true,
      isSuccess: false,
    };

    const view = render(<PracticeScreen />);
    expect(screen.queryByText('native-12')).not.toBeOnTheScreen();

    mockState.phrases = successQuery(PHRASES);
    view.rerender(<PracticeScreen />);

    expect(screen.getByText('2 of 4')).toBeOnTheScreen();
    expect(screen.getByText('native-12')).toBeOnTheScreen();
  });

  test('a mid-session refetch does not yank the learner back to the starting phrase', () => {
    mockState.params = { id: '5', phrase: '13' };

    const view = render(<PracticeScreen />);
    expect(screen.getByText('native-13')).toBeOnTheScreen();

    // Simulate a refetch delivering a fresh array reference (e.g. after an
    // attempt invalidates the phrases query). The start param must not
    // re-apply — even though the effect re-runs with a new list.
    mockState.phrases = successQuery(PHRASES.map((p) => ({ ...p })));
    view.rerender(<PracticeScreen />);

    expect(screen.getByText('native-13')).toBeOnTheScreen();
    expect(screen.getByText('3 of 4')).toBeOnTheScreen();
  });
});
