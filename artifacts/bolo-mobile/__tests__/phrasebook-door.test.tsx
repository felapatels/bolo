import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Task #906: the home topic grid moved behind a Phrasebook door card, and the
// full library lives on the /(app)/phrasebook screen.
//
// Home contract:
//  1. The door card renders (title + subtitle) and opens /(app)/phrasebook.
//  2. The chip row deep-links the first three topics into their category
//     screen, shows mastered/total only once mastery has started, and
//     collapses the rest into a "+N more" chip that opens the Phrasebook.
//  3. The old "Topics" grid is gone from home (no 4th topic, no grid header).
//
// Phrasebook screen contract:
//  4. Every topic renders as a card that opens /(app)/category/:id.
//  5. Opening the screen fires phrasebook_opened exactly once.
//  6. An empty library shows the empty note.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
const mockTrack = jest.fn();

const CATS = [
  { id: 1, title: 'Greetings & Manners', titleNative: null, iconName: 'HandHeart', accent: null, phraseCount: 5, masteredCount: 2 },
  { id: 2, title: 'Family', titleNative: null, iconName: 'Users', accent: null, phraseCount: 6, masteredCount: 0 },
  { id: 3, title: 'Numbers 1-10', titleNative: null, iconName: 'Hash', accent: null, phraseCount: 10, masteredCount: 0 },
  { id: 4, title: 'Food & Eating', titleNative: null, iconName: 'Utensils', accent: null, phraseCount: 7, masteredCount: 1 },
];

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Priya' } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockState.push, back: mockState.back, replace: jest.fn() }),
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
  useListCategories: () => mockState.categories,
  useListRecentAttempts: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useGetDailyQuiz: () => ({ data: undefined, isLoading: false }),
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
  return { SkeletonCard: () => React.createElement(View, { testID: 'skeleton' }) };
});

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, onPress, style, ...rest }: any) =>
      React.createElement(Pressable, { onPress, style, ...rest }, children),
  };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: false, isLoading: false, dailyNewLessons: null }),
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
  scoreColor: () => '#10B981',
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

jest.mock('@/components/journey/JourneyPassCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { JourneyPassCard: () => React.createElement(View, { testID: 'journey-pass' }) };
});

jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  trackOnce: jest.fn(),
  initAnalytics: jest.fn(),
  identifyUser: jest.fn(),
}));

// Imported after all mocks.
import HomeScreen from '../app/(app)/(tabs)/index';
import PhrasebookScreen from '../app/(app)/phrasebook';

beforeEach(() => {
  mockState.push = jest.fn();
  mockState.back = jest.fn();
  mockState.categories = {
    data: [...CATS],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  };
  mockTrack.mockClear();
});

describe('HomeScreen - Phrasebook door replaces the topic grid', () => {
  it('renders the door card and opens the Phrasebook', () => {
    render(<HomeScreen />);

    expect(screen.getByText('Phrasebook')).toBeOnTheScreen();
    expect(screen.getByText('Browse and practice any topic')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Open the Phrasebook'));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/phrasebook');
  });

  it('chips deep-link the first three topics; mastery shows only once started', () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByLabelText('Open the Greetings & Manners topic'));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/category/1');

    expect(screen.getByText('Family')).toBeOnTheScreen();
    expect(screen.getByText('Numbers 1-10')).toBeOnTheScreen();
    // Greetings has mastery underway: 2/5. Family has none: no 0/6 anywhere.
    expect(screen.getByText('2/5')).toBeOnTheScreen();
    expect(screen.queryByText('0/6')).toBeNull();
  });

  it('collapses extra topics into a +N more chip that opens the Phrasebook', () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByText('+1 more'));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/phrasebook');
    // The 4th topic itself is NOT on home anymore (grid removed).
    expect(screen.queryByText('Food & Eating')).toBeNull();
    expect(screen.queryByText('Topics')).toBeNull();
  });

  it('home does not fire phrasebook_opened', () => {
    render(<HomeScreen />);
    const fired = mockTrack.mock.calls.map((c) => c[0]);
    expect(fired).not.toContain('phrasebook_opened');
  });
});

describe('PhrasebookScreen - the full topic library', () => {
  it('lists every topic and opens its category screen', () => {
    render(<PhrasebookScreen />);

    for (const cat of CATS) {
      expect(screen.getByText(cat.title)).toBeOnTheScreen();
    }
    fireEvent.press(screen.getByText('Food & Eating'));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/category/4');
  });

  it('fires phrasebook_opened exactly once on mount', () => {
    render(<PhrasebookScreen />);

    const fired = mockTrack.mock.calls.filter((c) => c[0] === 'phrasebook_opened');
    expect(fired).toHaveLength(1);
    expect(fired[0]![1]).toMatchObject({ language: 'gu' });
  });

  it('shows the empty note when no topics exist', () => {
    mockState.categories = {
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    };
    render(<PhrasebookScreen />);

    expect(
      screen.getByText('No topics available for this language yet.'),
    ).toBeOnTheScreen();
  });
});
