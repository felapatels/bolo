import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// R3 (32.1): order_words quiz tiles show a romanized subtitle under the
// native-script word, fed by the server's index-aligned tileRomanizations.
// Pins:
//  - every tile with a non-empty romanization renders it as a subtitle;
//  - empty-string entries (uncovered scripts) render NO subtitle line;
//  - quizzes stored before the field shipped (no tileRomanizations) render
//    tiles exactly as before, without crashing;
//  - neither the tile text nor the subtitle carries numberOfLines, so
//    nothing can truncate at standard or large accessibility text sizes.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetDailyQuiz: () => mockState.quiz,
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  useCompleteDailyQuiz: () => ({ mutateAsync: jest.fn() }),
  getGetDailyQuizQueryKey: () => ['daily-quiz'],
  useGetAccount: () => ({ data: { preferences: { learning: { ttsVoice: 'auto' } } } }),
  synthesizeSpeech: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
    muted: '#F0F0F0',
  }),
}));

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, null) };
});

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    ChunkyButton: ({ onPress, title }: { onPress: () => void; title: string }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, title)),
  };
});

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(),
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

jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({}),
}));

// Imported after mocks.
import BoloQuizScreen from '@/app/(app)/(tabs)/games/bolo-quiz';

const ORDER_QUESTION = {
  type: 'order_words' as const,
  phraseId: 7,
  nativeScript: 'તમને કેમ છે',
  romanized: 'tamne kem che',
  english: 'How are you?',
  tiles: ['છે', 'તમને', 'કેમ'],
  tileRomanizations: ['che', 'tamne', 'kem'],
};

function setQuiz(questions: object[]) {
  mockState.quiz = { data: { completed: false, questions }, isLoading: false };
}

const renderOrderScreen = async () => {
  render(<BoloQuizScreen />);
  await waitFor(() => expect(screen.getByText('Order the Words')).toBeTruthy());
};

describe('order-words tile romanized subtitles (R3)', () => {
  it('renders each tile with its aligned romanized subtitle', async () => {
    setQuiz([ORDER_QUESTION]);
    await renderOrderScreen();

    for (const [tile, sub] of [['છે', 'che'], ['તમને', 'tamne'], ['કેમ', 'kem']] as const) {
      expect(screen.getByText(tile)).toBeOnTheScreen();
      expect(screen.getByText(sub)).toBeOnTheScreen();
    }
  });

  it('empty-string romanizations render no subtitle line', async () => {
    setQuiz([{ ...ORDER_QUESTION, tileRomanizations: ['', 'tamne', ''] }]);
    await renderOrderScreen();

    expect(screen.getByText('tamne')).toBeOnTheScreen();
    expect(screen.queryByText('che')).toBeNull();
    expect(screen.queryByText('kem')).toBeNull();
  });

  it('legacy stored quizzes without tileRomanizations render plain tiles', async () => {
    const { tileRomanizations: _omitted, ...legacy } = ORDER_QUESTION;
    setQuiz([legacy]);
    await renderOrderScreen();

    expect(screen.getByText('છે')).toBeOnTheScreen();
    expect(screen.queryByText('che')).toBeNull();
    expect(screen.queryByText('tamne')).toBeNull();
  });

  it('tile text and subtitle never truncate (no numberOfLines)', async () => {
    setQuiz([ORDER_QUESTION]);
    await renderOrderScreen();

    expect(screen.getByText('તમને').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('tamne').props.numberOfLines).toBeUndefined();
  });
});
