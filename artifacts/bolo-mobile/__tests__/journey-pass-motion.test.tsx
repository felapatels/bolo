// Build 31 items 2 + 3: the home boarding pass gains progress-aware CTA copy
// and the stub tear-off activation. Pinned here:
//   - CTA 3-state copy (Start / Resume at Stop N · X to go / Continue), with
//     the phrase counter dropping at zero-left and going singular at one.
//   - The tear NEVER blocks navigation: onPress fires at the 500ms mark of
//     the tear, re-presses during the tear are swallowed, and the pass
//     restores (re-pressable) after the reset window.
//   - Reduced motion activates instantly with zero theatrics.
//   - R4: the paper-tear SFX fires exactly once per tear (fire-and-forget,
//     never on reduced motion, never on swallowed re-presses).

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

const mockState: Record<string, any> = {
  journey: { current: null, doneCount: 0 },
};

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) =>
    React.createElement(View, props, children);
  return {
    __esModule: true,
    default: passthrough,
    Svg: passthrough,
    G: passthrough,
    Path: passthrough,
    Circle: passthrough,
    Rect: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
    Line: passthrough,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Feather: ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>,
  };
});

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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
    cardBorder: '#E0E0E0',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    primary: '#4F46E5',
    secondary: '#0D9488',
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  }),
}));

jest.mock('@/lib/useJourneyProgress', () => ({
  useJourneyProgress: () => mockState.journey,
}));

// R4: the SFX layer is fire-and-forget; the card must call it at tear start
// and NEVER await it. The mock keeps jsdom free of expo-audio natives.
jest.mock('@/lib/tearAudio', () => ({
  preloadTearAudio: jest.fn(),
  playTearSfx: jest.fn(),
}));

// Build 35: tearSfx is now gated by soundPref. Mock the whole module so
// AsyncStorage is not needed for pref reads and the default is "on".
jest.mock('@/lib/soundPref', () => ({
  loadSoundPref: jest.fn().mockResolvedValue(true),
  saveSoundPref: jest.fn(),
  SOUND_PREF_KEY: 'bolo.soundEffects',
}));

import { JourneyPassCard } from '@/components/journey/JourneyPassCard';
import { playTearSfx } from '@/lib/tearAudio';
import { loadSoundPref } from '@/lib/soundPref';

const CURRENT = {
  geoName: 'New Delhi',
  stopNumber: 3,
  stopCount: 9,
  phraseCount: 10,
  masteredCount: 6,
  zoneIndex: 1,
  started: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockState.journey = { current: null, doneCount: 0 };
});

describe('progress-aware CTA copy (web home.tsx parity)', () => {
  it('fresh line: Start your journey', () => {
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Start your journey')).toBeOnTheScreen();
  });

  it('mid-journey: Resume at Stop N with phrases-to-go counter', () => {
    mockState.journey = { current: CURRENT, doneCount: 2 };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Resume at Stop 3 · 4 phrases to go')).toBeOnTheScreen();
  });

  it('singular counter at one phrase left', () => {
    mockState.journey = {
      current: { ...CURRENT, masteredCount: 9 },
      doneCount: 2,
    };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Resume at Stop 3 · 1 phrase to go')).toBeOnTheScreen();
  });

  it('drops the counter when the stop is fully mastered', () => {
    mockState.journey = {
      current: { ...CURRENT, masteredCount: 10 },
      doneCount: 2,
    };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Resume at Stop 3')).toBeOnTheScreen();
  });

  it('progress but no current stop (locked/errored): Continue your journey', () => {
    mockState.journey = { current: null, doneCount: 3 };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Continue your journey')).toBeOnTheScreen();
  });

  // S2 map honesty: when the only stops ahead are plan-gated (planLocked
  // groups, or sentence stops for a Free learner), the pass upsells instead
  // of promising a ride it cannot deliver.
  it('planBlocked with nothing boardable: All-Access nudge', () => {
    mockState.journey = { current: null, doneCount: 3, planBlocked: true };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Unlock your next stop with All-Access')).toBeOnTheScreen();
    expect(screen.queryByText('Continue your journey')).toBeNull();
  });
});

