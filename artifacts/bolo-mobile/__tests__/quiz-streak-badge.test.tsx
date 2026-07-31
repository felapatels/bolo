// Guards that the quiz StreakBadge renders the flame + count when streak >= 1,
// stays hidden when streak is 0, and that ResultsScreen / AlreadyDoneScreen
// thread the quizStreak prop through to the badge correctly — both via direct
// component rendering and via the full BoloQuizScreen quiz-completion flow.
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ─── shared colors stub ───────────────────────────────────────────────────────
const COLORS = {
  primary: '#6C3FC5',
  foreground: '#1A1A1A',
  mutedForeground: '#888888',
  background: '#FFFFFF',
  card: '#F9F9F9',
  border: '#E0E0E0',
  muted: '#F0F0F0',
};

// ─── module mocks ─────────────────────────────────────────────────────────────

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetDailyQuiz: (_params: unknown, _opts: unknown) => mockState.quiz,
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  useCompleteDailyQuiz: () => ({ mutateAsync: mockState.complete }),
  getGetDailyQuizQueryKey: () => ['daily-quiz'],
  useGetAccount: () => ({ data: { preferences: { learning: { ttsVoice: 'auto' } } } }),
  synthesizeSpeech: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => COLORS,
}));

// Feather icons are already stubbed globally (jest-setup.js stubs @expo/vector-icons).

// Mascot just needs to render without native modules.
jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: (props: Record<string, unknown>) => React.createElement(View, props) };
});

// Screen and ChunkyButton are only used by the main BoloQuizScreen, not the
// sub-components under test — stub them lightly.
jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { ScrollView } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(ScrollView, null, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    ChunkyButton: ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, children)),
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
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
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

// Share.share is not available in the test environment; stub it.
jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({}),
}));

// ─── components under test ────────────────────────────────────────────────────
import {
  StreakBadge,
  ResultsScreen,
  AlreadyDoneScreen,
} from '../app/(app)/(tabs)/games/bolo-quiz';
import BoloQuizScreen from '@/app/(app)/(tabs)/games/bolo-quiz';

// ─── fixtures ─────────────────────────────────────────────────────────────────

/** A single MCQ question with a deterministic correct answer. */
const ONE_MCQ_QUESTION = {
  id: 'q1',
  type: 'mcq_translation' as const,
  nativeScript: 'નમસ્તે',
  romanized: 'Namaste',
  correctEnglish: 'Hello',
  distractors: ['Goodbye', 'Thank you', 'Yes'],
};

function quizQuery(data: object) {
  return { data, isLoading: false };
}

// ─── StreakBadge — unit tests ──────────────────────────────────────────────────
describe('StreakBadge', () => {
  test('renders the flame emoji and day count when streak is 1', () => {
    render(<StreakBadge streak={1} colors={COLORS} />);
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(screen.getByText('1-day streak!')).toBeTruthy();
  });

  test('renders the correct count for a multi-day streak', () => {
    render(<StreakBadge streak={7} colors={COLORS} />);
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(screen.getByText('7-day streak!')).toBeTruthy();
  });

  test('renders nothing when streak is 0', () => {
    render(<StreakBadge streak={0} colors={COLORS} />);
    expect(screen.queryByText('🔥')).toBeNull();
    expect(screen.queryByText('0-day streak!')).toBeNull();
  });

  test('renders nothing when streak is negative', () => {
    render(<StreakBadge streak={-1} colors={COLORS} />);
    expect(screen.queryByText('🔥')).toBeNull();
  });
});

// ─── ResultsScreen — unit tests ───────────────────────────────────────────────
describe('ResultsScreen', () => {
  const baseProps = {
    score: 4,
    total: 5,
    xp: 60,
    onBack: jest.fn(),
    colors: COLORS,
  };

  test('shows the streak badge when quizStreak >= 1', () => {
    render(<ResultsScreen {...baseProps} quizStreak={3} />);
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(screen.getByText('3-day streak!')).toBeTruthy();
  });

  test('hides the streak badge when quizStreak is 0', () => {
    render(<ResultsScreen {...baseProps} quizStreak={0} />);
    expect(screen.queryByText('🔥')).toBeNull();
  });

  test('renders the score and XP on screen', () => {
    render(<ResultsScreen {...baseProps} quizStreak={1} />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('+60')).toBeTruthy();
  });
});

