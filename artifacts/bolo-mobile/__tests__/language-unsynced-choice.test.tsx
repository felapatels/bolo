// A LANGUAGE CHOICE THAT FAILED TO SAVE MUST NOT BE SILENTLY DISCARDED.
//
// Traced 2026-08-28 from a screenshot showing one language picked and another
// in the home context. pushRemote swallowed its failure (`onError: () => {}`,
// and react-query does not retry mutations), so a pick made on a flaky
// connection lived only on the device. On the NEXT launch reconciliation read
// the account's older value and adopted it, and the learner's choice was gone
// with nothing ever having said so.
//
// The fix is an unsynced flag in AsyncStorage: while it is set, the LOCAL
// choice wins reconciliation and is pushed again. That also gives the
// once-per-mount reconcile something to repair, since nothing else revisits it.
//
// Harness follows language-default.test.tsx, which drives the real provider.

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockState: Record<string, any> = {
  accountData: undefined as unknown,
  languages: [
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', rtl: false },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', rtl: false },
  ],
  mutate: jest.fn(),
};

jest.mock('@workspace/api-client-react', () => ({
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useListLanguages: () => ({ data: mockState.languages, isLoading: false }),
  useGetAccount: () => ({ data: mockState.accountData }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  useUpdateAccountPreferences: () => ({ mutate: mockState.mutate }),
  getGetAccountQueryKey: () => ['account'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: jest.fn(() => undefined), setQueryData: jest.fn() }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ allowedLanguages: ['hi', 'gu'], isPlus: false }),
}));

import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';

function LangDisplay() {
  const { activeLang } = useLanguage();
  return <Text testID="active-lang">{activeLang}</Text>;
}

const UNSYNCED_KEY = 'bolo.activeLang.unsynced';
const STORAGE_KEY = 'bolo.activeLang';

/** An account whose server-side language is Hindi. */
const HINDI_ACCOUNT = {
  preferences: { learning: { activeLanguage: 'hi', timezone: 'Asia/Kolkata' } },
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockState.accountData = undefined;
  mockState.mutate = jest.fn();
});

test('a SYNCED local choice still loses to the account, as before', async () => {
  // The cross-device promise: a language picked on another phone wins here.
  // This is the behaviour the fix must not break.
  await AsyncStorage.setItem(STORAGE_KEY, 'gu');
  mockState.accountData = HINDI_ACCOUNT;

  render(<LanguageProvider><LangDisplay /></LanguageProvider>);

  await waitFor(() => expect(screen.getByTestId('active-lang')).toHaveTextContent('hi'));
});

test('an UNSYNCED local choice beats the account and is pushed again', async () => {
  // The regression. Before the fix this rendered 'hi' and the learner's pick
  // was gone for good.
  await AsyncStorage.setItem(STORAGE_KEY, 'gu');
  await AsyncStorage.setItem(UNSYNCED_KEY, '1');
  mockState.accountData = HINDI_ACCOUNT;

  render(<LanguageProvider><LangDisplay /></LanguageProvider>);

  await waitFor(() => expect(screen.getByTestId('active-lang')).toHaveTextContent('gu'));
  // And it retries, because reconciliation is the only place that ever would.
  await waitFor(() => expect(mockState.mutate).toHaveBeenCalled());
  expect(mockState.mutate.mock.calls[0][0]).toEqual({ data: { activeLanguage: 'gu' } });
});

test('a failed push records the flag so the next launch keeps the choice', async () => {
  // A push only happens when there is something to write. The account here has
  // never recorded a language, which is the seed path, and that write fails.
  await AsyncStorage.setItem(STORAGE_KEY, 'gu');
  mockState.accountData = {
    preferences: { learning: { activeLanguage: undefined, timezone: 'Asia/Kolkata' } },
  };
  mockState.mutate = jest.fn((_vars: unknown, opts: any) => opts?.onError?.());

  render(<LanguageProvider><LangDisplay /></LanguageProvider>);

  await waitFor(async () => {
    expect(await AsyncStorage.getItem(UNSYNCED_KEY)).toBe('1');
  });
  // And the choice itself is untouched on this device.
  expect(screen.getByTestId('active-lang')).toHaveTextContent('gu');
});

test('a successful push clears the flag', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, 'gu');
  await AsyncStorage.setItem(UNSYNCED_KEY, '1');
  mockState.accountData = HINDI_ACCOUNT;
  mockState.mutate = jest.fn((_vars: unknown, opts: any) =>
    opts?.onSuccess?.({ preferences: HINDI_ACCOUNT.preferences }));

  render(<LanguageProvider><LangDisplay /></LanguageProvider>);

  await waitFor(async () => {
    expect(await AsyncStorage.getItem(UNSYNCED_KEY)).toBeNull();
  });
});
