// Guards the retake affordance on the Progress screen's practice-history list.
//
// Two scenarios:
//   1. A history row with valid categoryId + phraseId shows the retake icon and
//      calls router.push with the correct URL when tapped.
//   2. A history row with null categoryId or null phraseId renders as a plain
//      (non-pressable) View — no retake icon and no onPress handler fires.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Attempt } from '@workspace/api-client-react';

// ─── mutable mock state ───────────────────────────────────────────────────────
const mockState: Record<string, any> = {
  push: jest.fn(),
  attempts: { data: [], isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() },
  summary: {
    phrasesMastered: 0,
    totalPhrases: 0,
    totalAttempts: 0,
    bestScore: 0,
    currentStreakDays: 0,
  },
};

// ─── module mocks ─────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockState.push, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetProgressSummary: () => ({
    data: mockState.summary,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress', 'summary']),
  useListRecentAttempts: () => mockState.attempts,
  useListBadges: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    primaryForeground: '#FFFFFF',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
    muted: '#E5E5E5',
    success: '#22C55E',
    gold: '#F59E0B',
    accent: '#EC4899',
    secondary: '#7C3AED',
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Feather: ({ name, testID }: { name: string; testID?: string }) => (
      <Text testID={testID ?? `icon-${name}`}>{name}</Text>
    ),
  };
});

jest.mock('@/lib/entrance', () => ({
  // The safe entrances (lib/entrance.ts). No-ops here: these suites pin
  // content, and an entrance that returns undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
  appear: (v: unknown) => v,
  useAppearSkip: () => true,
}));

// Override the global reanimated mock (declared in jest-setup.js) to force
// useReducedMotion → true.  This makes both the Stat count-up and ProgressTrack
// fill skip their RNAnimated.timing calls entirely, preventing animation timers
// from outliving the test and triggering the "Jest environment torn down"
// ReferenceError from RN's jest/setup.js.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const RN = require('react-native');

  const passthrough = (Base: React.ComponentType) =>
    React.forwardRef(function AnimatedMock(
      { entering: _e, exiting: _x, layout: _l, ...props }: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      return React.createElement(Base as React.ComponentType, { ...props, ref });
    });

  const chain: unknown = new Proxy(function () {}, {
    get: () => () => chain,
    apply: () => chain,
  });

  const Animated = {
    View: passthrough(RN.View),
    Text: passthrough(RN.Text),
    ScrollView: passthrough(RN.ScrollView),
    Image: passthrough(RN.Image),
    createAnimatedComponent: (Base: React.ComponentType) => passthrough(Base),
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    FadeInDown: chain,
    FadeIn: chain,
    FadeOut: chain,
    FadeInUp: chain,
    FadeOutUp: chain,
    ZoomIn: chain,
    ZoomOut: chain,
    SlideInUp: chain,
    SlideOutUp: chain,
    Easing: new Proxy({}, { get: () => () => 0 }),
    interpolateColor: () => 'transparent',
    // true → Stat and ProgressTrack skip RNAnimated.timing, no dangling timers.
    useReducedMotion: () => true,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedRef: () => ({ current: null }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    useAnimatedProps: (fn: unknown) =>
      typeof fn === 'function' ? (fn as () => unknown)() : {},
    useAnimatedReaction: () => {},
    interpolate: () => 0,
    runOnJS: (fn: unknown) => fn,
    runOnUI: (fn: unknown) => fn,
  };
});


jest.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: () => ({ isIdle: false, onActivity: jest.fn() }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true }),
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

jest.mock('@/lib/ui', () => ({
  scoreColor: (_score: number, colors: any) => colors.success,
}));

jest.mock('@/components/Screen', () => {
  const { ScrollView } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <ScrollView>{children}</ScrollView>
    ),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: (props: object) => <View {...props} /> };
});

jest.mock('@/components/GlobeButton', () => {
  const { View } = require('react-native');
  return { GlobeButton: (props: object) => <View {...props} /> };
});

jest.mock('@/components/NextBadgeSpotlight', () => {
  const { View } = require('react-native');
  return { NextBadgeSpotlight: (props: object) => <View {...props} /> };
});

jest.mock('@/components/PlusUpsell', () => {
  const { View } = require('react-native');
  return { LockedFeatureCard: (props: object) => <View {...props} /> };
});

jest.mock('@/components/SkeletonCard', () => {
  const { View } = require('react-native');
  return { SkeletonCard: (props: object) => <View {...props} /> };
});

// PressableScale must forward onPress so fireEvent.press reaches the handler.
jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({
      children,
      onPress,
      style,
      accessibilityRole,
      accessibilityLabel,
      accessibilityHint,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      style?: object;
      accessibilityRole?: string;
      accessibilityLabel?: string;
      accessibilityHint?: string;
    }) => (
      <Pressable
        onPress={onPress}
        style={style}
        accessibilityRole={accessibilityRole as any}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </Pressable>
    ),
  };
});

// Imported after all mocks are declared.
import ProgressScreen from '@/app/(app)/(tabs)/progress';

// ─── helpers ─────────────────────────────────────────────────────────────────

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 1,
    phraseId: null,
    categoryId: null,
    languageCode: 'gu',
    nativeScript: 'નમસ્તે',
    romanized: 'Namaste',
    english: 'Hello',
    transcript: 'namaste',
    score: 80,
    passed: true,
    feedback: 'Good job!',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function attemptsQuery(items: Attempt[]) {
  return {
    data: items,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.push = jest.fn();
  mockState.attempts = attemptsQuery([]);
  mockState.summary = {
    phrasesMastered: 0,
    totalPhrases: 0,
    totalAttempts: 0,
    bestScore: 0,
    currentStreakDays: 0,
  };
});

