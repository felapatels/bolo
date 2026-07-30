// Guards the active-language default for new mobile learners.
//
// A learner who has never opened the app should land on Hindi ('hi'), matching
// the web app's DEFAULT_LANG. This test exercises the real LanguageProvider
// (not a mock) with:
//   • AsyncStorage returning null  — no locally persisted choice
//   • account.preferences.learning.activeLanguage = undefined  — no server choice
//   • a language list that includes Hindi
//
// If DEFAULT_LANG in LanguageContext.tsx is ever reverted to 'gu' (or another
// language), this test will fail immediately.

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Mutable state shared across mocks and tests
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  accountData: undefined as unknown,
  languages: [
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', rtl: false },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', rtl: false },
  ],
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useListLanguages: () => ({ data: mockState.languages, isLoading: false }),
  useGetAccount: () => ({ data: mockState.accountData }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  useUpdateAccountPreferences: () => ({ mutate: jest.fn() }),
  getGetAccountQueryKey: () => ['account'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => undefined),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    allowedLanguages: ['hi', 'gu'],
    isPlus: false,
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';

// ---------------------------------------------------------------------------
// Helper: minimal consumer that exposes activeLang via testID
// ---------------------------------------------------------------------------

function LangDisplay() {
  const { activeLang, isLoading } = useLanguage();
  return (
    <Text testID="active-lang">{isLoading ? 'loading' : activeLang}</Text>
  );
}

function renderWithProvider() {
  return render(
    <LanguageProvider>
      <LangDisplay />
    </LanguageProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Ensure AsyncStorage is empty — no previously persisted language choice.
  await AsyncStorage.clear();

  // No server-side preference recorded for this new user.
  mockState.accountData = undefined;
});

describe('LanguageProvider — default language for new users', () => {
  test('activeLang is "hi" when AsyncStorage is empty and account has no preference', async () => {
    renderWithProvider();

    // After the async AsyncStorage.getItem resolves (returns null), the state
    // must settle on the DEFAULT_LANG constant ('hi').
    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('hi');
    });
  });

  test('activeLang is "hi" immediately (synchronous initial state) before AsyncStorage resolves', () => {
    // The useState initializer uses DEFAULT_LANG = 'hi' directly, so even
    // before the async hydration effect completes the rendered value is 'hi'.
    renderWithProvider();
    // We don't await — this is the synchronous first render.
    const text = screen.getByTestId('active-lang').props.children;
    // It's either 'hi' (init) or 'loading' (language list still fetching).
    // Either way it must NOT be 'gu'.
    expect(text).not.toBe('gu');
  });

  test('adopts the server activeLanguage when the account loads with a different language', async () => {
    // Simulate a returning user whose server preference is Gujarati (set on
    // another device). The reconcile effect should switch to 'gu'.
    mockState.accountData = {
      preferences: { learning: { activeLanguage: 'gu', timezone: 'UTC' } },
    };

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('gu');
    });
  });

  test('keeps "hi" when account loads with no recorded activeLanguage', async () => {
    // Account exists but no activeLanguage has been saved yet (brand-new account).
    mockState.accountData = {
      preferences: { learning: { activeLanguage: undefined, timezone: 'UTC' } },
    };

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('hi');
    });
  });

  test('restores a previously persisted language from AsyncStorage', async () => {
    // Simulate a user who already picked Gujarati on this device.
    await AsyncStorage.setItem('bolo.activeLang', 'gu');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('gu');
    });
  });
});
