// Build 35 mobile parity — zone closeout: the two-beat celebration, its
// hydrated stage memory, first-sight seeding, the grant-only payoff claim,
// and suppression in both directions.
//
// The stage memory is exercised as a unit as well as through the overlay:
// it is the thing standing between an existing learner and a burst of
// retroactive celebrations for zones they finished months ago, and no
// overlay-level assertion would notice it silently degrading to "celebrate
// everything".

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── mocks ───────────────────────────────────────────────────────────────────

const mockState = {
  push: jest.fn(),
  isPlus: false,
  isLoading: false,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockState.push, back: jest.fn(), replace: jest.fn() }),
  // The real hook fires whenever the map regains focus. On mount is enough
  // here: the guard it clears is only ever SET by a navigation away.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(cb, []);
  },
}));

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

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

jest.mock('@/components/Mascot', () => {
  const { Text } = require('react-native');
  return { Mascot: ({ pose }: { pose: string }) => <Text>{`mascot-${pose}`}</Text> };
});

jest.mock('@/components/Confetti', () => {
  const { View } = require('react-native');
  return { Confetti: () => <View testID="closeout-confetti" /> };
});

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: mockState.isPlus, isLoading: mockState.isLoading }),
}));

import {
  ZoneCloseoutOverlay,
  type CloseoutZone,
} from '@/components/journey/ZoneCloseout';
import {
  closeoutOwed,
  closeoutStateUnseeded,
  closeoutStorageKey,
  hydrateCloseoutStages,
  markCloseoutGranted,
  readCloseoutStages,
  resetCloseoutMemory,
  seedCloseoutStages,
  useCloseoutMemory,
  writeCloseoutStage,
} from '@/lib/closeoutMemory';

const LANG = 'gu';
const KEY = closeoutStorageKey(LANG);
const HIDDEN = { includeHiddenElements: true } as const;

const colors = {
  foreground: '#1A1A1A',
  mutedForeground: '#888888',
  card: '#F5F5F5',
  border: '#E0E0E0',
  muted: '#EEEEEE',
  primary: '#6C3FC5',
  primaryForeground: '#FFFFFF',
};

/** Zone 1 finished, zone 2 still running. Zone ids are category ids. */
const ZONES: CloseoutZone[] = [
  { zoneIndex: 0, zoneId: 7, geoName: 'Ahmedabad', title: 'Greetings', allDone: true },
  { zoneIndex: 1, zoneId: 8, geoName: 'Vadodara', title: 'Food', allDone: false },
];

function Host({
  zones = ZONES,
  blocked = false,
  onOpenWallet = jest.fn(),
}: {
  zones?: CloseoutZone[];
  blocked?: boolean;
  onOpenWallet?: () => void;
}) {
  const memory = useCloseoutMemory(LANG);
  return (
    <ZoneCloseoutOverlay
      lang={LANG}
      lineName="Garba Express"
      accent="#E4572E"
      colors={colors}
      zones={zones}
      memory={memory}
      blocked={blocked}
      onOpenWallet={onOpenWallet}
    />
  );
}

/** Put the device past first sight with the given stages already stored. */
async function seedDevice(stages: Record<number, string> = {}) {
  await AsyncStorage.setItem(KEY, JSON.stringify(stages));
}

beforeEach(async () => {
  resetCloseoutMemory();
  await AsyncStorage.clear();
  mockState.push = jest.fn();
  mockState.isPlus = false;
  mockState.isLoading = false;
});

// ─── stage memory ────────────────────────────────────────────────────────────

