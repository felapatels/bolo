import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the "Plan" stat cell in the Phrase Builder and Speed Round setup
// screens on mobile. The cell reads from useEntitlements and must show "Plus"
// when the learner is on Plus and "Free" when they are on the free plan.
// Both branches are covered so a regression surfaces immediately.
// ---------------------------------------------------------------------------

const mockState = {
  isPlus: false,
  isLoading: false,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useListCategories: () => ({ data: [{ id: 1, title: 'Basics', slug: 'basics' }], isLoading: false }),
  useListCategoryPhrases: () => ({ data: [], isLoading: false }),
  useRecordGameSession: () => ({ mutate: jest.fn() }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: () => ['progress-summary'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: mockState.isPlus, isLoading: mockState.isLoading }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    destructive: '#EF4444',
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
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const { Text, Pressable } = require('react-native');
  return {
    ChunkyButton: ({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) => (
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, onPress, style }: any) => (
      <Pressable onPress={onPress} style={style}>{children}</Pressable>
    ),
  };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: () => <View /> };
});

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('@/lib/haptics', () => ({
  hapticMedium: jest.fn(),
  hapticNotify: jest.fn(),
}));

// Import pages after all mocks.
import PhraseBuilderScreen from '@/app/(app)/(tabs)/games/phrase-builder';
import SpeedRoundScreen from '@/app/(app)/(tabs)/games/speed-round';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockState.isPlus = false;
  mockState.isLoading = false;
});

// ---------------------------------------------------------------------------
// Phrase Builder — mobile
// ---------------------------------------------------------------------------

describe('Phrase Builder setup screen — plan label (mobile)', () => {
  test('shows "Plus" when the learner is on Plus', () => {
    mockState.isPlus = true;
    render(<PhraseBuilderScreen />);

    // The stat cell for the plan shows the value above the "Plan" label.
    expect(screen.getByText('Plus')).toBeOnTheScreen();
    expect(screen.queryByText('Free')).not.toBeOnTheScreen();
  });

  test('shows "Free" during the loading window before entitlements resolve', () => {
    // isLoading=true keeps the root component from routing to the paywall,
    // which is the flash window the task guards against.
    mockState.isPlus = false;
    mockState.isLoading = true;
    render(<PhraseBuilderScreen />);

    expect(screen.getByText('Free')).toBeOnTheScreen();
    expect(screen.queryByText('Plus')).not.toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// Speed Round — mobile
// ---------------------------------------------------------------------------

describe('Speed Round setup screen — plan label (mobile)', () => {
  test('shows "Plus" when the learner is on Plus', () => {
    mockState.isPlus = true;
    render(<SpeedRoundScreen />);

    expect(screen.getByText('Plus')).toBeOnTheScreen();
    expect(screen.queryByText('Free')).not.toBeOnTheScreen();
  });

  test('shows "Free" during the loading window before entitlements resolve', () => {
    mockState.isPlus = false;
    mockState.isLoading = true;
    render(<SpeedRoundScreen />);

    expect(screen.getByText('Free')).toBeOnTheScreen();
    expect(screen.queryByText('Plus')).not.toBeOnTheScreen();
  });
});
