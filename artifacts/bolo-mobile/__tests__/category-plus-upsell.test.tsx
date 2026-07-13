import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  type Category,
  type Phrase,
} from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Mocks
//
// Drives the real topic screen (app/(app)/category/[id].tsx) so the actual
// LockedPhrasesCard upsell wiring is exercised. Data hooks, the router, and the
// two contexts the screen reads (language + entitlements) are stubbed so each
// test shapes the exact server response / plan the screen sees. The upsell card
// itself renders for real — that's what we're guarding.
//
// Prefixed `mock*` so the hoisted jest.mock factories may reference them.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  categories: undefined,
  phrases: undefined,
  isPlus: false,
  params: { id: '5' },
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => ({ push: mockState.push, back: mockState.back }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Defined inside the factory so it's the exact class the screen narrows on
  // with `err instanceof ApiError`.
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super('ApiError');
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
  useListCategories: () => mockState.categories,
  useListCategoryPhrases: () => mockState.phrases,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: mockState.isPlus }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  }),
}));

// Keep the font registry from pulling in every @expo-google-fonts package.
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
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    TAB_BAR_CLEARANCE: 0,
  };
});

// Imported after the mocks are declared.
import CategoryScreen from '@/app/(app)/category/[id]';

// -------------------------------- fixtures --------------------------------

function successQuery(data: unknown, extra?: Record<string, unknown>) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...extra,
  };
}

function makeCategory(overrides?: Partial<Category>): Category {
  return {
    id: 5,
    slug: 'greetings',
    title: 'Greetings',
    description: 'Everyday hellos and goodbyes.',
    iconName: 'sun',
    accent: '#f59e0b',
    sortOrder: 0,
    titleNative: 'अभिवादन',
    phraseCount: 5,
    masteredCount: 1,
    lockedPhraseCount: 0,
    ...overrides,
  };
}

const samplePhrase = {
  id: 1,
  categoryId: 5,
  languageCode: 'hi',
  nativeScript: 'नमस्ते',
  romanized: 'namaste',
  english: 'hello',
  hint: null,
  difficulty: 1,
  sortOrder: 0,
  mastered: false,
  bestScore: null,
} as unknown as Phrase;

beforeEach(() => {
  mockState.isPlus = false;
  mockState.params = { id: '5' };
  mockState.push = jest.fn();
  mockState.back = jest.fn();
  mockState.phrases = successQuery([samplePhrase]);
  mockState.categories = successQuery([makeCategory()]);
});

describe('Plus phrase upsell on the topic screen', () => {
  test('shows the upsell to a free learner using the server-reported locked count', () => {
    // The server reports 7 additional (Plus-only) phrases for this topic.
    mockState.isPlus = false;
    mockState.categories = successQuery([
      makeCategory({ lockedPhraseCount: 7 }),
    ]);

    render(<CategoryScreen />);

    // The count is driven straight off the server response, not hardcoded.
    expect(
      screen.getByRole('button', { name: '7 more phrases with Plus' }),
    ).toBeOnTheScreen();
  });

  test('renders the count the server sends (not a fixed number)', () => {
    // A different server count must produce a different label — proves the
    // upsell reflects the real reported value.
    mockState.isPlus = false;
    mockState.categories = successQuery([
      makeCategory({ lockedPhraseCount: 3 }),
    ]);

    render(<CategoryScreen />);

    expect(
      screen.getByRole('button', { name: '3 more phrases with Plus' }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: /7 more phrases/ }),
    ).not.toBeOnTheScreen();
  });

  test('hides the upsell from a Plus subscriber even if a count is present', () => {
    // A Plus learner already has the extended library; the server sends 0, but
    // even a stray non-zero count must stay hidden for Plus.
    mockState.isPlus = true;
    mockState.categories = successQuery([
      makeCategory({ lockedPhraseCount: 7 }),
    ]);

    render(<CategoryScreen />);

    expect(
      screen.queryByRole('button', { name: /more phrase(s)? with Plus/ }),
    ).not.toBeOnTheScreen();
  });

  test('shows no upsell to a free learner when there are no locked phrases', () => {
    mockState.isPlus = false;
    mockState.categories = successQuery([
      makeCategory({ lockedPhraseCount: 0 }),
    ]);

    render(<CategoryScreen />);

    expect(
      screen.queryByRole('button', { name: /more phrase(s)? with Plus/ }),
    ).not.toBeOnTheScreen();
  });

  test('tapping the upsell routes the learner to the paywall', () => {
    mockState.isPlus = false;
    mockState.categories = successQuery([
      makeCategory({ lockedPhraseCount: 4 }),
    ]);

    render(<CategoryScreen />);

    fireEvent.press(
      screen.getByRole('button', { name: '4 more phrases with Plus' }),
    );

    expect(mockState.push).toHaveBeenCalledWith('/(app)/paywall');
  });
});
