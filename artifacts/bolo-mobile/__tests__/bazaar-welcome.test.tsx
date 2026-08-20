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

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    muted: false,
    loop: true,
  };
  return {
    __esModule: true,
    __player: player,
    useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => {
      setup?.(player);
      return player;
    },
    VideoView: (props: Record<string, unknown>) =>
      React.createElement(View, props),
  };
});

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
const { __player: film } = require('expo-video');
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
    expect(screen.getByTestId('bazaar-welcome-video')).toBeTruthy();
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

describe('BazaarWelcome, film and voice start together', () => {
  it('does not start the film when the greeting is already spent', async () => {
    // THE REGRESSION PIN. The old code called play() inside useVideoPlayer's
    // setup callback, so the film ran at mount on every bazaar visit, seen or
    // not. This fails on that code and passes on the fix.
    await AsyncStorage.setItem(WELCOME_KEY, today());
    render(<BazaarWelcome />);
    await settle();

    expect(screen.queryByTestId('bazaar-welcome')).toBeNull();
    expect(film.play).not.toHaveBeenCalled();
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it('starts the film and the voice on the same open', async () => {
    render(<BazaarWelcome />);
    await settle();

    expect(film.play).toHaveBeenCalled();
    expect(createAudioPlayer).toHaveBeenCalled();
  });

  it('mutes the film, since the voice is a separate clip', async () => {
    render(<BazaarWelcome />);
    await settle();

    expect(film.muted).toBe(true);
    expect(film.loop).toBe(false);
  });

  it('stops BOTH the film and the voice when skipped', async () => {
    render(<BazaarWelcome />);
    await settle();

    await act(async () => {
      fireEvent.press(screen.getByTestId('bazaar-welcome'));
    });

    expect(screen.queryByTestId('bazaar-welcome')).toBeNull();
    // Chacha-ji carrying on talking over the shop was the defect this
    // component was written to avoid; a film still decoding behind it is the
    // same defect with the sound off.
    expect(voice.remove).toHaveBeenCalled();
    expect(film.pause).toHaveBeenCalled();
  });

  it('stops both on unmount, without a skip', async () => {
    render(<BazaarWelcome />);
    await settle();

    await act(async () => {
      screen.unmount();
    });

    expect(voice.remove).toHaveBeenCalled();
    expect(film.pause).toHaveBeenCalled();
  });
});

describe('BazaarWelcome, reduced motion', () => {
  beforeEach(() => {
    motion.reduce = true;
  });

  it('shows the still instead of the film, and still speaks', async () => {
    render(<BazaarWelcome />);
    await settle();

    expect(screen.getByTestId('bazaar-welcome-still')).toBeTruthy();
    expect(screen.queryByTestId('bazaar-welcome-video')).toBeNull();
    // Reduced motion suppresses movement, not sound.
    expect(createAudioPlayer).toHaveBeenCalled();
    // No film to run, so nothing should have been told to play.
    expect(film.play).not.toHaveBeenCalled();
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
