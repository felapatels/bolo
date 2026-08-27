import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
//
// Drives PaywallScreen in isolation to verify that the contextual trial
// banner ("You qualify for a 7-day free trial") appears when the learner
// arrives via ?reason=daily_lesson_limit, and is absent for other reasons or
// no reason at all.
// ---------------------------------------------------------------------------

const mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), refetchQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // The paywall reads the wallet for the monthly-chai figure on the
  // All-Access benefit list (2026-08-27). Undefined is what a caller sees
  // before the query lands, and the benefit row drops out rather than
  // rendering a blank number.
  useGetTokens: () => ({ data: undefined, isLoading: false }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useSetChosenLanguage: () => ({ mutateAsync: jest.fn() }),
  getGetEntitlementsQueryKey: () => ['entitlements'],
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

jest.mock('@/contexts/PurchasesContext', () => ({
  usePurchases: () => ({
    allAccessMonthly: null,
    allAccessAnnual: null,
    oneLanguageMonthly: null,
    oneLanguageAnnual: null,
    isConfigured: true,
    isReady: true,
    isPurchasing: false,
    isRestoring: false,
    purchase: jest.fn(),
    restore: jest.fn(),
  }),
  isTestPurchaseRuntime: () => false,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    plan: 'free',
    isPlus: false,
    isOneLanguage: false,
    chosenLanguage: null,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
    languages: [{ code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' }],
  }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
    muted: '#F0F0F0',
    gold: '#F59E0B',
    success: '#22C55E',
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
  isTallCascadingScript: () => false,
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
}));

jest.mock('@/components/Screen', () => {
  const { ScrollView } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <ScrollView>{children}</ScrollView>
    ),
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const { Pressable, Text } = require('react-native');
  return {
    ChunkyButton: ({
      title,
      onPress,
    }: {
      title: string;
      onPress: () => void;
    }) => <Pressable onPress={onPress}><Text>{title}</Text></Pressable>,
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return {
    FunFactLoader: () => <View />,
  };
});

// Imported after all mocks.
import PaywallScreen from '@/app/(app)/paywall';

beforeEach(() => {
  // Reset params to a clean state before each test.
  for (const key of Object.keys(mockParams)) {
    delete mockParams[key];
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaywallScreen trial banner', () => {
  test('shows the trial banner when reason=daily_lesson_limit', () => {
    mockParams.reason = 'daily_lesson_limit';

    render(<PaywallScreen />);

    // The bold inner text node is the clearest handle for the banner.
    expect(screen.getByText('7-day free trial')).toBeOnTheScreen();
    // The surrounding prose should also be present.
    expect(screen.getByText(/You qualify for a/)).toBeOnTheScreen();
  });

  test('does not show the trial banner when no reason param is present', () => {
    // mockParams is empty — no reason key.

    render(<PaywallScreen />);

    expect(screen.queryByText('7-day free trial')).not.toBeOnTheScreen();
    expect(screen.queryByText(/You qualify for a/)).not.toBeOnTheScreen();
  });

  test('does not show the trial banner when reason=language_locked', () => {
    mockParams.reason = 'language_locked';

    render(<PaywallScreen />);

    expect(screen.queryByText('7-day free trial')).not.toBeOnTheScreen();
    expect(screen.queryByText(/You qualify for a/)).not.toBeOnTheScreen();
  });
});
