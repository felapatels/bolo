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
    Ellipse: passthrough,
    Text: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
    // The run ahead cuts its centre out with a Mask (build 17).
    Mask: passthrough,
    Line: passthrough,
    // The home pass's drawn parchment (build 21) shades its sheet with
    // gradients and freckles it with ellipses (build 22 pins).
    RadialGradient: passthrough,
    LinearGradient: passthrough,
    Stop: passthrough,
    Image: passthrough,
    TextPath: passthrough,
    ClipPath: passthrough,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const icon = ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>;
  return { Feather: icon, MaterialCommunityIcons: icon };
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

// Build 21: the pass starts the journey's arrival film at the tear, through
// the root overlay's store. Spied so the beat it fires in can be pinned.
jest.mock('@/lib/stopSplash', () => ({
  playStopSplash: jest.fn(),
  currentStopSplashZone: () => null,
}));

import { JourneyPassCard } from '@/components/journey/JourneyPassCard';
import { playTearSfx } from '@/lib/tearAudio';
import { loadSoundPref } from '@/lib/soundPref';
import { playStopSplash } from '@/lib/stopSplash';

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

// ─── The cold-start cue, chat 12 ────────────────────────────────────────────
// "Make sure the START HERE bobbing badge above the pass is still working for
// cold starts" (owner), asked while the hero was being rebuilt as a carved
// station board. It had NO test at all, which is why the question needed
// asking rather than answering. It does now.
//
// The cue is deliberately OUTSIDE the board wrapper: styles.glow fills the
// wrapper, so a cue inside it would stretch the accent halo up behind the
// badge. That placement is what these cases pin, along with the one rule that
// makes the badge honest: it is derived from doneCount, never stored, so it
// clears itself the moment the first stop lands and there is no flag to go
// stale or to reset on reinstall.
describe('the cold-start START HERE cue', () => {
  it('shows above the board for a learner who has finished nothing', () => {
    mockState.journey = { current: null, doneCount: 0 };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('START HERE')).toBeOnTheScreen();
  });

  it('is gone the moment a single stop is behind them', () => {
    mockState.journey = { current: CURRENT, doneCount: 1 };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.queryByText('START HERE')).toBeNull();
  });

  it('waits for the journey to load rather than shouting at a blank card', () => {
    // isLoading gates it: a learner mid-journey must never see START HERE
    // flash while their progress is still in flight.
    mockState.journey = { current: null, doneCount: 0, isLoading: true };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.queryByText('START HERE')).toBeNull();
  });
});

// THE CTA IS A VERB NOW, and these cases are INVERTED rather than deleted.
//
// It used to spell the whole state out: "Resume at Stop 3 · 4 phrases to go",
// with a singular counter at one left and the counter dropped at zero. Every
// one of those was true and every one of them was ALREADY ON THE CARD once the
// hero became a station board: the panel names the stop above the plate and the
// progress bar sits between them. "Just make next to the train say Resume in
// bigger letters, it already shows they are on stop 5 and the progress" (owner,
// 2026-08-27, chat 12). The sentence also wrapped to two lines in a plate that
// shares its row with the ticket.
//
// So the counter arithmetic is gone from the COPY, not from the card. What the
// cases pin now is that each state still reads as its own distinct verb, and
// that the one state with nothing above it to lean on keeps its words.
describe('CTA copy is the verb, and the board says the rest', () => {
  it('fresh line: Start', () => {
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Start')).toBeOnTheScreen();
  });

  it('mid-journey: Resume, with the stop and the counter left to the board', () => {
    mockState.journey = { current: CURRENT, doneCount: 2 };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Resume')).toBeOnTheScreen();
    // WAS "Resume at Stop 3 · 4 phrases to go". The stop number moved to the
    // panel line above the plate; it must not come back into the button too.
    expect(screen.queryByText(/phrases to go/)).toBeNull();
    expect(screen.getByText('Stop 3 of 9')).toBeOnTheScreen();
  });

  it('says Resume whether one phrase is left or none', () => {
    // The singular/plural counter and the drop-at-zero rule lived in this copy
    // and were the reason it had three cases. A verb has one form, so what is
    // worth pinning is that neither edge sneaks a counter back in.
    for (const masteredCount of [9, 10]) {
      mockState.journey = { current: { ...CURRENT, masteredCount }, doneCount: 2 };
      const r = render(<JourneyPassCard onPress={() => {}} />);
      expect(screen.getByText('Resume')).toBeOnTheScreen();
      expect(screen.queryByText(/phrase/)).toBeNull();
      r.unmount();
    }
  });

  it('progress but no current stop (locked/errored): Continue', () => {
    mockState.journey = { current: null, doneCount: 3 };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Continue')).toBeOnTheScreen();
  });

  // S2 map honesty: when the only stops ahead are plan-gated (planLocked
  // groups, or sentence stops for a Free learner), the pass upsells instead
  // of promising a ride it cannot deliver.
  it('planBlocked KEEPS its words, because the board has none to lend it', () => {
    // The verb-only rule holds everywhere the panel above the plate names a
    // stop. This is the one state where it names nothing, so a bare "Unlock"
    // would leave a learner reading a button with no reason attached.
    mockState.journey = { current: null, doneCount: 3, planBlocked: true };
    render(<JourneyPassCard onPress={() => {}} />);
    expect(screen.getByText('Unlock with All-Access')).toBeOnTheScreen();
    expect(screen.queryByText('Continue')).toBeNull();
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

  // THE ARRIVAL FILM STARTS AT THE TEAR (build 21, owner: "the click from
  // boarding pass to journey still feels choppy, can't we crossfade the
  // homepage with the splash that plays?"). The journey used to start its
  // zone film only once its queries resolved, so home dissolved into a bare
  // loading screen and then the film faded in. Now the pass starts it in the
  // same beat as the tear, 500ms before navigation, for the learner's
  // current zone (zoneIndex 1 is zone id 2); the journey sees it up and
  // stands down. No current stop, no film from here.
  // INVERTED build 22 (owner: "the ticket tear doesn't happen now"): started
  // in the tear's first frame, the film's fade covered the stub before it
  // had moved, which a recording of the simulator proved. The film now waits
  // 320ms so a third of a second of tear shows, then dissolves in while the
  // stub is still sailing, still ahead of the navigation at 500.
  it('starts the current zone\'s arrival film a beat into the tear, before navigation', () => {
    mockState.journey = { current: CURRENT, doneCount: 2 };
    const onPress = jest.fn();
    render(<JourneyPassCard onPress={onPress} />);
    fireEvent.press(screen.getByTestId('journey-pass-card'));
    expect(playStopSplash).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(320);
    });
    expect(playStopSplash).toHaveBeenCalledTimes(1);
    expect(playStopSplash).toHaveBeenCalledWith(2);
    expect(onPress).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(180);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('starts no film with no current stop: the journey keeps its own arrival', () => {
    mockState.journey = { current: null, doneCount: 0 };
    render(<JourneyPassCard onPress={() => {}} />);
    fireEvent.press(screen.getByTestId('journey-pass-card'));
    expect(playStopSplash).not.toHaveBeenCalled();
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
