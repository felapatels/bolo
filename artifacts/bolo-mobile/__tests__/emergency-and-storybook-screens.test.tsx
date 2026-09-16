import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

// The story payload the screen sees. `undefined` is the loading state, which is
// what every test here opened on before the Next button got its own case.
let mockStoryData: { limited: boolean; phrases: unknown[] } | undefined;
// A REQUEST THAT DID NOT ARRIVE (2026-09-16). Set, it wins over mockStoryData:
// the hook reports an error with no data, the way react-query does when the
// first fetch fails or is refused.
let mockStoryError: unknown;
const mockRefetch = jest.fn();

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

// THE SHARE'S TWO NATIVE MODULES (2026-09-16), mocked because neither has a
// native side under jest. The picture itself cannot be judged here; what can is
// that the layout waits on its stills, leaves a failed one out, captures a PNG
// tmpfile and hands it to the share sheet, and backs off when there is none.
const mockCaptureRef = jest.fn();
jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCaptureRef(...args),
}));
const mockShareAvailable = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockShareAvailable(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

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
    mockStoryError !== undefined
      ? {
          data: undefined,
          isLoading: false,
          isError: true,
          error: mockStoryError,
          isFetching: false,
          refetch: mockRefetch,
        }
      : mockStoryData === undefined
        ? { data: undefined, isLoading: true, isError: false, error: null, isFetching: true, refetch: mockRefetch }
        : { data: mockStoryData, isLoading: false, isError: false, error: null, isFetching: false, refetch: mockRefetch },
  getGetStoryBookQueryKey: () => ['storybook'],
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn() }),
  useNarrateStoryLine: () => ({ mutateAsync: jest.fn() }),
}));

import EmergencyScreen from '@/app/(app)/(tabs)/games/emergency';
import StorybookScreen from '@/app/(app)/(tabs)/games/storybook';
import { storyStillUrl } from '@/lib/mediaUrl';
import {
  bookConcepts,
  storyEnding,
  STORY_SHARE_CTA,
  outcomeStillId,
  storyBookFor,
  STORY_PUNCHLINE_MS,
  STORY_LOCKED,
  STORY_LOAD_FAILED,
} from '@workspace/story';

/** The zone 1 book, which is what this screen opens on with no params. */
const BOOK = storyBookFor(1, 1)!;

