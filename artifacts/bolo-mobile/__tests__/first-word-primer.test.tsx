/**
 * THE FIRST-WORD LIGHTBOX, build 19 (owner ask, 2026-08-29). The decision
 * is pure and pinned here; the sheet renders the agreed words and hands the
 * tap back. The ORDER against the score and the first badge celebration is
 * pinned on the real practice screen in practice-celebrations.test.tsx.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FIRST_WORD_PRIMER_COPY,
  FIRST_WORD_PRIMER_KEY,
  loadFirstWordPrimerSeen,
  saveFirstWordPrimerSeen,
  shouldShowFirstWordPrimer,
} from '@/lib/firstWordPrimer';
import { FirstWordPrimer } from '@/components/FirstWordPrimer';

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: ({ pose }: { pose: string }) => <View testID={`mascot-${pose}`} /> };
});
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('shouldShowFirstWordPrimer', () => {
  it('shows for a first word: unseen here, zero attempts on the account', () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: false, totalAttempts: 0 })).toBe(true);
  });

  it('never shows twice on one device', () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: true, totalAttempts: 0 })).toBe(false);
  });

  it('never calls a word "first" for a learner who practised on another device', () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: false, totalAttempts: 12 })).toBe(false);
  });

  it('judges by the device alone when the account count is unknown', () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: false, totalAttempts: undefined })).toBe(true);
    expect(shouldShowFirstWordPrimer({ seenOnDevice: true, totalAttempts: undefined })).toBe(false);
  });
});

describe('the device marker', () => {
  it('reads unseen, then seen once saved', async () => {
    expect(await loadFirstWordPrimerSeen()).toBe(false);
    await saveFirstWordPrimerSeen();
    expect(await loadFirstWordPrimerSeen()).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_WORD_PRIMER_KEY)).toBe('yes');
  });
});

describe('the sheet', () => {
  it('says the agreed words, with no em dash anywhere, and hands the tap back', () => {
    const onDismiss = jest.fn();
    render(<FirstWordPrimer visible onDismiss={onDismiss} />);
    expect(screen.getByTestId('first-word-primer')).toBeTruthy();
    expect(screen.getByText(FIRST_WORD_PRIMER_COPY.title)).toBeTruthy();
    expect(screen.getByText(FIRST_WORD_PRIMER_COPY.body)).toBeTruthy();
    expect(screen.getByTestId('mascot-cheer')).toBeTruthy();
    for (const line of Object.values(FIRST_WORD_PRIMER_COPY)) {
      expect(line).not.toMatch(/[—–]/);
    }
    fireEvent.press(screen.getByTestId('first-word-primer-cta'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(<FirstWordPrimer visible={false} onDismiss={jest.fn()} />);
    expect(screen.queryByTestId('first-word-primer')).toBeNull();
  });
});
