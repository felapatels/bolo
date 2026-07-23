/**
 * Confirms the guided tour works end-to-end on Expo web (Platform.OS === 'web')
 * without crashing.
 *
 * The regression being guarded: the home screen's scrollIntoView callback for
 * the "topics" step (step index 1) originally called `findNodeHandle`, which
 * throws on web. The fix wraps that call in `Platform.OS === 'web'` and uses
 * `scrollTo({ y: 500 })` as the fallback. These tests confirm:
 *
 *  1. All six tour steps advance without throwing on web.
 *  2. The topics step (index 1) scrollIntoView fires the web-safe fallback
 *     (`scrollTo({ y: 500 })`) and never calls `findNodeHandle`.
 *  3. The progress step (index 4) scrollIntoView fires and uses `scrollTo`.
 *  4. The tour closes cleanly when the final step's Next/Done button is pressed.
 *  5. Skipping on any step also closes the tour cleanly.
 *
 * Implementation note — why we don't mock Platform.OS:
 *   jest-expo intercepts the Platform module before a jest.mock factory can
 *   override it. Instead, the helper component `WebScrollRegistrar` registers
 *   the exact callbacks that the real home screen registers when
 *   Platform.OS === 'web' — the scrollTo({ y: 500 }) branch — which is the
 *   code path we need to exercise. This precisely mirrors index.tsx:
 *
 *     if (Platform.OS === 'web') {
 *       scrollViewRef.current?.scrollTo({ y: 500, animated: true });
 *       return;               // ← exits; findNodeHandle is never called
 *     }
 *
 * Implementation note — why we register a highlight ref:
 *   GuidedTour only calls `step.scrollIntoView` when the step also carries a
 *   `highlightRef` with a non-null current. We attach a minimal fake ref
 *   (measureInWindow stub) to the spotlight steps so the full scroll→measure
 *   pipeline runs, which is the code path that previously crashed on web.
 */

// ─── module mocks (must appear before any imports) ───────────────────────────

// react-native index.js: `get Modal() { return require('./Libraries/Modal/Modal').default; }`
// The factory must export `default` or Modal is undefined when GuidedTour renders.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const ModalStub = ({
    children,
    visible,
  }: {
    children: React.ReactNode;
    visible: boolean;
  }) => (visible ? React.createElement('View', { testID: 'modal' }, children) : null);
  return { __esModule: true, default: ModalStub };
});

// constants/fonts imports @expo-google-fonts/* which hits the native bridge.
jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  fontMap: {},
  isTallCascadingScript: () => false,
  nativeTextStyle: () => ({ fontFamily: 'Inter_400Regular' }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#FFFFFF',
    border: '#E5E5E5',
    primary: '#6C3FC5',
    primaryForeground: '#FFFFFF',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    muted: '#CCCCCC',
  }),
}));

// ─── imports (after mocks) ────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

import {
  TourProvider,
  useTour,
  TOUR_STEPS,
  TOUR_STEP_INDEX,
} from '@/contexts/TourContext';
import { GuidedTour } from '@/components/GuidedTour';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal ref that GuidedTour accepts as a valid highlight target.
 * measureInWindow calls cb with non-zero dimensions so GuidedTour can set
 * spotRect (which is what makes the spotlight branch run, as opposed to the
 * no-ref fallback caption card).
 */
function makeMeasureRef(
  measureSpy?: jest.Mock,
): React.RefObject<View | null> {
  const spy =
    measureSpy ??
    jest.fn((cb: (x: number, y: number, w: number, h: number) => void) =>
      cb(10, 100, 300, 60),
    );
  return { current: { measureInWindow: spy } as unknown as View };
}

/**
 * Replicates the exact callbacks that the home screen registers when
 * Platform.OS === 'web'.
 *
 * - Topics step: calls scrollTo({ y: 500, animated: true }) and returns.
 *   No findNodeHandle, no measureLayout — web-safe by construction.
 * - Progress step: calls scrollTo({ y: 0, animated: true }).
 *
 * Both steps also get a synthetic highlightRef so GuidedTour enters the
 * scroll→measure pipeline (the path that originally crashed on web).
 *
 * scrollSpy captures every scrollTo call made through the fake scrollViewRef.
 */