describe('stub tear-off activation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('fires onPress at the 500ms tear mark — navigation is never blocked', () => {
    const onPress = jest.fn();
    render(<JourneyPassCard onPress={onPress} />);

    fireEvent.press(screen.getByTestId('journey-pass-card'));
    expect(onPress).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(onPress).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('swallows re-presses while tearing, then restores to pressable', () => {
    const onPress = jest.fn();
    render(<JourneyPassCard onPress={onPress} />);

    fireEvent.press(screen.getByTestId('journey-pass-card'));
    // Mid-tear re-press: ignored entirely (no double navigation).
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.press(screen.getByTestId('journey-pass-card'));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    // After the reset window the intact pass is back and pressable again.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.press(screen.getByTestId('journey-pass-card'));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('rapid double-press before React commits still navigates exactly once', () => {
    const onPress = jest.fn();
    render(<JourneyPassCard onPress={onPress} />);

    // Two presses in the SAME event burst — the tearing state has not
    // committed yet, so only a synchronous ref guard can swallow the second.
    const card = screen.getByTestId('journey-pass-card');
    fireEvent.press(card);
    fireEvent.press(card);

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('navigates with the LATEST onPress when the parent rerenders mid-tear', () => {
    const stale = jest.fn();
    const fresh = jest.fn();
    const view = render(<JourneyPassCard onPress={stale} />);

    fireEvent.press(screen.getByTestId('journey-pass-card'));
    // Parent rerenders with a new callback during the 500ms delay.
    view.rerender(<JourneyPassCard onPress={fresh} />);

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('reduced motion activates instantly with no tear', () => {
    const reanimated = require('react-native-reanimated');
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      const onPress = jest.fn();
      render(<JourneyPassCard onPress={onPress} />);
      fireEvent.press(screen.getByTestId('journey-pass-card'));
      expect(onPress).toHaveBeenCalledTimes(1);
      // No idle theatrics either: glow and shimmer never mount.
      expect(screen.queryByTestId('pass-glow')).toBeNull();
      expect(screen.queryByTestId('pass-shimmer')).toBeNull();
      // R4: reduced motion is silent — no tear, no tear sound.
      expect(playTearSfx).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  // R4: the recorded tear SFX plays at tear start (before the 500ms nav
  // mark), exactly once per tear — swallowed re-presses stay silent, and a
  // fresh activation after the reset window plays it again.
  // The SFX is gated behind an async soundPref check (Build 35), so each
  // press assertion awaits act to flush the resolved promise.
  it('plays the tear SFX once per tear, at tear start', async () => {
    const onPress = jest.fn();
    render(<JourneyPassCard onPress={onPress} />);
    const card = screen.getByTestId('journey-pass-card');

    await act(async () => { fireEvent.press(card); });
    // Fires after the async soundPref check resolves, ahead of navigation.
    expect(playTearSfx).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    // Swallowed mid-tear re-press: no second sound (guard fires before pref check).
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.press(card);
    expect(playTearSfx).toHaveBeenCalledTimes(1);

    // Past the reset window the pass restores; a new tear plays a new sound.
    act(() => {
      jest.advanceTimersByTime(1300);
    });
    await act(async () => { fireEvent.press(card); });
    expect(playTearSfx).toHaveBeenCalledTimes(2);
  });

  // Build 35: Sound effects off suppresses the tear SFX. Navigation still fires.
  it('suppresses tear SFX when Sound effects is off', async () => {
    (loadSoundPref as jest.MockedFunction<typeof loadSoundPref>).mockResolvedValueOnce(false);
    render(<JourneyPassCard onPress={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('journey-pass-card'));
    });
    expect(playTearSfx).not.toHaveBeenCalled();
  });
});
