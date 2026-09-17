// A FALLBACK LANGUAGE IS NEVER WRITTEN TO THE ACCOUNT.
//
// Owner report 2026-09-17: "my language keeps getting set back to assamese",
// "i was in gujarati last", seen on ANOTHER device after picking Gujarati on
// the iPhone. GET /languages is sorted by sortOrder, and Assamese ('as') is
// sortOrder 0, so languages[0] is Assamese.
//
// The provider's validity guard used to do `setActiveLang(languages[0].code)`
// whenever the local code was not in the list, and setActiveLang PATCHes
// activeLanguage. So a device holding any code the list does not carry wrote
// Assamese to the ACCOUNT. The account is the cross-device copy, so every
// other device adopted Assamese on its next launch, which is exactly "set back
// on another device". The writing device could even look correct, because its
// own reconcile adopts the server value it fetched before the PATCH landed.
//
// Rule this pins: a fallback may apply locally for display; only a learner's
// explicit choice may PATCH activeLanguage. Locked languages remain valid
// active languages (showroom rule, see language-locked-adoption.test.tsx).

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockState: Record<string, any> = {
  accountData: undefined as unknown,
  // The production order: sorted by sortOrder, Assamese first.
  languages: [
    { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', script: 'Bengali-Assamese', rtl: false },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', rtl: false },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', rtl: false },
  ],
  mutate: jest.fn(),
};

jest.mock('@workspace/api-client-react', () => ({
  useListLanguages: () => ({ data: mockState.languages, isLoading: false }),
  useGetAccount: () => ({ data: mockState.accountData }),
  useUpdateAccountPreferences: () => ({ mutate: mockState.mutate }),
  getGetAccountQueryKey: () => ['account'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: jest.fn(() => undefined), setQueryData: jest.fn() }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ allowedLanguages: ['hi'], isPlus: false }),
}));

import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';

const STORAGE_KEY = 'bolo.activeLang';
const UNSYNCED_KEY = 'bolo.activeLang.unsynced';

function LangDisplay() {
  const { activeLang } = useLanguage();
  return <Text testID="active-lang">{activeLang}</Text>;
}

function renderProvider() {
  return render(
    <LanguageProvider>
      <LangDisplay />
    </LanguageProvider>,
  );
}

/** Every activeLanguage value this provider tried to write to the account. */
function activeLanguageWrites(): unknown[] {
  return mockState.mutate.mock.calls
    .map((call: any[]) => call[0]?.data)
    .filter((data: any) => data && 'activeLanguage' in data)
    .map((data: any) => data.activeLanguage);
}

const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockState.accountData = undefined;
  mockState.mutate = jest.fn();
});

test('a local code missing from the list does not write languages[0] over the account', async () => {
  // Another device already saved Gujarati. This device holds a code the list
  // does not carry.
  await AsyncStorage.setItem(STORAGE_KEY, 'xx');
  mockState.accountData = {
    preferences: { learning: { activeLanguage: 'gu', timezone: 'Asia/Kolkata' } },
  };

  renderProvider();

  await waitFor(() => expect(screen.getByTestId('active-lang')).toHaveTextContent('gu'));
  await settle();
  expect(activeLanguageWrites()).toEqual([]);
  // And the device keeps the account's language, not the fallback.
  expect(screen.getByTestId('active-lang')).toHaveTextContent('gu');
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('gu');
});

test('before the account loads, the fallback is display-only: no write, nothing stored', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, 'xx');

  renderProvider();

  await settle();
  // Display falls back to the default, not to whatever sorts first.
  expect(screen.getByTestId('active-lang')).toHaveTextContent('hi');
  expect(activeLanguageWrites()).toEqual([]);
  // Not stored either, or a later seed would persist it one step removed.
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBe('as');
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBe('hi');
});

test('an account with no language is not seeded from a fallback', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, 'xx');
  mockState.accountData = {
    preferences: { learning: { activeLanguage: null, timezone: 'Asia/Kolkata' } },
  };

  renderProvider();

  await settle();
  expect(activeLanguageWrites()).toEqual([]);
});

test('with Hindi absent too, the display fallback is languages[0] and still never written', async () => {
  mockState.languages = mockState.languages.filter((l: any) => l.code !== 'hi');
  try {
    await AsyncStorage.setItem(STORAGE_KEY, 'xx');
    await AsyncStorage.setItem(UNSYNCED_KEY, '1');
    mockState.accountData = {
      preferences: { learning: { activeLanguage: null, timezone: 'Asia/Kolkata' } },
    };

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('active-lang')).toHaveTextContent('as'));
    await settle();
    expect(activeLanguageWrites()).toEqual([]);
  } finally {
    mockState.languages = [
      { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', script: 'Bengali-Assamese', rtl: false },
      { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', rtl: false },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', rtl: false },
    ];
  }
});

test('a real stored choice still seeds an account that has never recorded one', async () => {
  // The seed path the fix must keep: this device's own earlier pick.
  await AsyncStorage.setItem(STORAGE_KEY, 'gu');
  mockState.accountData = {
    preferences: { learning: { activeLanguage: null, timezone: 'Asia/Kolkata' } },
  };

  renderProvider();

  await waitFor(() => expect(activeLanguageWrites()).toEqual(['gu']));
});
