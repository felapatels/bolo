/**
 * The speaking-speed pill (owner, 2026-09-17: "it should be on chat screen and
 * lesson screens, wherever bolo or coach speaks").
 *
 * What matters is not that a pill renders but that it is a DOOR ONTO THE ONE
 * STORED SETTING the account screen already owns: pressing it writes the same
 * key, moves the in-memory rate lib/audio.ts reads when it creates the next
 * player, and every other mounted surface (another pill, the account screen's
 * hook) follows without a remount.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: { regular: 'r', semibold: 's', bold: 'b', extrabold: 'x' },
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));

import { SpeechSpeedPill, useSpeechRate } from '@/components/SpeechSpeedPill';
import {
  SPEECH_RATE_PREF_KEY,
  NORMAL_SPEECH_RATE,
  currentSpeechRate,
  loadSpeechRatePref,
  saveSpeechRatePref,
} from '@/lib/speechRatePref';
import { stallBoundMs, PLAYBACK_STALL_FACTOR, PLAYBACK_STALL_SLACK_MS } from '@/lib/audio';

beforeEach(async () => {
  await AsyncStorage.clear();
  await act(async () => {
    await saveSpeechRatePref(NORMAL_SPEECH_RATE);
  });
});

/** What the account screen does: reads the live value through the hook. */
function AccountProbe() {
  const rate = useSpeechRate();
  return <Text testID="account-probe">{String(rate)}</Text>;
}

describe('SpeechSpeedPill', () => {
  test('shows the current stored speed as a word, not a multiplier', async () => {
    await act(async () => {
      await saveSpeechRatePref(0.8);
    });
    render(<SpeechSpeedPill testID="pill" />);
    expect(screen.getByTestId('pill-label')).toHaveTextContent('Slow');
    expect(screen.queryByText(/0\.8|x$/)).toBeNull();
    expect(screen.getByLabelText('Speaking speed: Slow')).toBeOnTheScreen();
  });

  test('a press cycles Normal, Slow, Slower and back, writing the shared key each time', async () => {
    render(<SpeechSpeedPill testID="pill" />);
    expect(screen.getByTestId('pill-label')).toHaveTextContent('Normal');

    const expected: Array<[string, number]> = [
      ['Slow', 0.8],
      ['Slower', 0.65],
      ['Normal', 1],
    ];
    for (const [label, rate] of expected) {
      await act(async () => {
        fireEvent.press(screen.getByTestId('pill'));
      });
      expect(screen.getByTestId('pill-label')).toHaveTextContent(label);
      // THE NEXT CLIP: lib/audio.ts reads this synchronously at player birth.
      expect(currentSpeechRate()).toBe(rate);
      await waitFor(async () =>
        expect(await AsyncStorage.getItem(SPEECH_RATE_PREF_KEY)).toBe(String(rate)),
      );
    }
  });

  test('every mounted surface follows a change, including the account screen hook', async () => {
    render(
      <>
        <SpeechSpeedPill testID="chat-pill" variant="labelled" />
        <SpeechSpeedPill testID="lesson-pill" />
        <AccountProbe />
      </>,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('lesson-pill'));
    });
    expect(screen.getByTestId('chat-pill-label')).toHaveTextContent('Slow');
    expect(screen.getByTestId('account-probe')).toHaveTextContent('0.8');

    // And the other direction: the account screen's Segmented writes through
    // saveSpeechRatePref, and the pills follow it.
    await act(async () => {
      await saveSpeechRatePref(0.65);
    });
    expect(screen.getByTestId('lesson-pill-label')).toHaveTextContent('Slower');
  });

  test('the boot hydration updates a pill that mounted before it landed', async () => {
    render(<SpeechSpeedPill testID="pill" />);
    expect(screen.getByTestId('pill-label')).toHaveTextContent('Normal');
    await AsyncStorage.setItem(SPEECH_RATE_PREF_KEY, '0.65');
    await act(async () => {
      await loadSpeechRatePref();
    });
    expect(screen.getByTestId('pill-label')).toHaveTextContent('Slower');
  });

  // A learner who taps the pill while the boot read is still in flight must
  // not see the choice snap back to the older stored value.
  test('a load that started before a save does not overwrite the save', async () => {
    await AsyncStorage.setItem(SPEECH_RATE_PREF_KEY, '1');
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const realGet = AsyncStorage.getItem;
    const spy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockImplementationOnce(async (k: string) => {
        await gate;
        return realGet(k);
      });
    const loading = loadSpeechRatePref();
    await saveSpeechRatePref(0.65);
    // The disk now says 0.65 too, but make the stale read return the old value
    // to prove the guard, not the timing, is what keeps the choice.
    await AsyncStorage.setItem(SPEECH_RATE_PREF_KEY, '1');
    release();
    await loading;
    expect(currentSpeechRate()).toBe(0.65);
    spy.mockRestore();
  });
});

describe('the stall watchdog uses the rate the clip was born with', () => {
  // The pill sits on the screen that is playing, so the rate can change
  // mid-clip. A bound armed from the NEW rate would cut a slowed clip off.
  test('a clip created at Slower keeps a Slower bound after the learner picks Normal', async () => {
    await act(async () => {
      await saveSpeechRatePref(NORMAL_SPEECH_RATE);
    });
    const bornAt = 0.65;
    expect(stallBoundMs(10, bornAt)).toBeCloseTo(
      (10 * 1000 * PLAYBACK_STALL_FACTOR) / bornAt + PLAYBACK_STALL_SLACK_MS,
      5,
    );
    expect(stallBoundMs(10, bornAt)).toBeGreaterThan(stallBoundMs(10));
  });
});
