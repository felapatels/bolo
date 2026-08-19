/**
 * Mobile XP strip component tests, the three visual states of the daily train
 * class ladder.
 *
 * Deliberately mirrors artifacts/gujarati-coach/src/test/xp-counter.test.tsx
 * state for state: both platforms read the same shared ladder, so they must
 * show the same number, the same class and the same bar for the same learner.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react-native';

const state = { todayXp: 0 };

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#4F46E5',
    mutedForeground: '#64748B',
    border: '#E2E8F0',
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    languages: [],
    activeLang: 'gu',
    activeLanguage: undefined,
    speechCapability: 'supported',
    timezone: 'Asia/Kolkata',
    setActiveLang: jest.fn(),
    adoptLanguageLocally: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetProgressSummary: () => ({ data: { todayXp: state.todayXp } }),
  getGetProgressSummaryQueryKey: (params: unknown) => ['progress', params],
}));

import { XpCounter } from '@/components/XpCounter';

beforeEach(() => {
  // The strip schedules a timer for the learner's next local midnight (up to
  // 24h out). Under real timers that handle keeps the jest worker alive after
  // the suite finishes.
  jest.useFakeTimers();
  cleanup();
  state.todayXp = 0;
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('XpCounter, below the first rung (no class yet)', () => {
  it('fills toward Local and names no class', () => {
    state.todayXp = 40;
    render(<XpCounter variant="chrome" />);

    expect(screen.getByLabelText('40 of 100 XP today')).toBeOnTheScreen();
    expect(screen.queryByTestId('xp-train-class')).toBeNull();
    expect(screen.getByTestId('xp-meter-bar')).toBeOnTheScreen();
  });

  it('never names the attempts goal it used to divide by', () => {
    state.todayXp = 254;
    render(<XpCounter variant="chrome" />);
    expect(screen.queryByText('/10')).toBeNull();
  });
});

describe('XpCounter, mid-ladder (a class in hand)', () => {
  it('shows the held class beside the next rung', () => {
    state.todayXp = 254;
    render(<XpCounter variant="chrome" />);

    expect(
      screen.getByLabelText('254 of 400 XP today, Superfast class'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('xp-train-class')).toHaveTextContent('Superfast');
    expect(screen.getByTestId('xp-meter-bar')).toBeOnTheScreen();
  });

  it('the bar fill matches the visible fraction, never pinned full', () => {
    state.todayXp = 254;
    render(<XpCounter variant="chrome" />);

    const track = screen.getByTestId('xp-meter-bar');
    // chrome track = 76px wide; fill is 254/400 of it, not the whole bar.
    const fill = track.props.children;
    expect(fill.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: (254 / 400) * 76 }),
      ]),
    );
  });
});

describe('XpCounter, top of the ladder', () => {
  it('renders the class name alone: no bar, no fraction', () => {
    state.todayXp = 900;
    render(<XpCounter variant="chrome" />);

    expect(screen.getByTestId('xp-train-class')).toHaveTextContent('Shatabdi');
    expect(screen.queryByTestId('xp-meter-bar')).toBeNull();
    expect(screen.queryByText('XP')).toBeNull();
    expect(
      screen.getByLabelText('Shatabdi class, 900 XP today, top class reached'),
    ).toBeOnTheScreen();
  });
});

describe('XpCounter, compact session variant', () => {
  it('carries the held class mid-ladder', () => {
    state.todayXp = 254;
    render(<XpCounter variant="session" />);
    expect(screen.getByTestId('xp-train-class')).toHaveTextContent('Superfast');
  });

  it('still shows the top class, so the top state is never empty', () => {
    // The compact variant must carry the class name: at the top of the ladder
    // the name IS the whole strip, so dropping it here would leave an empty
    // slot in the practice/review header.
    state.todayXp = 900;
    render(<XpCounter variant="session" />);
    expect(screen.getByTestId('xp-train-class')).toHaveTextContent('Shatabdi');
  });

  it('widens the short session track for a three-digit denominator', () => {
    state.todayXp = 254;
    render(<XpCounter variant="session" />);
    // Grew from the old 44px, sized when the denominator was the one- or
    // two-digit attempts goal.
    const track = screen.getByTestId('xp-meter-bar');
    expect(track.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 64 })]),
    );
  });
});
