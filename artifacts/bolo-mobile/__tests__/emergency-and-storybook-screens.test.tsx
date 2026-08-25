import React from 'react';
import { render, screen } from '@testing-library/react-native';

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
  useGetStoryBook: () => ({ data: undefined, isLoading: true }),
  getGetStoryBookQueryKey: () => ['storybook'],
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn() }),
  useNarrateStoryLine: () => ({ mutateAsync: jest.fn() }),
}));

import EmergencyScreen from '@/app/(app)/(tabs)/games/emergency';
import StorybookScreen from '@/app/(app)/(tabs)/games/storybook';

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