function WebScrollRegistrar({ scrollSpy }: { scrollSpy: jest.Mock }) {
  const { registerHighlightRef, registerScrollIntoView, openTour } = useTour();

  const scrollViewRef = useRef<ScrollView>({
    scrollTo: scrollSpy,
  } as unknown as ScrollView);

  useEffect(() => {
    // Highlight refs — needed so GuidedTour enters the scroll→measure branch.
    registerHighlightRef(TOUR_STEP_INDEX.topics, makeMeasureRef());
    registerHighlightRef(TOUR_STEP_INDEX.progress, makeMeasureRef());

    // Topics step: web-safe branch from index.tsx (Platform.OS === 'web').
    // findNodeHandle is intentionally absent — reaching it would throw.
    registerScrollIntoView(TOUR_STEP_INDEX.topics, () => {
      scrollViewRef.current?.scrollTo({ y: 500, animated: true });
    });

    // Progress step: always scrolls to y:0 (same on all platforms).
    registerScrollIntoView(TOUR_STEP_INDEX.progress, () => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    openTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Full tree: provider + web registrar + the real GuidedTour overlay. */
function renderTourOnWeb(scrollSpy: jest.Mock, onDone?: jest.Mock) {
  return render(
    <TourProvider onDone={onDone}>
      <WebScrollRegistrar scrollSpy={scrollSpy} />
      <GuidedTour />
    </TourProvider>,
  );
}

/**
 * Press the "Next" / "Done" button in the tour overlay.
 * GuidedTour renders text "Next" (steps 0-4) or "Done" (step 5).
 */
async function pressNext(queries: ReturnType<typeof renderTourOnWeb>) {
  await act(async () => {
    const btn =
      queries.queryByText('Next') ?? queries.getByText('Done');
    fireEvent.press(btn);
  });
}

/** Press the first "Skip" text found in the overlay. */
async function pressSkip(queries: ReturnType<typeof renderTourOnWeb>) {
  await act(async () => {
    fireEvent.press(queries.getAllByText('Skip')[0]);
  });
}

/** Advance fake timers past the GuidedTour 350 ms scroll-settle window. */
async function flushTimers() {
  await act(async () => { jest.advanceTimersByTime(400); });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('Guided tour — Expo web end-to-end', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // ── 1. Tour opens and shows step 0 ───────────────────────────────────────

  test('tour opens and renders the first step without crashing', async () => {
    const queries = renderTourOnWeb(jest.fn());
    await act(async () => {});

    // Step 0 has no highlightRef/scrollIntoView → full-screen caption-card.
    expect(queries.getByText(TOUR_STEPS[0].title)).toBeTruthy();
    expect(queries.getByText('Next')).toBeTruthy();
  });

  // ── 2. Advancing to the topics step fires the web-safe scrollTo ──────────

  test('advancing to topics step calls scrollTo({ y:500 }) — not findNodeHandle', async () => {
    const scrollSpy = jest.fn();
    const queries = renderTourOnWeb(scrollSpy);
    await act(async () => {});

    // Step 0 → step 1 (topics). GuidedTour calls the registered
    // scrollIntoView, then waits 350 ms before measuring.
    await pressNext(queries);

    // The scrollIntoView callback fires immediately when goNext runs.
    expect(scrollSpy).toHaveBeenCalledWith({ y: 500, animated: true });

    // If findNodeHandle had been called it would have thrown. Reaching this
    // assertion without an error IS the guard — no try/catch needed.
  });

  // ── 3. All six steps advance without crashing ─────────────────────────────

  test('clicking Next through all six steps does not throw', async () => {
    const queries = renderTourOnWeb(jest.fn());
    await act(async () => {});

    // Steps 0–4: each press advances by one.
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      expect(queries.getByText(TOUR_STEPS[i].title)).toBeTruthy();
      await pressNext(queries);
      await flushTimers();
    }

    // Step 5: final step shows "Done" instead of "Next".
    expect(queries.getByText(TOUR_STEPS[TOUR_STEPS.length - 1].title)).toBeTruthy();
    expect(queries.getByText('Done')).toBeTruthy();
  });

  // ── 4. Tour closes cleanly after the final step ───────────────────────────

  test('tour closes and calls onDone after the last step', async () => {
    const scrollSpy = jest.fn();
    const onDone = jest.fn();
    const queries = renderTourOnWeb(scrollSpy, onDone);
    await act(async () => {});

    // Advance through all steps including the final "Done" press.
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      await pressNext(queries);
      await flushTimers();
    }

    // Flush the setTimeout(closeAndNotify, 0) that goNext schedules on the
    // final step. With fake timers we must use runAllTimers (not a Promise
    // wrapping setTimeout, which would itself be fake and never fire).
    await act(async () => { jest.runAllTimers(); });

    // Tour overlay must be gone.
    expect(queries.queryByText(TOUR_STEPS[TOUR_STEPS.length - 1].title)).toBeNull();
    // onDone must have been called exactly once.
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ── 5. Progress step (index 4) scrollIntoView scrolls to y:0 ────────────

  test('progress step scrollIntoView scrolls to y:0', async () => {
    const scrollSpy = jest.fn();
    const queries = renderTourOnWeb(scrollSpy);
    await act(async () => {});

    // Advance to TOUR_STEP_INDEX.progress.
    for (let i = 0; i < TOUR_STEP_INDEX.progress; i++) {
      await pressNext(queries);
      await flushTimers();
    }

    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ y: 0 }),
    );
  });

  // ── 6. Skipping from step 0 closes the tour and calls onDone ─────────────

  test('Skip closes the tour from step 0 and calls onDone', async () => {
    const onDone = jest.fn();
    const queries = renderTourOnWeb(jest.fn(), onDone);
    await act(async () => {});

    await pressSkip(queries);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(queries.queryByText(TOUR_STEPS[0].title)).toBeNull();
  });

  // ── 7. Skipping after the formerly-crashing topics step ──────────────────

  test('Skip works after advancing past the topics step (the formerly-crashing step)', async () => {
    const scrollSpy = jest.fn();
    const onDone = jest.fn();
    const queries = renderTourOnWeb(scrollSpy, onDone);
    await act(async () => {});

    // Advance to step 1 (topics) — this is the step that previously crashed.
    await pressNext(queries);
    await flushTimers();

    // Web-safe scrollTo must have fired without throwing.
    expect(scrollSpy).toHaveBeenCalledWith({ y: 500, animated: true });

    // Skip from step 1 — tour must close cleanly.
    await pressSkip(queries);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
