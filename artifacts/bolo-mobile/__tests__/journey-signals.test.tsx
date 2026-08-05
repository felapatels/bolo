// Build 35 mobile parity — trackside signals: the seating contract, the game
// rotation, the four glyph states, the encounter dialog's reward-chip rule,
// and the hydrating memory layer.
//
// The seating planner and the rotation are tested as pure units rather than
// through the map, because `gap-N` is the identity the SERVER's grant ledger
// is keyed on: if the numbering drifts, the map advertises crossings the
// ledger has never heard of, and no map-level assertion would notice.

import React from 'react';
import { render, screen, fireEvent, renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    Line: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Feather: ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text> };
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

import { planTracksideSignals, signalContextRef } from '@/lib/tracksideSignals';
import { gameForSignal, quickGameById, QUICK_GAME_MIN_FLOOR } from '@/lib/quick-games';
import { SignalGlyph } from '@/components/journey/SignalGlyph';
import { SignalEncounterDialog } from '@/components/journey/SignalEncounter';
import {
  useSignalMemory,
  hydrateClearedSignals,
  isSignalCleared,
  isSignalWaved,
  markSignalCleared,
  markSignalWaved,
  resetSignalMemory,
  clearedStorageKey,
} from '@/lib/signalMemory';

const colors = {
  foreground: '#1A1A1A',
  mutedForeground: '#888888',
  card: '#F5F5F5',
  border: '#E0E0E0',
  muted: '#EEEEEE',
  primary: '#6C3FC5',
  primaryForeground: '#FFFFFF',
};

// ─── seating ────────────────────────────────────────────────────────────────

describe('trackside signal seating', () => {
  it('seats one signal after every odd stop and never on the final stop', () => {
    expect(planTracksideSignals(7)).toEqual([
      { afterStop: 1, signalIndex: 0 },
      { afterStop: 3, signalIndex: 1 },
      { afterStop: 5, signalIndex: 2 },
    ]);
    // The last stop must stay reachable without clearing one more crossing:
    // no signal may ever sit at or past the terminus.
    for (const total of [2, 3, 8, 9, 20]) {
      for (const s of planTracksideSignals(total)) {
        expect(s.afterStop).toBeLessThan(total);
      }
    }
  });

  it('seats nothing on a line too short to have a gap', () => {
    expect(planTracksideSignals(0)).toEqual([]);
    expect(planTracksideSignals(1)).toEqual([]);
  });

  it('is pure: same input, equal output, independent arrays', () => {
    const a = planTracksideSignals(9);
    const b = planTracksideSignals(9);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.push({ afterStop: 99, signalIndex: 99 });
    expect(planTracksideSignals(9)).toHaveLength(b.length);
  });

  it('spells the contextRef the way the server matches it', () => {
    // Server pattern is ^gap-[0-9]+$; the launch and the ledger must agree.
    expect(signalContextRef(3)).toBe('gap-3');
    expect(signalContextRef(11)).toMatch(/^gap-[0-9]+$/);
  });
});

// ─── rotation ───────────────────────────────────────────────────────────────

describe('signal game rotation', () => {
  it('rotates deterministically through the games a zone can actually fill', () => {
    const picks = [0, 1, 2, 3, 4, 5].map((i) => gameForSignal(i, 8)?.id);
    expect(picks.every(Boolean)).toBe(true);
    // Consecutive crossings must not offer the same game twice running.
    expect(picks[0]).not.toBe(picks[1]);
    // Deterministic: the same signal always offers the same game.
    expect(gameForSignal(2, 8)?.id).toBe(picks[2]);
    // And it is a real roster entry, not an invented id.
    expect(quickGameById(picks[0]!)).toBeTruthy();
  });

  it('offers nothing when the zone cannot fill even the smallest game', () => {
    // The auto-wave case: below the smallest floor there is no honest game
    // to offer, so the encounter waves the learner through instead.
    expect(gameForSignal(0, QUICK_GAME_MIN_FLOOR - 1)).toBeNull();
    expect(gameForSignal(3, 0)).toBeNull();
  });
});

// ─── glyph ──────────────────────────────────────────────────────────────────

describe('signal glyph', () => {
  it('reads its four states off one geometry: arm angle and lamp only', () => {
    const cases = [
      { state: 'upcoming' as const, arm: 'signal-arm-down', lamp: '#ef4444', halo: false },
      { state: 'active' as const, arm: 'signal-arm-down', lamp: '#ef4444', halo: true },
      { state: 'waved' as const, arm: 'signal-arm-up', lamp: '#ffb300', halo: false },
      { state: 'cleared' as const, arm: 'signal-arm-up', lamp: '#22c55e', halo: false },
    ];
    // The glyph is deliberately hidden from assistive tech (its tappable
    // wrapper carries the label), and RNTL skips a11y-hidden subtrees by
    // default, so these queries have to opt back in.
    const deep = { includeHiddenElements: true };
    for (const c of cases) {
      const { unmount } = render(<SignalGlyph state={c.state} />);
      expect(screen.getByTestId(c.arm, deep)).toBeOnTheScreen();
      expect(screen.getByTestId('signal-lamp', deep).props.fill).toBe(c.lamp);
      // Only ACTIVE gets the halo: that is what separates the crossing that
      // is blocking you now from one further up the line.
      expect(screen.queryByTestId('signal-active-halo', deep) !== null).toBe(c.halo);
      unmount();
    }
  });
});

