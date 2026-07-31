// Guards the Spec D1b-M showroom invariant: a supported-but-LOCKED active
// language must survive in LanguageContext. The old auto-revert guard used to
// bounce any non-allowed language back to the first allowed one, which made
// the locked-language showroom (journey preview + locked home banner)
// unreachable — the context would silently flip back before the screens could
// render. Only genuinely UNSUPPORTED codes (not in the language list at all)
// may fall back to the default.
//
// Exercises the real LanguageProvider (not a mock) with:
//   • an entitlements state where ONLY Hindi is allowed
//   • a language list containing Hindi and Tamil (Tamil = supported, locked)

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
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', script: 'Tamil', rtl: false },
  ],
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
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
  };
});;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => undefined),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    // Free plan: only Hindi is allowed. Tamil is supported but locked.
    allowedLanguages: ['hi'],
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
  await AsyncStorage.clear();
  mockState.accountData = undefined;
});

describe('LanguageProvider — locked language adoption (showroom mode)', () => {
  test('a persisted supported-but-locked language survives (no auto-revert)', async () => {
    // The learner picked Tamil (locked on the free plan) on this device to
    // browse its journey showroom. Reopening the app must keep Tamil active.
    await AsyncStorage.setItem('bolo.activeLang', 'ta');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('ta');
    });

    // And it must STAY 'ta' — the old auto-revert bug flipped back to the
    // first allowed language a tick after entitlements resolved. Give any
    // stray reconcile effects a chance to run, then re-assert.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('active-lang').props.children).toBe('ta');
  });

  test('a server-side supported-but-locked activeLanguage is adopted and kept', async () => {
    // Same learner on a fresh device: the server remembers Tamil.
    mockState.accountData = {
      preferences: { learning: { activeLanguage: 'ta', timezone: 'UTC' } },
    };

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('ta');
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('active-lang').props.children).toBe('ta');
  });

  test('an UNSUPPORTED persisted code still falls back to the default language', async () => {
    // 'xx' is not in the language list at all — this is the only case where
    // falling back is correct (e.g. a language was withdrawn from the app).
    await AsyncStorage.setItem('bolo.activeLang', 'xx');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-lang').props.children).toBe('hi');
    });
  });
});
