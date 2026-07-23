import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the Speed Round combo-burst overlay added in Task 522:
//
//  • "HOT STREAK 🔥"    fires when streak reaches 3
//  • "ON FIRE ⚡"        fires when streak reaches 5
//  • "UNSTOPPABLE 💥"   fires when streak reaches 10
//  • The overlay auto-clears after 1 200 ms
//
// Strategy: use a single-phrase pool so every press is always the correct
// option (no shuffling ambiguity), and use Jest fake timers to control the
// 400 ms auto-advance and the 1 200 ms auto-clear.
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => {
  // Stable references — new arrays on every call would trigger the
  // useEffect([allPhrases]) shuffle on every render, causing an infinite loop.
  const CATS = [{ id: 42, title: 'Greetings', slug: 'greetings' }];
  const PHS = [{ id: 1, nativeScript: 'ક', romanized: 'ka', english: 'ka-en' }];
  return {
    useListCategories: () => ({ data: CATS, isLoading: false }),
    useListCategoryPhrases: () => ({ data: PHS, isLoading: false }),
    useRecordGameSession: () => ({ mutate: jest.fn() }),
    getGetProgressSummaryQueryKey: () => ['progress'],
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true, isLoading: false }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    secondary: '#0D9488',
    accent: '#F59E0B',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    destructive: '#EF4444',
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

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: () => <View /> };
});

// Import after all mocks.
import SpeedRoundScreen from '@/app/(app)/(tabs)/games/speed-round';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate from the setup screen into the playing screen. */
function startGame() {
  // The first category is auto-selected (no tap needed); just start.
  fireEvent.press(screen.getByText('Start Game'));
}

/**
 * Press the single correct option and advance the 400 ms auto-advance timer
 * so the next question loads.  The single-phrase pool means the correct
 * option label is always 'ka-en'.
 */
function pressCorrect() {
  fireEvent.press(screen.getByText('ka-en'));
  act(() => { jest.advanceTimersByTime(400); });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('combo burst overlay', () => {
  test('shows "HOT STREAK 🔥" when streak reaches 3', () => {
    render(<SpeedRoundScreen />);
    act(() => { startGame(); });

    // Two correct answers — streak=2, no milestone yet.
    pressCorrect();
    pressCorrect();
    expect(screen.queryByText('HOT STREAK 🔥')).toBeNull();

    // Third correct answer — streak=3, milestone fires.
    fireEvent.press(screen.getByText('ka-en'));
    expect(screen.getByText('HOT STREAK 🔥')).toBeOnTheScreen();
  });

  test('shows "ON FIRE ⚡" when streak reaches 5', () => {
    render(<SpeedRoundScreen />);
    act(() => { startGame(); });

    // Build to 4 (past the streak=3 milestone so the overlay has already fired).
    for (let i = 0; i < 4; i++) pressCorrect();

    // Fifth correct — streak=5.
    fireEvent.press(screen.getByText('ka-en'));
    expect(screen.getByText('ON FIRE ⚡')).toBeOnTheScreen();
  });

  test('shows "UNSTOPPABLE 💥" when streak reaches 10', () => {
    render(<SpeedRoundScreen />);
    act(() => { startGame(); });

    for (let i = 0; i < 9; i++) pressCorrect();

    // Tenth correct — streak=10.
    fireEvent.press(screen.getByText('ka-en'));
    expect(screen.getByText('UNSTOPPABLE 💥')).toBeOnTheScreen();
  });

  test('clears the overlay after 1 200 ms', () => {
    render(<SpeedRoundScreen />);
    act(() => { startGame(); });

    // Get to streak=3 so a burst appears.
    pressCorrect();
    pressCorrect();
    fireEvent.press(screen.getByText('ka-en'));
    expect(screen.getByText('HOT STREAK 🔥')).toBeOnTheScreen();

    // Advance past the 1 200 ms auto-clear timer.
    act(() => { jest.advanceTimersByTime(1200); });

    expect(screen.queryByText('HOT STREAK 🔥')).toBeNull();
  });

  test('a new milestone replaces the previous burst and resets the clear timer', () => {
    render(<SpeedRoundScreen />);
    act(() => { startGame(); });

    // Streak=3 → "HOT STREAK 🔥"
    pressCorrect();
    pressCorrect();
    fireEvent.press(screen.getByText('ka-en'));
    expect(screen.getByText('HOT STREAK 🔥')).toBeOnTheScreen();

    // Advance 600 ms (halfway through the first clear timer).
    act(() => { jest.advanceTimersByTime(600); });
    // Burst is still showing.
    expect(screen.getByText('HOT STREAK 🔥')).toBeOnTheScreen();

    // Streak=4 (non-milestone) — burst stays but timer keeps running.
    pressCorrect();

    // Streak=5 → "ON FIRE ⚡" replaces the previous burst; timer resets.
    fireEvent.press(screen.getByText('ka-en'));
    expect(screen.getByText('ON FIRE ⚡')).toBeOnTheScreen();
    expect(screen.queryByText('HOT STREAK 🔥')).toBeNull();

    // Advance another 600 ms — original timer would have expired but the
    // reset means the new burst is still within its 1 200 ms window.
    act(() => { jest.advanceTimersByTime(600); });
    expect(screen.getByText('ON FIRE ⚡')).toBeOnTheScreen();

    // Now let the full 1 200 ms for the new burst elapse.
    act(() => { jest.advanceTimersByTime(600); });
    expect(screen.queryByText('ON FIRE ⚡')).toBeNull();
  });
});
