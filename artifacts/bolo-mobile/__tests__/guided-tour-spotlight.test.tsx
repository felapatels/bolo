/**
 * Verifies the scroll-before-measure contract in GuidedTour:
 *
 *  1. When a step provides `scrollIntoView`, GuidedTour calls it BEFORE
 *     measureInWindow and waits 350 ms for the scroll animation to settle.
 *  2. When a step has NO `scrollIntoView`, GuidedTour measures immediately
 *     (no unnecessary 350 ms delay).
 *
 * GuidedTour reads from TourContext, so we exercise it via the real
 * TourProvider + registerHighlightRef / registerScrollIntoView APIs.
 *
 * react-native's index.js accesses Modal as `.default` on the Libraries path
 * module, so the jest.mock factory must return `{ default: Component }` —
 * otherwise Modal resolves to undefined and GuidedTour throws "Element type
 * is invalid".
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

// constants/fonts imports @expo-google-fonts/* which hits the native bridge
// (expo-modules-core TurboModuleRegistry). Stub the plain string constants
// that GuidedTour actually uses.
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

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { render, act } from '@testing-library/react-native';

import { TourProvider, useTour } from '@/contexts/TourContext';
import { GuidedTour } from '@/components/GuidedTour';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal ref whose measureInWindow delegates to `spy`. */
function makeMeasureRef(spy: jest.Mock): React.RefObject<View | null> {
  return { current: { measureInWindow: spy } as unknown as View };
}

/**
 * Registers a highlight ref (and optional scrollIntoView) for `stepIndex`,
 * then opens the tour. Renders nothing itself.
 */
function StepRegistrar({
  stepIndex,
  measureSpy,
  scrollIntoView,
}: {
  stepIndex: number;
  measureSpy: jest.Mock;
  scrollIntoView?: jest.Mock;
}) {
  const { registerHighlightRef, registerScrollIntoView, openTour } = useTour();

  useEffect(() => {
    registerHighlightRef(stepIndex, makeMeasureRef(measureSpy));
    if (scrollIntoView) registerScrollIntoView(stepIndex, scrollIntoView);
    openTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Opens the tour on mount without registering any highlight ref. */
function OpenTourOnMount() {
  const { openTour } = useTour();
  useEffect(() => {
    openTour();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Renders TourProvider + StepRegistrar + the real GuidedTour. */
function renderTour(opts: {
  stepIndex: number;
  measureSpy: jest.Mock;
  scrollIntoView?: jest.Mock;
}) {
  return render(
    <TourProvider>
      <StepRegistrar {...opts} />
      <GuidedTour />
    </TourProvider>,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('GuidedTour spotlight — scroll-before-measure contract', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // ── test 1: scrollIntoView is called first, measureInWindow is delayed ───

  test('calls scrollIntoView before measureInWindow and waits 350 ms', async () => {
    const callOrder: string[] = [];

    const scrollIntoView = jest.fn(() => callOrder.push('scroll'));

    // measureInWindow receives a callback; invoke it with non-zero dims so
    // GuidedTour can set spotRect.
    const measureSpy = jest.fn(
      (cb: (x: number, y: number, w: number, h: number) => void) => {
        callOrder.push('measure');
        cb(50, 100, 200, 60);
      },
    );

    renderTour({ stepIndex: 0, measureSpy, scrollIntoView });

    // Let initial render + useEffects settle.
    await act(async () => {});

    // scrollIntoView must have fired; measureInWindow must NOT yet (inside the
    // 350 ms settle window).
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(measureSpy).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['scroll']);

    // Advance past the 350 ms window.
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['scroll', 'measure']);
  });

  // ── test 2: no scrollIntoView → measures synchronously, no delay ─────────

  test('measures immediately when the step has no scrollIntoView', async () => {
    const measureSpy = jest.fn(
      (cb: (x: number, y: number, w: number, h: number) => void) => {
        cb(50, 100, 200, 60);
      },
    );

    renderTour({ stepIndex: 0, measureSpy }); // no scrollIntoView

    // measureInWindow must be called inside the effect, before any timer
    // advances.
    await act(async () => {});

    expect(measureSpy).toHaveBeenCalledTimes(1);
  });

  // ── test 3: measure does not fire mid-window ──────────────────────────────

  test('measure is NOT called before the 350 ms window closes', async () => {
    const measureSpy = jest.fn(
      (cb: (x: number, y: number, w: number, h: number) => void) => {
        cb(50, 100, 200, 60);
      },
    );

    renderTour({ stepIndex: 0, measureSpy, scrollIntoView: jest.fn() });

    await act(async () => {});

    // 200 ms — still inside the window.
    await act(async () => jest.advanceTimersByTime(200));
    expect(measureSpy).not.toHaveBeenCalled();

    // Cross the 350 ms threshold.
    await act(async () => jest.advanceTimersByTime(150));
    expect(measureSpy).toHaveBeenCalledTimes(1);
  });

  // ── test 4: cleanup cancels the pending timeout on unmount ────────────────

  test('cancels the pending measure if the component unmounts before 350 ms', async () => {
    const measureSpy = jest.fn();

    const { unmount } = renderTour({
      stepIndex: 0,
      measureSpy,
      scrollIntoView: jest.fn(),
    });

    await act(async () => {});
    expect(measureSpy).not.toHaveBeenCalled();

    // Unmount while the timeout is still pending.
    unmount();

    await act(async () => jest.advanceTimersByTime(500));

    // measureInWindow must NOT be called after the component is gone.
    expect(measureSpy).not.toHaveBeenCalled();
  });

  // ── test 5: no highlightRef → fallback card, no measureInWindow ──────────

  test('falls back to the caption card and never calls measureInWindow when no ref is registered', async () => {
    // Open the tour without registering any highlight ref. GuidedTour should
    // render the full-screen caption card fallback, skipping all measurement.
    const measureSpy = jest.fn();

    render(
      <TourProvider>
        <OpenTourOnMount />
        <GuidedTour />
      </TourProvider>,
    );

    await act(async () => {});
    await act(async () => jest.advanceTimersByTime(500));

    expect(measureSpy).not.toHaveBeenCalled();
  });
});
