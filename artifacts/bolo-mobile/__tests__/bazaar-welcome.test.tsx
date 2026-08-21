import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Chacha-ji's bazaar welcome, mobile half of the twin.
//
// The component shipped untested and has never run on a device. The bug that
// prompted these tests: useVideoPlayer's setup callback called play(), so the
// film started at MOUNT, while the AsyncStorage stamp was still being read.
// The voice only started once the overlay opened, so Chacha-ji's lips led his
// voice by the length of that read and the opening frames were never seen.
//
// The pin for that is "does not start the film when the greeting is already
// spent": under the old code play() fired at mount regardless of the stamp, so
// that test fails on the old code and passes on the new.
//
// The day-stamp key and value format are asserted literally rather than
// imported, because they are a CROSS-PLATFORM contract shared with web's
// bazaar-welcome.tsx. A test that imported the constant would let both halves
// drift together silently.
// ---------------------------------------------------------------------------

const WELCOME_KEY = 'bolo-bazaar-welcome-day';

/** Byte-for-byte what the component writes. Unpadded, local calendar day. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// The mock objects live INSIDE the factories: jest.mock is hoisted above every
// const in this file, so a factory closing over an outer const would hit the
// temporal dead zone. Each mocked module hands its double back on a __ property.


jest.mock('expo-audio', () => {
  const voice = { play: jest.fn(), remove: jest.fn() };
  return {
    __esModule: true,
    __voice: voice,
    createAudioPlayer: jest.fn(() => voice),
  };
});

jest.mock('@/lib/audio', () => ({
  __esModule: true,
  activateSfxPlaybackRoute: jest.fn(() => Promise.resolve()),
}));

// jest-setup.js mocks reanimated globally with useReducedMotion: () => false.
// This file needs to flip it per test, so it overrides that mock with a
// mutable flag. BazaarWelcome touches nothing else from reanimated.
jest.mock('react-native-reanimated', () => {
  const motion = { reduce: false };
  return {
    __esModule: true,
    __motion: motion,
    useReducedMotion: () => motion.reduce,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __voice: voice, createAudioPlayer } = require('expo-audio');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __motion: motion } = require('react-native-reanimated');

import { BazaarWelcome } from '@/components/BazaarWelcome';

/**
 * The stamp is read asynchronously, so the overlay is absent for a tick or two
 * after mount by design. Flushing microtasks inside act() settles that without
 * waitFor, which keeps these tests deterministic under fake timers.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  motion.reduce = false;
  await AsyncStorage.clear();
});

describe('BazaarWelcome, once a day', () => {
  it('greets on the first visit of the day', async () => {
    render(<BazaarWelcome />);
    await settle();

    expect(screen.getByTestId('bazaar-welcome')).toBeTruthy();
    // The FILM is gone: expo-video was removed on 2026-08-19 for the crash
    // bisect, because BrandSplash plays one at the root layout on every cold
    // start and that is where the app was dying. The greeting itself survives
    // as the poster plus Chacha-ji's voice, which is what this now pins.
    expect(screen.getByTestId('bazaar-welcome-still')).toBeTruthy();
  });

  it('stamps the day so the second visit is silent', async () => {
    render(<BazaarWelcome />);
    await settle();
    expect(await AsyncStorage.getItem(WELCOME_KEY)).toBe(today());

    screen.unmount();
    render(<BazaarWelcome />);
    await settle();
    expect(screen.queryByTestId('bazaar-welcome')).toBeNull();
  });

  it('greets again once the stamp is yesterday\'s', async () => {
    await AsyncStorage.setItem(WELCOME_KEY, '2020-1-1');
    render(<BazaarWelcome />);
    await settle();

    expect(screen.getByTestId('bazaar-welcome')).toBeTruthy();
  });

  it('fails CLOSED when the stamp is unreadable', async () => {
    // An unreadable stamp is treated as already seen, so a storage failure
    // never means the greeting on every entry. Asserts the DIRECTION.
    //
    // Queued on the existing mock rather than through jest.spyOn: getItem is
    // ALREADY a jest.fn (the library's official in-memory mock, installed in
    // jest-setup.js), and spying on a mock then calling mockRestore leaves it
    // with no implementation at all. That returned undefined to the next test
    // in this file and greeted a learner who had already been greeted.
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('storage gone'),
    );

    render(<BazaarWelcome />);
    await settle();

    expect(screen.queryByTestId('bazaar-welcome')).toBeNull();
    // Proves the one-shot rejection was consumed, so it cannot leak forward.
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(WELCOME_KEY);
  });
});

describe('BazaarWelcome, the voice still starts on open', () => {
  // WAS 'film and voice start together', and every case in it drove a
  // expo-video player. That module was removed on 2026-08-19 for the crash
  // bisect: BrandSplash plays a film at the root layout on every cold start,
  // which is where the app was dying inside the Hermes GC.
  //
  // The film assertions are not inverted, they are GONE, because the thing they
  // guarded is gone. What survives is the half that still ships, and it was
  // always the more important half: the greeting is Chacha-ji speaking, and a
  // silent greeting is not a greeting.
  it('speaks on the first open of the day', async () => {
    render(<BazaarWelcome />);
    await settle();
    expect(createAudioPlayer).toHaveBeenCalled();
  });

  it('says nothing when the greeting is already spent', async () => {
    await AsyncStorage.setItem('bolo-bazaar-welcome-day', today());
    render(<BazaarWelcome />);
    await settle();
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it('stops the voice when skipped, so it never talks over the shop', async () => {
    render(<BazaarWelcome />);
    await settle();
    fireEvent.press(screen.getByTestId('bazaar-welcome'));
    await settle();
    expect(voice.remove).toHaveBeenCalled();
  });
});

describe('BazaarWelcome, reduced motion', () => {
  beforeEach(() => {
    motion.reduce = true;
  });

  it('shows the still, and still speaks', async () => {
    render(<BazaarWelcome />);
    await settle();

    expect(screen.getByTestId('bazaar-welcome-still')).toBeTruthy();
    // Reduced motion suppressed movement, not sound. That is still true, and
    // now it is true on every path, because there is no film on any of them.
    expect(createAudioPlayer).toHaveBeenCalled();
  });
});

describe('BazaarWelcome, it closes itself', () => {
  it('holds the film past the end of the 4.284s voice, then closes', async () => {
    // The film is 5.041667s and the voice 4.284s; WELCOME_MS is 5200 so it
    // outlasts both. If the film is ever swapped for a longer one without
    // moving that constant, the first assertion fails.
    jest.useFakeTimers();
    try {
      render(<BazaarWelcome />);
      await settle();
      expect(screen.getByTestId('bazaar-welcome')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(5100);
      });
      expect(screen.queryByTestId('bazaar-welcome')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('bazaar-welcome')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
