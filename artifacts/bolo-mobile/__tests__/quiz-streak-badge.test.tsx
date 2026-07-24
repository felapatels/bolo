// Guards that the quiz StreakBadge renders the flame + count when streak >= 1,
// stays hidden when streak is 0, and that ResultsScreen / AlreadyDoneScreen
// thread the quizStreak prop through to the badge correctly.
import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ─── shared colors stub ───────────────────────────────────────────────────────
const COLORS = {
  primary: '#6C3FC5',
  foreground: '#1A1A1A',
  mutedForeground: '#888888',
  background: '#FFFFFF',
  card: '#F8F8F8',
  border: '#E0E0E0',
  muted: '#F0F0F0',
};

// ─── module mocks ─────────────────────────────────────────────────────────────

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
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    TAB_BAR_CLEARANCE: 80,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChunkyButton: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ activeLang: 'gujarati', activeLanguage: { name: 'Gujarati' } }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetDailyQuiz: () => ({ data: undefined, isLoading: true }),
  useCompleteDailyQuiz: () => ({ mutateAsync: jest.fn() }),
  getGetDailyQuizQueryKey: () => ['quiz'],
  synthesizeSpeech: jest.fn(),
}));

jest.mock('@/lib/audio', () => ({ playBase64Audio: jest.fn() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: { bold: 'System', regular: 'System' },
}));

// ─── components under test ────────────────────────────────────────────────────
import {
  StreakBadge,
  ResultsScreen,
  AlreadyDoneScreen,
} from '../app/(app)/(tabs)/games/bolo-quiz';

// ─── helpers ─────────────────────────────────────────────────────────────────
// Share.share is not available in the test environment; stub it.
jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({}),
}));

// ─── StreakBadge ──────────────────────────────────────────────────────────────
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

// ─── ResultsScreen ────────────────────────────────────────────────────────────
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

// ─── AlreadyDoneScreen ────────────────────────────────────────────────────────
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
