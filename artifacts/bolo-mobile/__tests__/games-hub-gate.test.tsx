import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the fail-closed Plus gate on the games hub (Build 30 batch 3).
//
// While entitlements are loading or undefined, Plus-only tiles must behave
// as locked: tapping them routes to the paywall, never into the game.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
const mockPush = jest.fn();

// THE HUB READS THE LANGUAGE (build 21: the hero's language line is the
// switch), and this suite predates that; a bare hook throws without the
// provider. The mock is the shape the hub reads.
// THE HUB WALKS THE JOURNEY for its "Continue playing" line (build 21) through
// the same six queries the map fires; this suite has no QueryClient, so the
// hook is mocked to a fresh learner.
jest.mock('@/lib/useJourneyProgress', () => ({
  useJourneyProgress: () => ({ current: null, zones: [], doneCount: 0, totalCount: 0, isLoading: false, planBlocked: false }),
}));

// The active language is mutable so one test can ask what a learner in a
// language with no stroke data is offered. Default stays Hindi, so every
// existing test in this file is untouched.
let mockLang = 'hi';

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: mockLang,
    activeLanguage: { code: mockLang, name: 'Hindi', nativeName: 'हिन्दी', script: 'devanagari', fontFamily: '', rtl: false, sortOrder: 0 },
    languages: [],
    speechCapability: 'supported',
    timeZone: null,
  }),
}));

jest.mock('expo-router', () => ({
  // The hub refreshes its last-played line on focus (build 21).
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/entrance', () => ({
  // The safe entrances (lib/entrance.ts). No-ops here: these suites pin
  // content, and an entrance that returns undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
  useAppearSkip: () => true,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => mockState.entitlements,
}));

// THE HUB READS THE FREE TASTE (2026-09-04): three hub plays of each game that
// was free, then the card locks. `undefined` data is the pre-load state and
// must leave every card open, which is what most of the cases below run on.
jest.mock('@workspace/api-client-react', () => ({
  useGetGamePlays: () => ({ data: mockState.gamePlays }),
}));

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, {}, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, {}) };
});

jest.mock('@/components/GlobeButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { GlobeButton: () => React.createElement(View, {}) };
});

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, onPress, style, testID }: any) =>
      React.createElement(Pressable, { onPress, style, testID }, children),
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    gold: '#D4A017',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
}));

// Imported after all mocks.
import GamesScreen from '@/app/(app)/(tabs)/games/index';

beforeEach(() => {
  mockPush.mockClear();
  mockState.entitlements = { isPlus: false, isLoading: false };
  mockState.gamePlays = undefined;
});

/**
 * INVERTED 2026-09-08 BY THE OWNER'S RULING: "3 free games for all games before
 * paywall." Every game now opens for three plays before anything locks, so the
 * fail-CLOSED behaviour this block pinned is gone by design.
 *
 * It was not deleted, because the fail-closed instinct was right for what it
 * guarded: an unresolved entitlement must never hand out a paid game. What
 * changed is that there is no longer a paid game to hand out at the door. The
 * assertions now pin the replacement, which is that a spent taste locks and a
 * remaining one does not.
 *
 * The taste itself fails OPEN while its count loads, deliberately and with its
 * own comment in the hub: the server refuses the fourth run whatever the client
 * says, so failing open costs one refused run and failing closed would draw a
 * lock over a game the learner still has plays on every time the network is
 * slow.
 */
describe('games hub - every game opens before it locks', () => {
  it('opens a formerly All-Access tile while it still has plays', () => {
    mockState.entitlements = { isPlus: false, isLoading: false };
    mockState.gamePlays = { limit: 3, plays: {} };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Bolo Quiz'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/bolo-quiz');
  });

  it('locks that same tile and offers the upgrade once three are spent', () => {
    mockState.entitlements = { isPlus: false, isLoading: false };
    mockState.gamePlays = { limit: 3, plays: { 'bolo-quiz': 3 } };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Bolo Quiz'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('hands the badge over: plays left, then All-Access', () => {
    // The owner's words, 2026-09-08: "make sure after the free plays badge goes
    // away that the all access badge shows." A card that goes quiet when its
    // taste runs out reads as broken rather than as an offer.
    mockState.entitlements = { isPlus: false, isLoading: false };
    mockState.gamePlays = { limit: 3, plays: { 'speed-round': 1 } };
    const shown = render(<GamesScreen />);
    expect(screen.getByText('2 free plays left')).toBeOnTheScreen();
    shown.unmount();

    mockState.gamePlays = { limit: 3, plays: { 'speed-round': 3 } };
    render(<GamesScreen />);
    expect(screen.getAllByText('All-Access').length).toBeGreaterThan(0);
  });

  it('opens the game once entitlements have resolved to Plus', () => {
    mockState.entitlements = { isPlus: true, isLoading: false };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Bolo Quiz'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/bolo-quiz');
  });

  it('free games stay open while entitlements are loading', () => {
    mockState.entitlements = { isPlus: undefined, isLoading: true };
    render(<GamesScreen />);

    // Was Word Match. Commit 10257678 made Word Match and Listen & Pick
    // plusOnly, so this now uses Luggage Match, which is still free. The
    // behaviour under test is unchanged: a FREE game must open while
    // entitlements are still resolving, rather than bouncing to the paywall.
    fireEvent.press(screen.getByText('Luggage Match'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/luggage-match');
  });

  it('Word Match opens on its taste even while entitlements are unresolved', () => {
    // INVERTED 2026-09-08. This asserted the fail-CLOSED path: Word Match had
    // become a paid game, so an unresolved entitlement sent the learner to the
    // paywall. Every game has three plays now, so an unresolved entitlement is
    // no longer the question; the play count is, and it fails OPEN on purpose.
    mockState.entitlements = { isPlus: undefined, isLoading: true };
    mockState.gamePlays = { limit: 3, plays: {} };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Word Match'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/word-match');
  });
});

