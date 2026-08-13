import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// App Review, Guideline 3.1.2(c): build 34 was rejected because the paywall
// carried no Terms of Use (EULA) or privacy-policy link inside the purchase
// flow. These tests pin both links, the URLs they open, and their position
// ABOVE the purchase button so a future layout change cannot quietly push
// them out of the flow again.
// ---------------------------------------------------------------------------

const mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

const mockOpenBrowserAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowserAsync(url),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    refetchQueries: jest.fn(),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useSetChosenLanguage: () => ({ mutateAsync: jest.fn() }),
  getGetEntitlementsQueryKey: () => ['entitlements'],
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

// A real, purchasable store package: the links have to sit in the flow the
// learner actually buys through, not only in the "unavailable" state.
const pkg = (identifier: string, priceString: string) => ({
  identifier,
  product: {
    identifier,
    priceString,
    price: 9.99,
    introPrice: null,
  },
});

jest.mock('@/contexts/PurchasesContext', () => ({
  usePurchases: () => ({
    allAccessMonthly: pkg('all_access_monthly', '$9.99'),
    allAccessAnnual: pkg('all_access_annual', '$59.99'),
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

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));

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
    ChunkyButton: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return { FunFactLoader: () => <View /> };
});

// Imported after all mocks.
import PaywallScreen from '@/app/(app)/paywall';

beforeEach(() => {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockOpenBrowserAsync.mockClear();
});

describe('paywall subscription disclosure links', () => {
  test('shows a tappable Terms of Use link that opens the hosted terms', () => {
    render(<PaywallScreen />);

    const terms = screen.getByLabelText('Terms of Use');
    expect(terms).toBeOnTheScreen();

    fireEvent.press(terms);
    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync.mock.calls[0][0]).toMatch(/^https:\/\/[^/]+\/terms$/);
  });

  test('shows a tappable Privacy Policy link that opens the hosted policy', () => {
    render(<PaywallScreen />);

    const privacy = screen.getByLabelText('Privacy Policy');
    expect(privacy).toBeOnTheScreen();

    fireEvent.press(privacy);
    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync.mock.calls[0][0]).toMatch(/^https:\/\/[^/]+\/privacy$/);
  });

  test('both links render without a domain injected at build time', () => {
    // EXPO_PUBLIC_DOMAIN is absent in this environment, which is exactly the
    // build that shipped dead links. The fallback keeps them real.
    expect(process.env.EXPO_PUBLIC_DOMAIN).toBeUndefined();
    render(<PaywallScreen />);

    expect(screen.getByText('Terms of Use')).toBeOnTheScreen();
    expect(screen.getByText('Privacy Policy')).toBeOnTheScreen();
  });

  test('the links sit above the purchase button, not below it', () => {
    const { toJSON } = render(<PaywallScreen />);
    const flat = JSON.stringify(toJSON());

    const termsAt = flat.indexOf('Terms of Use');
    const privacyAt = flat.indexOf('Privacy Policy');
    const ctaAt = flat.indexOf('Start free trial');
    const subscribeAt = flat.indexOf('Subscribe');
    const buttonAt = ctaAt >= 0 ? ctaAt : subscribeAt;

    expect(termsAt).toBeGreaterThan(-1);
    expect(privacyAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeGreaterThan(-1);
    expect(termsAt).toBeLessThan(buttonAt);
    expect(privacyAt).toBeLessThan(buttonAt);
  });

  test('the price and per-unit price the rejection accepted are untouched', () => {
    render(<PaywallScreen />);

    expect(screen.getByText('$59.99')).toBeOnTheScreen();
    expect(screen.getByText('per year')).toBeOnTheScreen();
    expect(screen.getByText('$9.99')).toBeOnTheScreen();
    expect(screen.getByText('per month')).toBeOnTheScreen();
  });
});