// ─── encounter dialog ───────────────────────────────────────────────────────

const game = quickGameById('signal-lights')!;

function encounter(overrides: Record<string, unknown> = {}) {
  return { gap: 3, zoneId: 2, state: 'active' as const, rewardChai: 3, game, ...overrides } as any;
}

describe('signal encounter dialog', () => {
  it('promises the served reward while the grant is unclaimed', () => {
    render(
      <SignalEncounterDialog
        encounter={encounter()}
        colors={colors}
        onPlay={jest.fn()}
        onWave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('signal-dialog-title')).toHaveTextContent('Signal ahead');
    // The amount comes from the zone payload, never a hardcoded constant.
    expect(screen.getByTestId('signal-chai-chip')).toHaveTextContent(/\+3 Chai/);
    expect(screen.getByTestId('signal-wave-through')).toBeOnTheScreen();
    expect(screen.getByTestId('signal-play-game')).toHaveTextContent(`Play ${game.title}`);
  });

  it('promises nothing on a cleared replay, and stops offering the wave', () => {
    render(
      <SignalEncounterDialog
        encounter={encounter({ state: 'cleared' })}
        colors={colors}
        onPlay={jest.fn()}
        onWave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('signal-dialog-title')).toHaveTextContent(
      'Signal already cleared',
    );
    // The server will not pay a second time, so the chip must not imply it.
    expect(screen.queryByTestId('signal-chai-chip')).toBeNull();
    // Nothing left to wave past either — the gate is already up.
    expect(screen.queryByTestId('signal-wave-through')).toBeNull();
    // Still replayable for its own sake.
    expect(screen.getByTestId('signal-play-game')).toBeOnTheScreen();
  });

  it('keeps the Chai warm rather than shaming a wave', () => {
    render(
      <SignalEncounterDialog
        encounter={encounter({ state: 'waved' })}
        colors={colors}
        onPlay={jest.fn()}
        onWave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('signal-dialog-body')).toHaveTextContent(
      /the signalman kept your Chai/,
    );
    // A wave never burns the reward: the chip still stands.
    expect(screen.getByTestId('signal-chai-chip')).toHaveTextContent(/\+3 Chai/);
  });

  it('waves straight through when no game fits the zone', () => {
    const onWave = jest.fn();
    render(
      <SignalEncounterDialog
        encounter={encounter({ game: null })}
        colors={colors}
        onPlay={jest.fn()}
        onWave={onWave}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('signal-autowave-quip')).toHaveTextContent(/Green flag/);
    expect(screen.queryByTestId('signal-play-game')).toBeNull();
    fireEvent.press(screen.getByTestId('signal-carry-on'));
    expect(onWave).toHaveBeenCalledTimes(1);
  });

  it('hands the launch the game it actually offered', () => {
    const onPlay = jest.fn();
    render(
      <SignalEncounterDialog
        encounter={encounter()}
        colors={colors}
        onPlay={onPlay}
        onWave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('signal-play-game'));
    expect(onPlay).toHaveBeenCalledWith(
      expect.objectContaining({ gap: 3, zoneId: 2, game: expect.objectContaining({ id: game.id }) }),
    );
  });
});

// ─── memory layer ───────────────────────────────────────────────────────────

describe('signal memory', () => {
  beforeEach(async () => {
    resetSignalMemory();
    await AsyncStorage.clear();
  });

  it('survives a restart for clears and does not for waves', async () => {
    markSignalWaved('gu', 1);
    await markSignalCleared('gu', 3);

    // Simulate the app being killed and relaunched: in-memory state is gone.
    resetSignalMemory();
    expect(isSignalWaved('gu', 1)).toBe(false); // session scoped, like web
    expect(isSignalCleared('gu', 3)).toBe(false); // not hydrated YET

    await hydrateClearedSignals('gu');
    expect(isSignalCleared('gu', 3)).toBe(true); // device scoped, restored
    expect(isSignalWaved('gu', 1)).toBe(false);
  });

  it('keeps one language out of another language journey', async () => {
    await markSignalCleared('gu', 5);
    await hydrateClearedSignals('hi');
    expect(isSignalCleared('gu', 5)).toBe(true);
    expect(isSignalCleared('hi', 5)).toBe(false);
    expect(await AsyncStorage.getItem(clearedStorageKey('hi'))).toBeNull();
  });

  it('does not lose a clear marked while hydration was still in flight', async () => {
    // Race: the learner clears a crossing before the disk read lands.
    const inFlight = hydrateClearedSignals('gu');
    await markSignalCleared('gu', 7);
    await inFlight;
    expect(isSignalCleared('gu', 7)).toBe(true);
  });

  it('hydrates through the hook and reports when render may trust it', async () => {
    await markSignalCleared('gu', 9);
    resetSignalMemory();

    const { result } = renderHook(() => useSignalMemory('gu'));
    // First paint: nothing read off disk yet, so nothing claims to be cleared.
    expect(result.current.hydrated).toBe(false);
    expect(result.current.isCleared(9)).toBe(false);

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isCleared(9)).toBe(true);
  });

  it('bumps its version so the map re-derives after a local mark', async () => {
    const { result } = renderHook(() => useSignalMemory('gu'));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const before = result.current.version;
    act(() => result.current.markWaved(4));
    expect(result.current.version).toBeGreaterThan(before);
    expect(result.current.isWaved(4)).toBe(true);
  });
});
