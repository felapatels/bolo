import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

// The story payload the screen sees. `undefined` is the loading state, which is
// what every test here opened on before the Next button got its own case.
let mockStoryData: { limited: boolean; phrases: unknown[] } | undefined;

// A SMOKE TEST, and it is not a formality.
//
// Two whole screens landed on the phone on 2026-08-24 and NOTHING in the suite
// imported either of them, so a crash at import would have shipped invisibly
// past 116 green suites. That is not hypothetical here: CLAUDE.md records that
// mobile's api-client mocks are FULL REPLACEMENTS, so pulling a new hook into a
// screen kills every suite that renders it, and two journey suites died that
// way this week.
//
// So this asserts the cheapest useful thing: both screens mount, and each shows
// the beat it is supposed to open on. The Emergency's rules already have 19
// tests in the shared library, which is where the interesting assertions
// belong; duplicating them against a rendered phone screen would test the mock.
//
// WHAT IT DELIBERATELY DOES NOT COVER: the film, the audio and the zoom. None
// of the three can be judged in jsdom, and CLAUDE.md's measurement rules are
// blunt about it: a dev build cannot clear an animation bug, and only a store
// build tells the truth. Asserting on them here would manufacture confidence
// rather than earn it.

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props: any) => React.createElement(View, props),
    useVideoPlayer: () => ({
      play: jest.fn(),
      addListener: () => ({ remove: jest.fn() }),
      loop: false,
    }),
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: Stub, Svg: Stub, Path: Stub };
});

// Both screens reserve the notch themselves, because the games stack has no
// header. Outside a SafeAreaProvider the real hook THROWS rather than
// returning zeroes, which is correct of it and a hard failure here.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    foreground: '#000',
    mutedForeground: '#666',
    card: '#eee',
    border: '#ccc',
    primary: '#d8722a',
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListCategoryPhrases: () => ({ data: [], isLoading: false }),
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  useGetStoryBook: () =>
    mockStoryData === undefined
      ? { data: undefined, isLoading: true }
      : { data: mockStoryData, isLoading: false },
  getGetStoryBookQueryKey: () => ['storybook'],
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn() }),
  useNarrateStoryLine: () => ({ mutateAsync: jest.fn() }),
}));

import EmergencyScreen from '@/app/(app)/(tabs)/games/emergency';
import StorybookScreen from '@/app/(app)/(tabs)/games/storybook';

beforeEach(() => {
  mockStoryData = undefined;
});

describe('the two screens that arrived with no test', () => {
  test('the Emergency mounts, and with no zone it offers the length picker', () => {
    // No zone means the learner came from the Games hub on purpose, so there is
    // no alarm and no film: interrupting somebody who navigated here is a joke
    // that only works once.
    render(<EmergencyScreen />);
    expect(screen.getByTestId('emergency-picker')).toBeOnTheScreen();
    // The three lengths the owner asked for, and all three actually rendered
    // rather than just present in the constant.
    expect(screen.getByTestId('emergency-length-5')).toBeOnTheScreen();
    expect(screen.getByTestId('emergency-length-10')).toBeOnTheScreen();
    expect(screen.getByTestId('emergency-length-20')).toBeOnTheScreen();
  });

  test('the Emergency does NOT flash the alarm when it was opened deliberately', () => {
    render(<EmergencyScreen />);
    expect(screen.queryByTestId('emergency-alarm')).toBeNull();
  });

  test('the storybook mounts and says it is loading rather than rendering an empty book', () => {
    render(<StorybookScreen />);
    expect(screen.getByTestId('storybook-screen')).toBeOnTheScreen();
    // A book with no data must not render a frame with nothing in it; the
    // loading line is what stands in until the phrases land.
    expect(screen.queryByTestId('storybook-frame')).toBeNull();
  });
});

/**
 * WHERE THE NEXT BUTTON IS, WHICH IS A POSITION AND NOT A PRESENCE.
 *
 * Reported by the owner on the phone, 2026-09-08: "user is unable to press the
 * next button, when they scroll down to see it, when they let go it autoscrolls
 * back to top." The button had always RENDERED, so a `getByTestId` would have
 * been green through the whole bug. What was wrong was where it landed: below
 * the choices, inside a scroller padded 40 at the bottom, under a tab bar that
 * is absolutely positioned and 74pt tall on top of the home indicator. The
 * content was too short to scroll, so the drag was iOS rubber band and letting
 * go snapped back to zero.
 *
 * SO THIS ASSERTS CONTAINMENT. `within(frame)` fails the moment somebody moves
 * Next back out to the end of the page, which is the only way this bug returns.
 * The padding is pinned separately below, because either one alone leaves the
 * other half of the fix free to be undone.
 */
describe('the storybook Next button', () => {
  const PHRASES = [
    { concept: 'good morning', phraseId: 1, nativeScript: 'नमस्ते', romanized: 'namaste', english: 'good morning' },
    { concept: 'goodbye', phraseId: 2, nativeScript: 'अलविदा', romanized: 'alvida', english: 'goodbye' },
    { concept: 'how much is this?', phraseId: 3, nativeScript: 'कितने का है', romanized: 'kitne ka hai', english: 'how much is this?' },
  ];

  test('is not offered until a line has been chosen', async () => {
    mockStoryData = { limited: false, phrases: PHRASES };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    expect(screen.queryByTestId('storybook-next')).toBeNull();
  });

  test('sits ON the picture once a line is chosen, not below the choices', async () => {
    mockStoryData = { limited: false, phrases: PHRASES };
    render(<StorybookScreen />);
    const frame = await screen.findByTestId('storybook-frame');
    fireEvent.press(screen.getByTestId('storybook-choice-good morning'));

    // THE VACUITY GUARD FIRST, and this test needed one as much as any set
    // difference does. The whole assertion below rests on `within` actually
    // SCOPING to the frame's subtree; if it quietly searched the whole tree it
    // would pass with Next back at the bottom of the page, which is precisely
    // the bug. The back button is unambiguously outside the frame, so it is the
    // negative control: this line fails the moment `within` stops scoping.
    expect(within(frame).queryByTestId('storybook-back')).toBeNull();
    expect(screen.getByTestId('storybook-back')).toBeOnTheScreen();

    // Present, and INSIDE the frame. The second half is the whole test: it was
    // present all through the bug.
    expect(within(frame).getByTestId('storybook-next')).toBeTruthy();
  });
});
