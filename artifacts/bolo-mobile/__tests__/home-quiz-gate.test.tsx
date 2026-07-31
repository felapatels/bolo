import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the fail-closed quiz gate on the HomeScreen (Build 30 batch 3).
//
// While the subscription status is loading or undefined, the Bolo Quiz card
// must render the LOCKED teaser, never the unlocked state. Only a resolved
// isPlus === true unlocks it.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Priya' } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => { cb(); },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) =>
    React.createElement(View, props, children);
  return {
    __esModule: true,
    default: passthrough,
    Svg: passthrough,
    G: passthrough,
    Path: passthrough,
    Circle: passthrough,
    Rect: passthrough,
    Ellipse: passthrough,
    Line: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
  };
});

jest.mock('@/lib/entrance', () => ({
  appear: (v: unknown) => v,
  useAppearSkip: () => true,
}));

jest.mock('@workspace/api-client-react', () => ({
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetProgressSummary: () => ({
    data: { attemptsToday: 3, currentStreakDays: 3, xp: 120, phrasesMastered: 8 },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress', 'summary']),
  useListCategories: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useListRecentAttempts: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useGetDailyQuiz: () => mockState.quiz,
  useGetAccount: () => ({ data: { preferences: { learning: { dailyGoal: 10 } } }, isLoading: false }),
  useListReviewPhrases: () => ({ data: [] }),
  useListIncomingFriendRequests: () => ({ data: [] }),
  getGetDailyQuizQueryKey: () => ['quiz'],
  getListReviewPhrasesQueryKey: () => ['review'],
}));

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, {}, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, {}) };
});

jest.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: () => ({ isIdle: false, onActivity: jest.fn() }),
}));

jest.mock('@/components/SkeletonCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SkeletonCard: () => React.createElement(View, {}) };
});

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: object }) =>
      React.createElement(Pressable, { onPress, style }, children),
  };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => mockState.entitlements,
}));

jest.mock('@/components/PlusUpsell', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { UpgradeBanner: () => React.createElement(View, {}) };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    primaryForeground: '#fff',
    secondary: '#0D9488',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    destructive: '#EF4444',
    destructiveForeground: '#fff',
    success: '#10B981',
    successForeground: '#fff',
    gold: '#D4A017',
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
  isTallCascadingScript: () => false,
}));

jest.mock('@/lib/ui', () => ({
  categoryIcon: () => 'book',
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

jest.mock('@/lib/legal', () => ({
  openPrivacyPolicy: jest.fn(),
  PRIVACY_POLICY_URL: 'https://example.com/privacy',
}));

jest.mock('@/components/Confetti', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Confetti: () => React.createElement(View, { testID: 'confetti' }) };
});

jest.mock('@/components/NamePromptCard', () => ({
  NamePromptCard: () => null,
}));

// Imported after all mocks.
import HomeScreen from '../app/(app)/(tabs)/index';

const LOCKED_COPY = 'Upgrade to All-Access to unlock';
const UNLOCKED_COPY = 'Fresh questions, every day';

beforeEach(() => {
  mockState.quiz = { data: undefined, isLoading: false };
  mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
});

describe('HomeScreen - Bolo Quiz card fails closed', () => {
  it('renders the locked teaser while entitlements are still loading, even if isPlus is already true', () => {
    mockState.entitlements = { isPlus: true, isLoading: true, dailyNewLessons: null };
    render(<HomeScreen />);

    expect(screen.getByText(LOCKED_COPY)).toBeOnTheScreen();
    expect(screen.queryByText(UNLOCKED_COPY)).toBeNull();
  });

  it('renders the locked teaser when isPlus is undefined', () => {
    mockState.entitlements = { isPlus: undefined, isLoading: false, dailyNewLessons: null };
    render(<HomeScreen />);

    expect(screen.getByText(LOCKED_COPY)).toBeOnTheScreen();
    expect(screen.queryByText(UNLOCKED_COPY)).toBeNull();
  });

  it('unlocks only once entitlements have resolved to Plus', () => {
    mockState.entitlements = { isPlus: true, isLoading: false, dailyNewLessons: null };
    mockState.quiz = { data: { completed: false, quizStreak: 0 }, isLoading: false };
    render(<HomeScreen />);

    expect(screen.getByText(UNLOCKED_COPY)).toBeOnTheScreen();
    expect(screen.queryByText(LOCKED_COPY)).toBeNull();
  });

  it('uses the Bolo Quiz name on the card, not Daily Quiz', () => {
    mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
    render(<HomeScreen />);

    expect(screen.getByText('Bolo Quiz')).toBeOnTheScreen();
    expect(screen.queryByText('Daily Quiz')).toBeNull();
  });
});
