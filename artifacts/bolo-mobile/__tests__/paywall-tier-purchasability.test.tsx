import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
//
// Verifies the paywall resolves its tier from what the store can actually
// sell, never from the `?lang=` deep-link param alone. With no purchasable
// one_language package, arriving via `?lang=<code>` (as a locked-language tap
// does) must still render the all_access screen: all_access branding, no
// language picker, no oneLanguageBenefits copy, and a Subscribe button that
// only enables once a real package resolves.
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
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useSetChosenLanguage: () => ({ mutateAsync: jest.fn() }),
  getGetEntitlementsQueryKey: () => ['entitlements'],
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

// A minimal but realistic all-access package — the shape the component reads
// (product.priceString/currencyCode/price, no introPrice so no trial).
const allAccessMonthlyPkg = {
  identifier: 'all_access_monthly',
  product: {
    priceString: '$12.99',
    price: 12.99,
    currencyCode: 'USD',
    introPrice: null,
  },
} as any;
const allAccessAnnualPkg = {
  identifier: 'all_access_annual',
  product: {
    priceString: '$89.99',
    price: 89.99,
    currencyCode: 'USD',
    introPrice: null,
  },
} as any;

// Mutable so individual tests can flip whether a one_language package exists.
const purchasesState: {
  oneLanguageMonthly: any;
  oneLanguageAnnual: any;
  allAccessMonthly: any;
  allAccessAnnual: any;
} = {
  oneLanguageMonthly: null,
  oneLanguageAnnual: null,
  allAccessMonthly: allAccessMonthlyPkg,
  allAccessAnnual: allAccessAnnualPkg,
};

jest.mock('@/contexts/PurchasesContext', () => ({
  usePurchases: () => ({
    allAccessMonthly: purchasesState.allAccessMonthly,
    allAccessAnnual: purchasesState.allAccessAnnual,
    oneLanguageMonthly: purchasesState.oneLanguageMonthly,
    oneLanguageAnnual: purchasesState.oneLanguageAnnual,
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
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    languages: [
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
    ],
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
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!disabled }}
        onPress={disabled ? undefined : onPress}
      >
        <Text>{title}</Text>
      </Pressable>
    ),
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
  for (const key of Object.keys(mockParams)) {
    delete mockParams[key];
  }
  purchasesState.oneLanguageMonthly = null;
  purchasesState.oneLanguageAnnual = null;
  purchasesState.allAccessMonthly = allAccessMonthlyPkg;
  purchasesState.allAccessAnnual = allAccessAnnualPkg;
});

describe('PaywallScreen tier resolution (no one_language offering)', () => {
  test('a locked-language deep link (?lang=gu) renders all_access branding, not One Language', () => {
    mockParams.lang = 'gu';

    render(<PaywallScreen />);

    expect(screen.getByText('Bolo! All-Access')).toBeOnTheScreen();
    expect(screen.queryByText('One Language')).not.toBeOnTheScreen();
    expect(
      screen.getByText('Learn faster, in every language'),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText('Go all-in on one language'),
    ).not.toBeOnTheScreen();
  });

  test('no language picker or oneLanguageBenefits copy renders for a locked-language deep link', () => {
    mockParams.lang = 'gu';

    render(<PaywallScreen />);

    // The picker's entry point / hint text.
    expect(
      screen.queryByText('Your language (locked in once you subscribe)'),
    ).not.toBeOnTheScreen();
    expect(screen.queryByText('Choose a language')).not.toBeOnTheScreen();
    // oneLanguageBenefits copy is keyed off the chosen language name; the
    // generic fallback title is a stable enough handle when none is chosen.
    expect(
      screen.queryByText('One language + Hindi'),
    ).not.toBeOnTheScreen();
    // All-access benefits should render instead.
    expect(screen.getByText('Every language')).toBeOnTheScreen();
  });

  test('with no ?lang= param, all_access still renders (unchanged default)', () => {
    render(<PaywallScreen />);

    expect(screen.getByText('Bolo! All-Access')).toBeOnTheScreen();
    expect(screen.queryByText('One Language')).not.toBeOnTheScreen();
  });

  test('the Subscribe button is enabled once a real all_access package resolves', () => {
    mockParams.lang = 'gu';

    render(<PaywallScreen />);

    // Prices exist with no introPrice, so trialLabel is null and the CTA
    // reads "Subscribe" — assert on whichever title actually rendered.
    const cta =
      screen.queryByLabelText('Subscribe') ??
      screen.queryByLabelText('Start free trial');
    expect(cta).toBeTruthy();
    expect(cta).not.toBeDisabled();
  });

  test('the Subscribe button is disabled (never tappable) when no package exists at all', () => {
    mockParams.lang = 'gu';
    purchasesState.allAccessMonthly = null;
    purchasesState.allAccessAnnual = null;

    render(<PaywallScreen />);

    // With hasOfferings false, the CTA and its packages aren't rendered at
    // all — the "not available in this build" fallback shows instead, which
    // is itself a safe (non-tappable-and-inert) state.
    expect(
      screen.getByText('Subscriptions aren’t available in this build yet. Check back soon.'),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Subscribe')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Start free trial')).not.toBeOnTheScreen();
  });
});

describe('PaywallScreen tier resolution (one_language offering IS configured)', () => {
  test('a locked-language deep link still preselects One Language when it is purchasable', () => {
    mockParams.lang = 'gu';
    purchasesState.oneLanguageMonthly = {
      identifier: 'one_language_monthly',
      product: { priceString: '$6.99', price: 6.99, currencyCode: 'USD', introPrice: null },
    } as any;

    render(<PaywallScreen />);

    // Purchasable in both tiers + a deep link — the harmless preselection
    // documented in the fix is preserved. "One Language" renders in more
    // than one place (brand header + tier card), so assert at least one.
    expect(screen.getAllByText('One Language').length).toBeGreaterThan(0);
  });
});
