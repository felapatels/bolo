import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  // dismissTo since 2026-09-14: both screens pop to the open map from a stop.
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), dismissTo: jest.fn() }),
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
import { bookConcepts, storyBookFor } from '@workspace/story';

/** The zone 1 book, which is what this screen opens on with no params. */
const BOOK = storyBookFor(1, 1)!;

beforeEach(async () => {
  mockStoryData = undefined;
  // THE LEDGER SURVIVES A TEST, which it did not have to before: no case in
  // this file finished a book until 2026-09-15. AsyncStorage's mock is one
  // store for the whole file, so a saved book from the case above restores as
  // FINISHED in the case below and the next render opens on "Read it again"
  // instead of the story. The web twin has cleared localStorage in its
  // beforeEach from the day it was written.
  await AsyncStorage.clear();
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
 * INVERTED ON 2026-09-15, because the button is gone. The owner removed the
 * beat it existed to leave, off a later TestFlight build: "after you make a
 * selection, you don't need the one screen in the middle. should just go to the
 * next question but show what you selected previously on top of the options.
 * there is an additional screen in between that's useless." A button that
 * cannot be pressed in the wrong place is best fixed by there being no button,
 * so the pins below say it is ABSENT, and say what happens instead. Nothing is
 * deleted: the 2026-09-08 report is the reason this block exists and the
 * `within` vacuity guard it was built around is kept, pointed at what the frame
 * holds now.
 */
describe('the storybook advances on the pick itself', () => {
  const PHRASES = [
    { concept: 'good morning', phraseId: 1, nativeScript: 'नमस्ते', romanized: 'namaste', english: 'good morning' },
    { concept: 'goodbye', phraseId: 2, nativeScript: 'अलविदा', romanized: 'alvida', english: 'goodbye' },
    { concept: 'how much is this?', phraseId: 3, nativeScript: 'कितने का है', romanized: 'kitne ka hai', english: 'how much is this?' },
  ];

  /** Every concept the zone 1 book names, the way the server would send them. */
  const WHOLE_BOOK = bookConcepts(BOOK).map((concept, i) => ({
    concept,
    phraseId: i + 1,
    nativeScript: `native:${concept}`,
    romanized: `roman:${concept}`,
    english: `english:${concept}`,
  }));

  test('offers no Next button before a line is chosen', async () => {
    mockStoryData = { limited: false, phrases: PHRASES };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    expect(screen.queryByTestId('storybook-next')).toBeNull();
  });

  test('offers no Next button AFTER one either: the pick is the page turn', async () => {
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    const frame = await screen.findByTestId('storybook-frame');
    fireEvent.press(screen.getByTestId(`storybook-choice-${BOOK.scenes[0]!.choices[0]!.concept}`));

    // THE VACUITY GUARD FIRST, and this test needs one as much as the old one
    // did. Every assertion here rests on `within` actually SCOPING to the
    // frame's subtree. The back button is unambiguously outside the frame, so
    // it is the negative control: these lines fail the moment `within` stops
    // scoping and starts quietly searching the whole tree.
    expect(within(frame).queryByTestId('storybook-back')).toBeNull();
    expect(screen.getByTestId('storybook-back')).toBeOnTheScreen();

    // Gone from the frame, where it used to sit, and gone from the page.
    expect(within(frame).queryByTestId('storybook-next')).toBeNull();
    expect(screen.queryByTestId('storybook-next')).toBeNull();
  });

  test('shows what you said, and its consequence, above the NEXT set of lines', async () => {
    // The owner's words for what should replace the middle page: "show what you
    // selected previously on top of the options". The consequence is authored
    // content and went with it rather than being dropped: the still, because
    // the joke is the picture and a picture needs no translating, and its brief
    // beside it.
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    const first = BOOK.scenes[0]!.choices[0]!;
    fireEvent.press(screen.getByTestId(`storybook-choice-${first.concept}`));

    const said = screen.getByTestId('storybook-said');
    expect(within(said).getByText(`native:${first.concept}`)).toBeTruthy();
    expect(within(said).getByText(`english:${first.concept}`)).toBeTruthy();
    // Zone 1 must author every consequence, or the assertion below is vacuous.
    // (jest's expect takes no message argument; the web twin's vitest does.)
    expect(first.outcome).toBeDefined();
    expect(within(said).getByText(first.outcome!.situation)).toBeTruthy();
    expect(screen.getByTestId('storybook-said-still')).toBeTruthy();

    // And the board underneath is the NEXT scene's, not the one just answered.
    for (const choice of BOOK.scenes[1]!.choices) {
      expect(screen.getByTestId(`storybook-choice-${choice.concept}`)).toBeOnTheScreen();
    }
    expect(screen.queryByTestId(`storybook-choice-${first.concept}`)).toBeNull();
  });

  test('the last line reaches the finished book with no further press', async () => {
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    for (const scene of BOOK.scenes) {
      const concept = scene.choices[0]!.concept;
      fireEvent.press(screen.getByTestId(`storybook-choice-${concept}`));
    }
    // The ledger, straight off the fifth pick. It took a sixth press until
    // 2026-09-15, on a page whose only job was to hold a button.
    expect(screen.getByTestId('storybook-book')).toBeOnTheScreen();
  });

  /**
   * THE DEAD END, AND IT IS THE OTHER HALF OF 2026-09-15.
   *
   * The owner opened a story stop on the SEA fork in Tagalog and got a
   * full-screen "This story is not ready in Tagalog yet" with a Back button and
   * nothing else to do: "this isn't ok". One scene naming one word the corpus
   * lacks was enough to do that, even where the book's other four scenes were
   * fine. A scene that cannot be drawn is stepped over now.
   */
  test('a book whose FIRST scene the language cannot carry still opens and runs', async () => {
    const missing = BOOK.scenes[0]!.choices[0]!.concept;
    mockStoryData = {
      limited: false,
      phrases: WHOLE_BOOK.filter((p) => p.concept !== missing),
    };
    render(<StorybookScreen />);

    // Not the dead end, and not a part-drawn first scene either: the book opens
    // on the first beat it CAN draw whole.
    await screen.findByTestId('storybook-frame');
    expect(screen.queryByTestId('storybook-short')).toBeNull();
    const opened = BOOK.scenes.find((sc) => sc.choices.every((c) => c.concept !== missing))!;
    for (const choice of opened.choices) {
      expect(screen.getByTestId(`storybook-choice-${choice.concept}`)).toBeOnTheScreen();
    }
  });

  test('and only a book with NO drawable scene is told it is not ready', async () => {
    // The one state in which that sentence is true. Kept, and now reachable
    // only from there.
    mockStoryData = { limited: false, phrases: [] };
    render(<StorybookScreen />);
    expect(await screen.findByTestId('storybook-short')).toBeOnTheScreen();
    expect(screen.queryByTestId('storybook-frame')).toBeNull();
  });
});