describe('games hub - the free taste', () => {
  // THE OWNER'S RULING, 2026-09-04: the games that were free become three
  // plays and then the paywall; the All-Access ones do not move.
  const played = (n: number) => ({ limit: 3, plays: { 'ticket-check': n } });

  it('says how many plays are left, in words rather than in a colour', () => {
    // The pill keeps its green throughout. A learner who cannot see the hue
    // still reads the state, which is why the count is on the pill's text.
    mockState.gamePlays = played(1);
    render(<GamesScreen />);
    expect(screen.getByText('2 free plays left')).toBeTruthy();
  });

  it('locks the card once the third play is spent, and offers the upgrade', () => {
    mockState.gamePlays = played(3);
    render(<GamesScreen />);
    // INVERTED 2026-09-08. The pill used to read "Free taste used", a
    // past-tense sentence with nothing to do. The owner asked for the handover
    // instead: "after the free plays badge goes away the all access badge
    // shows", so a spent card stops describing what happened and starts
    // offering what is next.
    expect(screen.queryByText('Free taste used')).toBeNull();
    expect(screen.getAllByText('All-Access').length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText('Ticket Check'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('leaves the card open while the count is still loading', () => {
    // FAILS OPEN ON PURPOSE. The server refuses the record past three whatever
    // this says, so the worst a slow network costs is one refused run; failing
    // closed would draw a lock over a game the learner still has plays on.
    mockState.gamePlays = undefined;
    render(<GamesScreen />);
    fireEvent.press(screen.getByText('Ticket Check'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/ticket-check');
  });

  it('never counts down at an entitled learner', () => {
    // Plus has no ceiling, and a number ticking down at somebody who has paid
    // to remove it is worse than no number at all.
    mockState.entitlements = { isPlus: true, isLoading: false };
    mockState.gamePlays = played(3);
    render(<GamesScreen />);
    expect(screen.queryByText('Free taste used')).toBeNull();
    fireEvent.press(screen.getByText('Ticket Check'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/ticket-check');
  });

  it('gives even the last All-Access holdout its three plays', () => {
    // INVERTED. Wrong Platform 2 was deliberately OUTSIDE the taste under the
    // 2026-09-04 ruling, whose other half was that All-Access games do not
    // move. The 2026-09-08 ruling moves them: "3 free games for ALL games".
    // This is the tile that proves the word "all" was taken literally.
    mockState.gamePlays = { limit: 3, plays: {} };
    render(<GamesScreen />);
    fireEvent.press(screen.getByText('Wrong Platform 2'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/wrong-platform-2');
  });
});

/**
 * BOUGHT PLAYS: THE POOL HAD TO REACH THE CLIENT'S GATE, AND IT DID NOT.
 *
 * Chai buys game plays in packs. The server tracks the pool, both server gates
 * (learning.ts and chachaCall.ts) pass it into `gameTasteState`, and
 * GET /games/plays serves it as `credits`. THE HUB READ THAT FIELD AND THREW IT
 * AWAY: `credits` defaults to 0 inside gameTasteState, so a learner who had
 * PAID for plays still saw every spent card locked and could not reach the game
 * they had bought. The server would have allowed the play. Only the hub refused.
 *
 * NOTHING FAILED WHEN IT WAS BROKEN, which is the reason these exist. The
 * package's own unit tests prove gameTasteState honours a pool it is GIVEN, and
 * every hub fixture in this file omits `credits` entirely, so the argument being
 * absent was invisible from both ends. Same shape as the two fields that sat on
 * the wire with no client able to see them, one layer out.
 *
 * The fixtures below therefore pass `credits` EXPLICITLY. A fixture that omits
 * it tests the old behaviour and passes either way.
 */
describe('games hub - bought plays', () => {
  const spentWith = (credits: number) => ({
    limit: 3,
    plays: { 'ticket-check': 3 },
    credits,
  });

  it('a spent taste with credits in the pool is PLAYABLE, not locked', () => {
    // THE REGRESSION GUARD. Before the fix this pressed through to /paywall,
    // which is the app refusing a learner the thing they had just bought.
    mockState.gamePlays = spentWith(5);
    render(<GamesScreen />);
    fireEvent.press(screen.getByText('Ticket Check'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/ticket-check');
  });

  it('and an EMPTY pool still locks it, so the fix did not just open the door', () => {
    // The negative control. Without this, "credits are honoured" and "the lock
    // was removed" are indistinguishable, and only one of them is the fix.
    mockState.gamePlays = spentWith(0);
    render(<GamesScreen />);
    fireEvent.press(screen.getByText('Ticket Check'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('shows the pool on the hub, because a thing you bought must be visible', () => {
    mockState.gamePlays = spentWith(5);
    render(<GamesScreen />);
    expect(screen.getByTestId('games-credits-count')).toHaveTextContent('5 bought plays');
  });

  it('says "play" not "plays" when there is one, because copy is not a template', () => {
    mockState.gamePlays = spentWith(1);
    render(<GamesScreen />);
    expect(screen.getByTestId('games-credits-count')).toHaveTextContent('1 bought play');
  });

  it('offers the route past a locked card when the pool is empty', () => {
    // An empty pool AND a spent taste is a learner staring at a locked card.
    // The tile is the only route to playing it, so it appears rather than
    // leaving them at a dead end.
    mockState.gamePlays = spentWith(0);
    render(<GamesScreen />);
    expect(screen.getByTestId('games-credits-count')).toHaveTextContent('No bought plays left');
  });

  it('shows NOTHING to a learner who has spent nothing and bought nothing', () => {
    // A permanent "buy plays" strip above the grid is a nag. Same argument that
    // keeps the gift box off Home on a day nothing was practised.
    mockState.gamePlays = { limit: 3, plays: {}, credits: 0 };
    render(<GamesScreen />);
    expect(screen.queryByTestId('games-credits-tile')).toBeNull();
  });

  it('shows nothing to All-Access, who have no ceiling to raise', () => {
    mockState.entitlements = { isPlus: true, isLoading: false };
    mockState.gamePlays = spentWith(5);
    render(<GamesScreen />);
    expect(screen.queryByTestId('games-credits-tile')).toBeNull();
  });
});

/**
 * SCRIPT TRACE IS NOT ADVERTISED IN A LANGUAGE THAT CANNOT PLAY IT.
 *
 * The catalogue carried a comment saying "the screen still gates itself on
 * traceReadyFor(), so this entry cannot open onto an empty game". IT DID NOT.
 * script-trace.tsx never mentions traceReadyFor; there was no readiness gate at
 * any level. East Asia shipped the consequence in its own tree, a plusOnly tile
 * advertised to ten languages none of which are trace-ready, and reported the
 * false comment back because "it came from somewhere". It came from here.
 *
 * BENIGN IN INDIA AND MEASURED RATHER THAN ASSUMED: traceReadyFor is false for
 * exactly one code, `si`, and production /api/languages returns 22 codes with no
 * si in them. So these tests pin a rule that changes nothing here today and is
 * correct in every fork that inherits the file, which is the only reason to
 * write it in the parent.
 */
describe('games hub - a game its language cannot play is not offered', () => {
  afterEach(() => {
    mockLang = 'hi';
  });

  it('offers Script Trace in a trace-ready language', () => {
    // gu has an alphabet a speaker actually traced, so this is the positive
    // control: without it, a gate that hid the tile ALWAYS would also pass the
    // test below and look like a fix.
    mockState.gamePlays = { limit: 3, plays: {}, credits: 0 };
    render(<GamesScreen />);
    expect(screen.getByText('Script Trace')).toBeTruthy();
  });

  it('and withholds it where there is no stroke data to trace', () => {
    // si is the one code in the library that fails traceReadyFor. India does not
    // ship Sinhala, so this asserts the RULE rather than a live India state, and
    // it is the fork case that matters.
    mockLang = 'si';
    render(<GamesScreen />);
    expect(screen.queryByText('Script Trace')).toBeNull();
    // The rest of the catalogue is untouched: this hides one game, not a grid.
    expect(screen.getByText('Ticket Check')).toBeTruthy();
  });
});