describe('closeout stage memory', () => {
  test('an absent key reads as unseeded, a stored one as seeded', async () => {
    await hydrateCloseoutStages(LANG);
    expect(closeoutStateUnseeded(LANG)).toBe(true);
    expect(readCloseoutStages(LANG)).toEqual({});

    resetCloseoutMemory();
    await seedDevice({ 0: 'done' });
    await hydrateCloseoutStages(LANG);
    expect(closeoutStateUnseeded(LANG)).toBe(false);
    expect(readCloseoutStages(LANG)).toEqual({ 0: 'done' });
  });

  test('discards malformed keys and values rather than trusting them', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ 0: 'nope', notAnIndex: 'done', 2: 'beat2' }),
    );
    await hydrateCloseoutStages(LANG);
    expect(readCloseoutStages(LANG)).toEqual({ 2: 'beat2' });
    // Still seeded: the key exists, so first sight is over regardless.
    expect(closeoutStateUnseeded(LANG)).toBe(false);
  });

  test('hydration MERGES: a stage written in flight survives the disk read', async () => {
    await seedDevice({ 0: 'done' });
    // Written before the slower disk read lands.
    writeCloseoutStage(LANG, 3, 'beat2');
    await hydrateCloseoutStages(LANG);
    expect(readCloseoutStages(LANG)).toEqual({ 0: 'done', 3: 'beat2' });
  });

  test('seeding marks every already-done zone done and persists it', async () => {
    await hydrateCloseoutStages(LANG);
    seedCloseoutStages(LANG, [0, 2]);
    expect(readCloseoutStages(LANG)).toEqual({ 0: 'done', 2: 'done' });
    expect(closeoutStateUnseeded(LANG)).toBe(false);
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({
        0: 'done',
        2: 'done',
      });
    });
  });
});

// ─── suppression, direction one (soft stop holds for a pending closeout) ─────

describe('closeoutOwed (what the signal soft stop suppresses on)', () => {
  const hydratedSeeded = (stages: Record<number, 'beat2' | 'done'>) => ({
    hydrated: true,
    unseeded: false,
    stages,
  });

  test('nothing is owed before hydration', () => {
    expect(closeoutOwed({ hydrated: false, unseeded: true, stages: {} }, [true])).toBe(
      false,
    );
  });

  test('first sight counts as owed until the seeding pass runs', () => {
    expect(closeoutOwed({ hydrated: true, unseeded: true, stages: {} }, [false])).toBe(
      true,
    );
  });

  test('a finished zone owes a celebration until its stage is done', () => {
    expect(closeoutOwed(hydratedSeeded({}), [true])).toBe(true);
    expect(closeoutOwed(hydratedSeeded({ 0: 'beat2' }), [true])).toBe(true);
    expect(closeoutOwed(hydratedSeeded({ 0: 'done' }), [true])).toBe(false);
  });

  test('an unfinished zone owes nothing', () => {
    expect(closeoutOwed(hydratedSeeded({}), [false, false])).toBe(false);
  });
});

// ─── first sight ─────────────────────────────────────────────────────────────

describe('first-sight seeding', () => {
  test('a zone finished before this shipped is closed out silently', async () => {
    render(<Host />);

    // The already-done zone is written straight to "done"...
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ 0: 'done' });
    });
    // ...and nothing celebrates on that pass.
    expect(screen.queryByTestId('zone-closeout-overlay', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('closeout-beat1', HIDDEN)).toBeNull();
  });

  test('a zone finished AFTER first sight still celebrates', async () => {
    await seedDevice({});
    render(<Host />);
    expect(await screen.findByTestId('closeout-beat1', HIDDEN)).toBeTruthy();
  });
});

// ─── the two beats, in order ─────────────────────────────────────────────────

