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
  // The paywall reads the wallet for the monthly-chai figure on the
  // All-Access benefit list (2026-08-27). Undefined data is the honest
  // default here: it is what a caller sees before the query lands, and the
  // benefit row is built to drop out rather than render a blank number.
  useGetTokens: () => ({ data: undefined, isLoading: false }),
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

// The two exact, owner-verified URLs. Pinned whole-string: a substitution (the
// app's own /terms page, a shortener, a redirect, a dev domain) is the
// rejection, so a pattern match would not be pinning anything that matters.
const APPLE_STANDARD_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_POLICY_URL = 'https://bolo-india.app/privacy';

describe('paywall subscription disclosure links', () => {
  test("shows a tappable Terms of Use link that opens Apple's Standard EULA", () => {
    render(<PaywallScreen />);

    const terms = screen.getByLabelText('Terms of Use');
    expect(terms).toBeOnTheScreen();

    fireEvent.press(terms);
    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync.mock.calls[0][0]).toBe(APPLE_STANDARD_EULA_URL);
  });

  test('shows a tappable Privacy Policy link that opens the published policy', () => {
    render(<PaywallScreen />);

    const privacy = screen.getByLabelText('Privacy Policy');
    expect(privacy).toBeOnTheScreen();

    fireEvent.press(privacy);
    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync.mock.calls[0][0]).toBe(PRIVACY_POLICY_URL);
  });

  test('both links use the exact URLs with no domain injected at build time', () => {
    // EXPO_PUBLIC_DOMAIN is absent in this environment, which is exactly the
    // build that shipped unreliable links. Both URLs are hardcoded literals,
    // so they are byte-identical in every build.
    expect(process.env.EXPO_PUBLIC_DOMAIN).toBeUndefined();
    render(<PaywallScreen />);

    expect(screen.getByText('Terms of Use')).toBeOnTheScreen();
    expect(screen.getByText('Privacy Policy')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Terms of Use'));
    fireEvent.press(screen.getByLabelText('Privacy Policy'));
    expect(mockOpenBrowserAsync.mock.calls.map((c) => c[0])).toEqual([
      APPLE_STANDARD_EULA_URL,
      PRIVACY_POLICY_URL,
    ]);
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

// The two disclosure URLs are the exact ones App Review checks, so they must
// survive whatever host the build environment resolved. scripts/build.js
// injects REPLIT_INTERNAL_APP_DOMAIN / REPLIT_DEV_DOMAIN / EXPO_PUBLIC_DOMAIN,
// which in this workspace is a *.replit.dev domain.
describe('legal URLs are pinned literals, not build-time domains', () => {
  const original = process.env.EXPO_PUBLIC_DOMAIN;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
    else process.env.EXPO_PUBLIC_DOMAIN = original;
  });

  const loadLegal = () => {
    let mod: typeof import('@/lib/legal');
    jest.isolateModules(() => {
      mod = require('@/lib/legal');
    });
    return mod!;
  };

  test('with no domain injected', () => {
    delete process.env.EXPO_PUBLIC_DOMAIN;
    const legal = loadLegal();
    expect(legal.TERMS_OF_USE_URL).toBe(APPLE_STANDARD_EULA_URL);
    expect(legal.PRIVACY_POLICY_URL_ALWAYS).toBe(PRIVACY_POLICY_URL);
  });

  test('with a build host injected', () => {
    process.env.EXPO_PUBLIC_DOMAIN = 'some-build-host.replit.dev';
    const legal = loadLegal();
    expect(legal.TERMS_OF_USE_URL).toBe(APPLE_STANDARD_EULA_URL);
    expect(legal.PRIVACY_POLICY_URL_ALWAYS).toBe(PRIVACY_POLICY_URL);
  });

  test('the other uses of the injected domain are left alone', () => {
    process.env.EXPO_PUBLIC_DOMAIN = 'some-build-host.replit.dev';
    const legal = loadLegal();
    // The home screen's privacy link still follows the build environment and
    // still disappears when nothing was injected.
    expect(legal.PRIVACY_POLICY_URL).toBe('https://some-build-host.replit.dev/privacy');
    delete process.env.EXPO_PUBLIC_DOMAIN;
    expect(loadLegal().PRIVACY_POLICY_URL).toBeUndefined();
  });
});