beforeEach(async () => {
  mockStoryData = undefined;
  mockStoryError = undefined;
  mockRefetch.mockReset();
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
/**
 * AND ON 2026-09-16 THE PICK GREW A PUNCHLINE, the mad-lib ruling (owner: "it
 * seems boring"). A pick shows that line's outcome still over the whole frame
 * for STORY_PUNCHLINE_MS, then the page turns by itself; a tap on the picture
 * ends the beat early. STILL NO NEXT BUTTON. Pins that said the page turns in
 * the same tick are inverted where they stand, dated; `pick` below answers and
 * taps through the beat.
 */
function pick(concept: string): void {
  fireEvent.press(screen.getByTestId(`storybook-choice-${concept}`));
  const beat = screen.queryByTestId('storybook-punchline');
  if (beat) fireEvent.press(beat);
}

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

    // 2026-09-16: what the frame holds after a pick is the PUNCHLINE, and the
    // frame is where it sits. Ending it still reveals no button.
    const beat = within(frame).getByTestId('storybook-punchline');
    fireEvent.press(beat);
    expect(screen.queryByTestId('storybook-punchline')).toBeNull();
    expect(screen.queryByTestId('storybook-next')).toBeNull();
  });

  test('the punchline turns the page BY ITSELF when its beat runs out', async () => {
    // Added 2026-09-16. No press on anything: the timer ends the beat.
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    jest.useFakeTimers();
    try {
      const first = BOOK.scenes[0]!.choices[0]!;
      fireEvent.press(screen.getByTestId(`storybook-choice-${first.concept}`));
      expect(screen.getByTestId('storybook-punchline')).toBeOnTheScreen();
      // Under the beat the board is still the scene just answered.
      expect(screen.getByTestId(`storybook-choice-${first.concept}`)).toBeOnTheScreen();

      act(() => {
        jest.advanceTimersByTime(STORY_PUNCHLINE_MS - 100);
      });
      expect(screen.getByTestId('storybook-punchline')).toBeOnTheScreen();
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('storybook-punchline')).toBeNull();
      for (const choice of BOOK.scenes[1]!.choices) {
        expect(screen.getByTestId(`storybook-choice-${choice.concept}`)).toBeOnTheScreen();
      }
    } finally {
      jest.useRealTimers();
    }
  });

  test('the punchline is the outcome still for the line said, and the board cannot be answered under it', async () => {
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    const [first, second] = BOOK.scenes[0]!.choices;
    fireEvent.press(screen.getByTestId(`storybook-choice-${first!.concept}`));

    const beat = screen.getByTestId('storybook-punchline');
    expect(beat.props.accessibilityLabel).toBe(first!.outcome!.situation);
    const still = screen.getByTestId('storybook-punchline-still');
    // INVERTED 2026-09-16: stills moved from story/ to story/madlib/ (STORY_ART_DIR in
    // lib/story), so installed builds keep the old art beside their old words.
    expect(still.props.source.uri).toContain(
      `/story/madlib/${outcomeStillId(BOOK.scenes[0]!.id, first!.concept)}.webp`,
    );

    // A second line pressed during the beat does nothing.
    fireEvent.press(screen.getByTestId(`storybook-choice-${second!.concept}`));
    expect(screen.getByTestId('storybook-punchline').props.accessibilityLabel).toBe(
      first!.outcome!.situation,
    );
    expect(within(screen.getByTestId('storybook-said')).queryByText(`native:${second!.concept}`)).toBeNull();
  });

  test('a punchline still that was never drawn shows its brief, not a grey hole', async () => {
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    const first = BOOK.scenes[0]!.choices[0]!;
    fireEvent.press(screen.getByTestId(`storybook-choice-${first.concept}`));
    fireEvent(screen.getByTestId('storybook-punchline-still'), 'error');
    expect(screen.queryByTestId('storybook-punchline-still')).toBeNull();
    expect(
      within(screen.getByTestId('storybook-punchline')).getByText(first.outcome!.situation),
    ).toBeTruthy();
  });

  test('shows what you said above the NEXT set of lines, after its consequence had the frame', async () => {
    // The owner's words for what should replace the middle page: "show what you
    // selected previously on top of the options". The consequence is authored
    // content and went with it rather than being dropped: the still, because
    // the joke is the picture and a picture needs no translating, and its brief
    // beside it.
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    const first = BOOK.scenes[0]!.choices[0]!;
    // Zone 1 must author every consequence, or the assertions below are vacuous.
    // (jest's expect takes no message argument; the web twin's vitest does.)
    expect(first.outcome).toBeDefined();
    pick(first.concept);

    const said = screen.getByTestId('storybook-said');
    expect(within(said).getByText(`native:${first.concept}`)).toBeTruthy();
    expect(within(said).getByText(`english:${first.concept}`)).toBeTruthy();
    // INVERTED 2026-09-16 (mad-lib ruling, "it seems boring"). This asserted the
    // consequence brief and a thumbnail still inside YOU SAID. The picture now
    // has the whole frame for a beat first, so the carried line has neither.
    expect(within(said).queryByText(first.outcome!.situation)).toBeNull();
    expect(screen.queryByTestId('storybook-said-still')).toBeNull();

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
      // Through each punchline beat since 2026-09-16, tapped rather than waited.
      pick(concept);
    }
    // The ledger, straight off the fifth pick. It took a sixth press until
    // 2026-09-15, on a page whose only job was to hold a button. The taps on
    // the punchlines are not that button: each only ends its beat early.
    expect(screen.getByTestId('storybook-book')).toBeOnTheScreen();
  });

  test('the finished book is a picture strip: the ending on top, then each outcome caused, with its line', async () => {
    // INVERTS THE OLD SHAPE, 2026-09-16. The book listed each scene's English
    // brief above the line said; the briefs are accessibility labels only now.
    mockStoryData = { limited: false, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    // Every misfitting line: the disaster ending, whatever the shuffle.
    for (const scene of BOOK.scenes) {
      pick(scene.choices.find((c) => !c.fits)!.concept);
    }
    const book = screen.getByTestId('storybook-book');
    const ending = within(book).getByTestId('storybook-ending');
    // INVERTED 2026-09-16: stills moved from story/ to story/madlib/ (STORY_ART_DIR in
    // lib/story), so installed builds keep the old art beside their old words.
    expect(ending.props.source.uri).toContain('/story/madlib/door--end-disaster.webp');
    expect(ending.props.accessibilityLabel).toBe(BOOK.endings!.disaster.situation);

    const panels = within(book).getAllByTestId('storybook-book-entry');
    expect(panels).toHaveLength(BOOK.scenes.length);
    BOOK.scenes.forEach((scene, i) => {
      const choice = scene.choices.find((c) => !c.fits)!;
      const still = within(panels[i]!).getByTestId('storybook-book-still');
      expect(still.props.source.uri).toContain(`/story/madlib/${outcomeStillId(scene.id, choice.concept)}.webp`);
      expect(still.props.accessibilityLabel).toBe(choice.outcome!.situation);
      expect(within(panels[i]!).getByText(`native:${choice.concept}`)).toBeTruthy();
      expect(within(panels[i]!).getByText(`english:${choice.concept}`)).toBeTruthy();
      expect(within(panels[i]!).queryByText(scene.situation)).toBeNull();
    });

    // A strip still that was never drawn leaves no box, and keeps its brief.
    fireEvent(within(panels[0]!).getByTestId('storybook-book-still'), 'error');
    expect(within(panels[0]!).queryByTestId('storybook-book-still')).toBeNull();
    expect(
      within(panels[0]!).getByTestId('storybook-book-still-missing').props.accessibilityLabel,
    ).toBe(BOOK.scenes[0]!.choices.find((c) => !c.fits)!.outcome!.situation);
  });

  /** Every node with a testID under `root`, in render order. */
  function testIdsInOrder(root: ReturnType<typeof screen.getByTestId>): string[] {
    return root
      .findAll((n) => typeof n.props.testID === 'string' && typeof n.type === 'string')
      .map((n) => n.props.testID as string);
  }

  test('Read it again and Share your story sit at the TOP of the finished book, above the ending', async () => {
    // NEW 2026-09-16, the owner: "the play again button, put it on the top of
    // that summary screen". Read it again was the last thing on this screen,
    // under the strip and the upsell. No earlier pin held that order, so
    // nothing was inverted; this pins the new one.
    mockStoryData = { limited: true, phrases: WHOLE_BOOK };
    render(<StorybookScreen />);
    await screen.findByTestId('storybook-frame');
    for (const scene of BOOK.scenes) pick(scene.choices[0]!.concept);
    const book = screen.getByTestId('storybook-book');
    const actions = within(book).getByTestId('storybook-book-actions');
    expect(within(actions).getByText('Read it again')).toBeTruthy();
    expect(within(actions).getByText(STORY_SHARE_CTA)).toBeTruthy();
    const order = testIdsInOrder(book);
    expect(order.indexOf('storybook-book-actions')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('storybook-book-actions')).toBeLessThan(order.indexOf('storybook-ending'));
    // The upsell keeps its place after the strip.
    expect(order.lastIndexOf('storybook-book-entry')).toBeLessThan(order.indexOf('storybook-upsell'));
    // And Read it again still starts the book over from up there.
    fireEvent.press(within(actions).getByTestId('storybook-again'));
    expect(await screen.findByTestId('storybook-frame')).toBeOnTheScreen();
  });

  describe('Share your story', () => {
    // THE LAYOUT IS HIDDEN FROM THE ACCESSIBILITY TREE on purpose (it is off
    // screen and only exists for the capture), so every query into it asks
    // for hidden elements, and so does every check that it is gone.
    const HIDDEN = { includeHiddenElements: true };
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    beforeEach(() => {
      mockCaptureRef.mockReset();
      mockShareAvailable.mockReset();
      mockShareAsync.mockReset();
      process.env.EXPO_PUBLIC_DOMAIN = 'bolo.example';
    });
    afterEach(() => {
      process.env.EXPO_PUBLIC_DOMAIN = domain;
    });

    async function finishBook() {
      mockStoryData = { limited: false, phrases: WHOLE_BOOK };
      render(<StorybookScreen />);
      await screen.findByTestId('storybook-frame');
      for (const scene of BOOK.scenes) pick(scene.choices.find((c) => !c.fits)!.concept);
      return screen.getByTestId('storybook-book');
    }

    test('lays the book out off screen, waits on every still, leaves a failed one out, then shares a PNG', async () => {
      mockShareAvailable.mockResolvedValue(true);
      mockCaptureRef.mockResolvedValue('file:///tmp/story.png');
      mockShareAsync.mockResolvedValue(undefined);
      await finishBook();
      fireEvent.press(screen.getByTestId('storybook-share'));

      const card = await screen.findByTestId('story-share-card', HIDDEN);
      expect(within(card).getByText(BOOK.title, HIDDEN)).toBeTruthy();
      expect(within(card).getByText('Bolo!', HIDDEN)).toBeTruthy();
      expect(within(card).getByText('bolo.example', HIDDEN)).toBeTruthy();
      const stills = within(card).getAllByTestId('story-share-still', HIDDEN);
      // The ending, then one per beat, in the order they were caused.
      const entries = BOOK.scenes.map((sc) => {
        const c = sc.choices.find((x) => !x.fits)!;
        return { sceneId: sc.id, concept: c.concept, fitted: false };
      });
      // INVERTED 2026-09-16: stills moved from story/ to story/madlib/ (STORY_ART_DIR in
      // lib/story), so installed builds keep the old art beside their old words.
      expect(stills.map((st) => st.props.source.uri)).toEqual([
        expect.stringContaining(`/story/madlib/${storyEnding(BOOK, entries)!.stillId}.webp`),
        ...entries.map((e) => expect.stringContaining(`/story/madlib/${outcomeStillId(e.sceneId, e.concept)}.webp`)),
      ]);
      const panels = within(card).getAllByTestId('story-share-panel', HIDDEN);
      entries.forEach((e, i) => {
        expect(within(panels[i]!).getByText(`native:${e.concept}`, HIDDEN)).toBeTruthy();
        expect(within(panels[i]!).getByText(`english:${e.concept}`, HIDDEN)).toBeTruthy();
      });

      // Busy, and nothing captured while any still is still loading.
      expect(screen.getByTestId('storybook-share-busy')).toBeOnTheScreen();
      stills.slice(0, -1).forEach((st) => fireEvent(st, 'load'));
      await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
      expect(mockCaptureRef).not.toHaveBeenCalled();

      // The last one fails: it is taken out, never captured as a box.
      const failedUri = stills[stills.length - 1]!.props.source.uri;
      fireEvent(stills[stills.length - 1]!, 'error');
      expect(
        within(screen.getByTestId('story-share-card', HIDDEN))
          .getAllByTestId('story-share-still', HIDDEN)
          .map((st) => st.props.source.uri),
      ).not.toContain(failedUri);
      // Its line stays.
      const last = entries[entries.length - 1]!;
      expect(within(screen.getByTestId('story-share-card', HIDDEN)).getByText(`native:${last.concept}`, HIDDEN)).toBeTruthy();

      await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
      expect(mockCaptureRef).toHaveBeenCalledTimes(1);
      expect(mockCaptureRef.mock.calls[0]![1]).toEqual(
        // INVERTED 2026-09-16: JPEG at 0.85, not PNG (a PNG strip was 16 MB).
        expect.objectContaining({ format: 'jpg', quality: 0.85, result: 'tmpfile' }),
      );
      expect(mockShareAsync).toHaveBeenCalledWith(
        'file:///tmp/story.png',
        expect.objectContaining({ mimeType: 'image/jpeg', UTI: 'public.jpeg' }),
      );
      // The layout exists only while sharing.
      expect(screen.queryByTestId('story-share-card', HIDDEN)).toBeNull();
      expect(screen.queryByTestId('storybook-share-busy')).toBeNull();
    });

    test('a device with no share sheet is told so, and nothing is captured', async () => {
      mockShareAvailable.mockResolvedValue(false);
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      await finishBook();
      await act(async () => {
        fireEvent.press(screen.getByTestId('storybook-share'));
      });
      expect(alert).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('story-share-card', HIDDEN)).toBeNull();
      expect(mockCaptureRef).not.toHaveBeenCalled();
      expect(screen.queryByTestId('storybook-share-busy')).toBeNull();
      alert.mockRestore();
    });

    test('a capture that fails gives the button back and throws nothing', async () => {
      mockShareAvailable.mockResolvedValue(true);
      mockCaptureRef.mockRejectedValue(new Error('no snapshot'));
      await finishBook();
      fireEvent.press(screen.getByTestId('storybook-share'));
      const card = await screen.findByTestId('story-share-card', HIDDEN);
      within(card).getAllByTestId('story-share-still', HIDDEN).forEach((st) => fireEvent(st, 'load'));
      await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
      expect(mockCaptureRef).toHaveBeenCalledTimes(1);
      expect(mockShareAsync).not.toHaveBeenCalled();
      expect(screen.queryByTestId('story-share-card', HIDDEN)).toBeNull();
      expect(screen.getByTestId('storybook-book')).toBeOnTheScreen();
    });
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
    // And it is not mistaken for either failure state.
    expect(screen.queryByTestId('storybook-locked')).toBeNull();
    expect(screen.queryByTestId('storybook-load-failed')).toBeNull();
  });

  /**
   * A REQUEST THAT DID NOT ARRIVE IS NOT A LANGUAGE WITH NO WORDS (owner,
   * 2026-09-16, India book 2 in Assamese: "This story is not ready in Assamese
   * yet", on a pair the census proves plays 4 of 5 scenes in seed and
   * production). The screen never read the query's error, so a refused or
   * failed fetch drew the content-gap copy. Web twin: storybook-page.test.tsx.
   */
  describe('when the book request does not arrive', () => {
    /** The shape apiFailureStatus reads: the shared client's ApiError. */
    function apiError(status: number): Error {
      return Object.assign(new Error(`HTTP ${status}`), { name: 'ApiError', status });
    }

    // The share cases above report their own failures through the same mock.
    beforeEach(() => {
      require('@sentry/react-native').captureException.mockClear();
    });

    test('a 402 shows the locked offer, never "not ready", and routes to the paywall', async () => {
      mockStoryError = Object.assign(apiError(402), {
        data: { upgradeRequired: true, reason: 'feature_locked', feature: 'storybook' },
      });
      render(<StorybookScreen />);

      expect(await screen.findByTestId('storybook-locked')).toBeOnTheScreen();
      expect(screen.getByText(STORY_LOCKED.title)).toBeOnTheScreen();
      expect(screen.queryByTestId('storybook-short')).toBeNull();
      expect(screen.queryByText(/not ready/i)).toBeNull();
      expect(screen.queryByTestId('storybook-load-failed')).toBeNull();
      fireEvent.press(screen.getByTestId('storybook-locked-upgrade'));
      expect(mockPush).toHaveBeenCalledWith('/paywall');
      // A refusal is the gate working, not a fault to report.
      expect(require('@sentry/react-native').captureException).not.toHaveBeenCalled();
    });

    test('a 500 shows a retry, reports it, and the retry refetches', async () => {
      mockStoryError = apiError(500);
      const view = render(<StorybookScreen />);

      expect(await screen.findByTestId('storybook-load-failed')).toBeOnTheScreen();
      expect(screen.getByText(STORY_LOAD_FAILED.title)).toBeOnTheScreen();
      expect(screen.getByText(STORY_LOAD_FAILED.body)).toBeOnTheScreen();
      expect(screen.queryByTestId('storybook-short')).toBeNull();
      expect(screen.queryByText(/not ready/i)).toBeNull();
      expect(screen.queryByTestId('storybook-locked')).toBeNull();
      expect(screen.getByTestId('storybook-load-failed-back')).toBeOnTheScreen();
      const sentry = require('@sentry/react-native');
      expect(sentry.captureException).toHaveBeenCalledWith(
        mockStoryError,
        expect.objectContaining({
          tags: expect.objectContaining({ apiContext: 'storybook.load', httpStatus: '500' }),
        }),
      );

      fireEvent.press(screen.getByTestId('storybook-retry'));
      expect(mockRefetch).toHaveBeenCalledTimes(1);

      // The refetch lands: the book opens, and the failure is gone.
      mockStoryError = undefined;
      mockStoryData = { limited: false, phrases: WHOLE_BOOK };
      view.rerender(<StorybookScreen />);
      expect(await screen.findByTestId('storybook-frame')).toBeOnTheScreen();
      expect(screen.queryByTestId('storybook-load-failed')).toBeNull();
    });

    test('a network failure with no status is a retry too, not a sale', async () => {
      mockStoryError = new TypeError('Network request failed');
      render(<StorybookScreen />);
      expect(await screen.findByTestId('storybook-load-failed')).toBeOnTheScreen();
      expect(screen.queryByTestId('storybook-locked')).toBeNull();
      expect(screen.queryByTestId('storybook-short')).toBeNull();
    });
  });
});