describe('two-beat celebration', () => {
  test('beat one is the result, beat two the payoff, in that order', async () => {
    await seedDevice({});
    const first = render(<Host />);

    // Beat 1: the result.
    expect(await screen.findByTestId('closeout-beat1', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('closeout-confetti', HIDDEN)).toBeTruthy();
    expect(screen.getByText('mascot-cheer', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Zone 1 complete!', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('closeout-beat2', HIDDEN)).toBeNull();

    // The closeout game launch advances the stage BEFORE navigating.
    fireEvent.press(screen.getByTestId('closeout-game-cta', HIDDEN));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/games/ticket-check',
      params: { cat: '7', ctx: 'closeout' },
    });
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ 0: 'beat2' });
    });
    // The map stays mounted under the game, so the overlay must not re-open
    // the payoff beat on top of it.
    expect(screen.queryByTestId('zone-closeout-overlay', HIDDEN)).toBeNull();

    // Coming back to the map: beat 2, the payoff.
    first.unmount();
    render(<Host />);
    expect(await screen.findByTestId('closeout-beat2', HIDDEN)).toBeTruthy();
    expect(screen.getByText('mascot-wave', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('closeout-beat1', HIDDEN)).toBeNull();
    // No confetti on the payoff beat — the result beat carried that.
    expect(screen.queryByTestId('closeout-confetti', HIDDEN)).toBeNull();
  });

  test('skipping beat one still leads to the payoff, without navigating', async () => {
    await seedDevice({});
    render(<Host />);
    fireEvent.press(await screen.findByTestId('closeout-skip', HIDDEN));

    expect(await screen.findByTestId('closeout-beat2', HIDDEN)).toBeTruthy();
    expect(mockState.push).not.toHaveBeenCalled();
  });

  test('Plus riders get Speed Round, free riders Ticket Check on the zone', async () => {
    mockState.isPlus = true;
    await seedDevice({});
    render(<Host />);
    fireEvent.press(await screen.findByTestId('closeout-game-cta', HIDDEN));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/games/speed-round',
      params: { ctx: 'closeout' },
    });
  });

  test('Plus fails closed while entitlements are still loading', async () => {
    mockState.isPlus = true;
    mockState.isLoading = true;
    await seedDevice({});
    render(<Host />);
    fireEvent.press(await screen.findByTestId('closeout-game-cta', HIDDEN));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/games/ticket-check',
      params: { cat: '7', ctx: 'closeout' },
    });
  });

  test('the wallet CTA closes the zone out for good', async () => {
    const onOpenWallet = jest.fn();
    await seedDevice({ 0: 'beat2' });
    const first = render(<Host onOpenWallet={onOpenWallet} />);
    fireEvent.press(await screen.findByTestId('closeout-wallet-cta', HIDDEN));

    expect(onOpenWallet).toHaveBeenCalled();
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ 0: 'done' });
    });
    first.unmount();
    render(<Host />);
    await waitFor(() =>
      expect(screen.queryByTestId('zone-closeout-overlay', HIDDEN)).toBeNull(),
    );
  });

  test('"Maybe later" also closes it out — nothing here gates', async () => {
    await seedDevice({ 0: 'beat2' });
    render(<Host />);
    fireEvent.press(await screen.findByTestId('closeout-later', HIDDEN));
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ 0: 'done' });
    });
  });
});

// ─── the payoff claim is grant-only ──────────────────────────────────────────