// ─── AlreadyDoneScreen — unit tests ───────────────────────────────────────────
describe('AlreadyDoneScreen', () => {
  const baseProps = {
    score: 3,
    total: 5,
    xp: 30,
    completedAt: '2026-07-24T08:30:00Z',
    colors: COLORS,
  };

  test('shows the streak badge when quizStreak >= 1', () => {
    render(<AlreadyDoneScreen {...baseProps} quizStreak={5} />);
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(screen.getByText('5-day streak!')).toBeTruthy();
  });

  test('hides the streak badge when quizStreak is 0', () => {
    render(<AlreadyDoneScreen {...baseProps} quizStreak={0} />);
    expect(screen.queryByText('🔥')).toBeNull();
  });

  test('renders the "Already played today!" heading', () => {
    render(<AlreadyDoneScreen {...baseProps} quizStreak={2} />);
    expect(screen.getByText('Already played today!')).toBeTruthy();
  });
});

// ─── BoloQuizScreen integration — streak badge via full quiz flow ──────────────

describe('AlreadyDoneScreen streak badge (via BoloQuizScreen)', () => {
  it('shows the flame badge with the correct day count when quizStreak >= 1', async () => {
    mockState.quiz = quizQuery({
      completed: true,
      score: 4,
      total: 5,
      xpAwarded: 40,
      completedAt: new Date().toISOString(),
      quizStreak: 3,
    });

    render(<BoloQuizScreen />);

    await waitFor(() => {
      expect(screen.getByText('3-day streak!')).toBeOnTheScreen();
    });
    expect(screen.getByText('🔥')).toBeOnTheScreen();
  });

  it('shows no badge when quizStreak is 0', async () => {
    mockState.quiz = quizQuery({
      completed: true,
      score: 2,
      total: 5,
      xpAwarded: 20,
      completedAt: new Date().toISOString(),
      quizStreak: 0,
    });

    render(<BoloQuizScreen />);

    await waitFor(() => {
      expect(screen.getByText('Already played today!')).toBeOnTheScreen();
    });
    expect(screen.queryByText(/\d+-day streak!/)).toBeNull();
  });
});

describe('ResultsScreen streak badge (via BoloQuizScreen quiz completion)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows the flame badge with the correct day count when quizStreak >= 1', async () => {
    mockState.quiz = quizQuery({
      completed: false,
      questions: [ONE_MCQ_QUESTION],
    });
    mockState.complete = jest.fn(async () => ({
      score: 1,
      xpAwarded: 10,
      quizStreak: 5,
    }));

    render(<BoloQuizScreen />);

    // Wait for the playing state to render the MCQ choices
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeOnTheScreen();
    });

    // Answer the single question
    fireEvent.press(screen.getByText('Hello'));

    // Advance past the 1200ms auto-advance timer
    await act(async () => {
      jest.advanceTimersByTime(1300);
    });

    // Wait for the complete mutation to resolve and the streak to appear
    await waitFor(() => {
      expect(screen.getByText('5-day streak!')).toBeOnTheScreen();
    });
    expect(screen.getByText('🔥')).toBeOnTheScreen();
  });

  it('shows no badge when quizStreak is 0 after completing the quiz', async () => {
    mockState.quiz = quizQuery({
      completed: false,
      questions: [ONE_MCQ_QUESTION],
    });
    mockState.complete = jest.fn(async () => ({
      score: 0,
      xpAwarded: 0,
      quizStreak: 0,
    }));

    render(<BoloQuizScreen />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('Hello'));

    await act(async () => {
      jest.advanceTimersByTime(1300);
    });

    await waitFor(() => {
      expect(screen.getByText("Today's quiz complete")).toBeOnTheScreen();
    });
    expect(screen.queryByText(/\d+-day streak!/)).toBeNull();
  });
});