// Added 2026-09-16 when stills moved to story/madlib/ (STORY_ART_DIR in
// lib/story). Installed builds ask for /story/<id>.webp with their old words
// bundled, so the new art must never be requested there, and the development
// override must serve the same new layout or the simulator shows the old art.
describe('storyStillUrl', () => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const override = process.env.EXPO_PUBLIC_STORY_MEDIA_HOST;
  afterEach(() => {
    process.env.EXPO_PUBLIC_DOMAIN = domain;
    if (override === undefined) delete process.env.EXPO_PUBLIC_STORY_MEDIA_HOST;
    else process.env.EXPO_PUBLIC_STORY_MEDIA_HOST = override;
  });

  it('fetches from story/madlib on its own domain', () => {
    process.env.EXPO_PUBLIC_DOMAIN = 'bolo.example';
    delete process.env.EXPO_PUBLIC_STORY_MEDIA_HOST;
    expect(storyStillUrl('door-1')).toBe('https://bolo.example/story/madlib/door-1.webp');
  });

  it('keeps the same layout under the development override', () => {
    process.env.EXPO_PUBLIC_DOMAIN = 'bolo.example';
    process.env.EXPO_PUBLIC_STORY_MEDIA_HOST = 'http://localhost:8765';
    expect(storyStillUrl('table--end-chaos')).toBe(
      'http://localhost:8765/story/madlib/table--end-chaos.webp',
    );
  });
});