describe('payoff beat Chai claim', () => {
  test('claims nothing when the server granted nothing', async () => {
    await seedDevice({ 0: 'beat2' });
    render(<Host />);

    expect(await screen.findByTestId('closeout-beat2', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('closeout-chai-chip', HIDDEN)).toBeNull();
    expect(screen.queryByText(/\+\d+ Chai/, HIDDEN)).toBeNull();
  });

  test('claims exactly what the server reported, for that zone only', async () => {
    // Only the shell may record this, and only from a real chaiGranted.
    markCloseoutGranted(LANG, 7, 2);
    // A grant on a DIFFERENT zone must not decorate this one.
    markCloseoutGranted(LANG, 8, 2);
    await seedDevice({ 0: 'beat2' });
    render(<Host />);

    expect(await screen.findByTestId('closeout-chai-chip', HIDDEN)).toHaveTextContent(
      '+2 Chai',
    );
    expect(
      screen.getByText('Chacha-ji poured you 2 Chai for closing out Ahmedabad.', HIDDEN),
    ).toBeTruthy();
  });

  test('a zero grant is no grant', async () => {
    markCloseoutGranted(LANG, 7, 0);
    await seedDevice({ 0: 'beat2' });
    render(<Host />);
    expect(await screen.findByTestId('closeout-beat2', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('closeout-chai-chip', HIDDEN)).toBeNull();
  });
});

// ─── suppression, direction two (celebration holds for another dialog) ───────

describe('dialog suppression', () => {
  test('holds while another dialog owns the screen, then opens', async () => {
    await seedDevice({});
    const view = render(<Host blocked />);

    // Give hydration a turn: still nothing, because a dialog is up.
    await waitFor(() => expect(screen.queryByTestId('closeout-beat1', HIDDEN)).toBeNull());
    expect(screen.queryByTestId('zone-closeout-overlay', HIDDEN)).toBeNull();

    view.rerender(<Host blocked={false} />);
    expect(await screen.findByTestId('closeout-beat1', HIDDEN)).toBeTruthy();
  });

  test('the map suppresses the soft stop while a celebration is owed', async () => {
    // Direction one, as the map wires it: the same predicate the journey
    // passes into SignalSoftStop's `blocked`.
    await seedDevice({});
    await hydrateCloseoutStages(LANG);
    expect(
      closeoutOwed(
        { hydrated: true, unseeded: closeoutStateUnseeded(LANG), stages: readCloseoutStages(LANG) },
        ZONES.map((z) => z.allDone),
      ),
    ).toBe(true);

    writeCloseoutStage(LANG, 0, 'done');
    expect(
      closeoutOwed(
        { hydrated: true, unseeded: closeoutStateUnseeded(LANG), stages: readCloseoutStages(LANG) },
        ZONES.map((z) => z.allDone),
      ),
    ).toBe(false);
  });
});

// ─── beat 2, the two faces ───────────────────────────────────────────────────

describe('beat two offers a capstone when there is one', () => {
  // Ruled Aug 18 2026: the twins were converged on ONE rule for beat 2. A zone
  // with a capstone the learner has not done offers the conversation; every
  // other zone keeps the Chai payoff, whose real job is the wallet door that
  // nothing else in the game flow opens. Mobile could not do the first half
  // until scenario plumbing landed, which is why beat 2 used to be the payoff
  // unconditionally.
  const WITH_SCENE: CloseoutZone[] = [
    {
      zoneIndex: 0,
      zoneId: 7,
      geoName: 'Ahmedabad',
      title: 'Greetings',
      allDone: true,
      scenarioId: 'greetings-manners',
      hasStamp: false,
    },
  ];

  test('a zone with an unstamped capstone offers the conversation', async () => {
    await seedDevice({ 0: 'beat2' });
    render(<Host zones={WITH_SCENE} />);
    await waitFor(() => expect(screen.getByTestId('closeout-beat2')).toBeTruthy());

    expect(screen.getByTestId('closeout-chat-cta')).toBeTruthy();
    // The payoff's wallet door is not shown alongside it: one beat, one ask.
    expect(screen.queryByTestId('closeout-wallet-cta')).toBeNull();
  });

  test('taking the capstone routes into scenario mode and closes the zone', async () => {
    await seedDevice({ 0: 'beat2' });
    render(<Host zones={WITH_SCENE} />);
    await waitFor(() => expect(screen.getByTestId('closeout-beat2')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('closeout-chat-cta'));
    });

    expect(mockState.push).toHaveBeenCalledWith(
      '/(app)/(tabs)/chat?scenario=greetings-manners',
    );
    expect(screen.queryByTestId('zone-closeout-overlay')).toBeNull();
  });

  test('a zone already stamped gets the wallet beat, not the capstone again', async () => {
    await seedDevice({ 0: 'beat2' });
    render(<Host zones={[{ ...WITH_SCENE[0], hasStamp: true }]} />);
    await waitFor(() => expect(screen.getByTestId('closeout-beat2')).toBeTruthy());

    // A learner who already had the conversation is not asked to have it again.
    expect(screen.queryByTestId('closeout-chat-cta')).toBeNull();
    expect(screen.getByTestId('closeout-wallet-cta')).toBeTruthy();
  });

  test('a zone with no capstone in this language keeps the Chai payoff', async () => {
    // scenarioId absent is the honest signal that the server listed no scene
    // for this zone in this language. The beat still runs.
    await seedDevice({ 0: 'beat2' });
    render(<Host zones={[{ ...WITH_SCENE[0], scenarioId: undefined }]} />);
    await waitFor(() => expect(screen.getByTestId('closeout-beat2')).toBeTruthy());

    expect(screen.queryByTestId('closeout-chat-cta')).toBeNull();
    expect(screen.getByTestId('closeout-wallet-cta')).toBeTruthy();
  });
});