// Task #1057: the Progress-tab stat grid is FOUR cards, matching the
// four-card loading skeleton above it. Speaking streak is still tracked and
// still returned by the server (`speakingStreakDays`), but the owner ruled it
// is not worth a permanent tile, so it has no display here.
describe('progress stat grid', () => {
  test('renders exactly the four summary stats, with no speaking streak', () => {
    mockState.summary = {
      phrasesMastered: 8,
      totalPhrases: 40,
      totalAttempts: 31,
      bestScore: 92,
      currentStreakDays: 3,
      // Still on the payload — the display is what was removed.
      speakingStreakDays: 2,
    };

    render(<ProgressScreen />);

    for (const label of [
      'Phrases mastered',
      'Total practices',
      'Best score',
      'Day streak',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/speaking streak/i)).toBeNull();

    // Each remaining stat still shows its own value…
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    // …and the speaking-streak value is nowhere on the grid.
    expect(screen.queryByText('2')).toBeNull();

    // The removed stat was the grid's second `mic` icon; Total practices keeps
    // the only one.
    expect(screen.getAllByTestId('icon-mic')).toHaveLength(1);
  });
});

describe('progress history retake navigation', () => {
  test('tapping a row with valid categoryId and phraseId calls router.push with the correct URL', () => {
    mockState.attempts = attemptsQuery([
      attempt({ id: 42, categoryId: 7, phraseId: 99, english: 'Hello' }),
    ]);

    render(<ProgressScreen />);

    // The retake icon must be present for this row.
    expect(screen.getByTestId('icon-refresh-cw')).toBeTruthy();

    // Tap the row (identified by its accessibility label).
    fireEvent.press(screen.getByRole('button', { name: 'Retake Hello' }));

    expect(mockState.push).toHaveBeenCalledTimes(1);
    expect(mockState.push).toHaveBeenCalledWith('/(app)/practice/7?phrase=99');
  });

  test('constructs the URL with the correct categoryId and phraseId for each row', () => {
    mockState.attempts = attemptsQuery([
      attempt({ id: 1, categoryId: 3, phraseId: 15, english: 'Goodbye' }),
      attempt({ id: 2, categoryId: 8, phraseId: 27, english: 'Thank you' }),
    ]);

    render(<ProgressScreen />);

    // Tap second row.
    fireEvent.press(screen.getByRole('button', { name: 'Retake Thank you' }));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/practice/8?phrase=27');

    mockState.push.mockClear();

    // Tap first row.
    fireEvent.press(screen.getByRole('button', { name: 'Retake Goodbye' }));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/practice/3?phrase=15');
  });
});

describe('progress history rows with null categoryId or phraseId', () => {
  test('a row with null categoryId has no retake icon and is not pressable', () => {
    mockState.attempts = attemptsQuery([
      attempt({ id: 10, categoryId: null, phraseId: 5, english: 'Yes' }),
    ]);

    render(<ProgressScreen />);

    // No retake (refresh-cw) icon.
    expect(screen.queryByTestId('icon-refresh-cw')).toBeNull();

    // No pressable button for this row.
    expect(screen.queryByRole('button', { name: 'Retake Yes' })).toBeNull();

    // router.push must never have been called.
    expect(mockState.push).not.toHaveBeenCalled();
  });

  test('a row with null phraseId has no retake icon and is not pressable', () => {
    mockState.attempts = attemptsQuery([
      attempt({ id: 11, categoryId: 3, phraseId: null, english: 'No' }),
    ]);

    render(<ProgressScreen />);

    expect(screen.queryByTestId('icon-refresh-cw')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retake No' })).toBeNull();
    expect(mockState.push).not.toHaveBeenCalled();
  });

  test('a row with both null categoryId and null phraseId is not pressable', () => {
    mockState.attempts = attemptsQuery([
      attempt({ id: 12, categoryId: null, phraseId: null, english: 'Maybe' }),
    ]);

    render(<ProgressScreen />);

    expect(screen.queryByTestId('icon-refresh-cw')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retake Maybe' })).toBeNull();
    expect(mockState.push).not.toHaveBeenCalled();
  });

  test('mixed rows: only rows with valid ids are pressable', () => {
    mockState.attempts = attemptsQuery([
      attempt({ id: 20, categoryId: 5, phraseId: 50, english: 'Water' }),
      attempt({ id: 21, categoryId: null, phraseId: 51, english: 'Fire' }),
      attempt({ id: 22, categoryId: 6, phraseId: null, english: 'Earth' }),
      attempt({ id: 23, categoryId: 7, phraseId: 55, english: 'Air' }),
    ]);

    render(<ProgressScreen />);

    // Two valid rows → two refresh-cw icons.
    const icons = screen.getAllByTestId('icon-refresh-cw');
    expect(icons).toHaveLength(2);

    // Only valid rows have retake buttons.
    expect(screen.getByRole('button', { name: 'Retake Water' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retake Air' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retake Fire' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retake Earth' })).toBeNull();

    // Tapping valid rows routes to the right URLs.
    fireEvent.press(screen.getByRole('button', { name: 'Retake Water' }));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/practice/5?phrase=50');

    mockState.push.mockClear();

    fireEvent.press(screen.getByRole('button', { name: 'Retake Air' }));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/practice/7?phrase=55');
  });
});
