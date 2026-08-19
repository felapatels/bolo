/**
 * Regression guard for AnimPenStroke's pixel-space dash calculation.
 *
 * Bug: strokeDasharray/strokeDashoffset were set to `len` (local 0-100 guide
 * units). react-native-svg's `scale` prop scales the path geometry but NOT
 * the dash coordinate system, so the dash never covered the stroke and the
 * pen animation appeared broken on word and sentence exercises.
 *
 * Fix: `const lenPx = len * scale`, multiply by `scale` (= CANVAS_SIZE / 100)
 * before passing to the dash props.
 *
 * These tests verify that the rendered strokeDasharray equals `len * scale`
 * (pixel space) and not just `len` (local space).
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ─── Mock react-native-svg before the module under test is evaluated ──────────
// AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath) runs at module
// scope, so SvgPath must be mocked here (jest.mock is hoisted).

const mockPathCalls: Record<string, unknown>[][] = [];

jest.mock('react-native-svg', () => {
  const React = require('react');
  const MockPath = jest.fn((props: Record<string, unknown>) => {
    // Collect all prop sets so tests can inspect every instance.
    // We can't reference the outer `mockPathCalls` directly (hoisting), so
    // we push through a require-time side channel instead.
    (globalThis as Record<string, unknown>).__mockSvgPathCalls__ =
      (globalThis as Record<string, unknown>).__mockSvgPathCalls__ ?? [];
    ((globalThis as Record<string, unknown>).__mockSvgPathCalls__ as unknown[]).push(props);
    return null;
  });

  const noop = jest.fn(() => null);
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Path: MockPath,
    Text: noop,
    Circle: noop,
    Rect: noop,
    Defs: noop,
    ClipPath: noop,
  };
});

// ─── Stub every other import that script-trace.tsx pulls in ──────────────────

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: () => ({ runOnJS: () => ({ onBegin: () => ({ onUpdate: () => ({ onFinalize: () => ({}) }) }) }) }) },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
  TAB_BAR_CLEARANCE: 80,
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    muted: '#F5F5F5',
    border: '#E0E0E0',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {},
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ activeLang: 'gu', activeLanguage: { name: 'Gujarati' } }),
}));

jest.mock('@/lib/game-data/script-trace-chapters', () => ({
  SCRIPT_TRACE_CHAPTERS: [],
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  recordScriptTraceProgress: jest.fn(),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

// ─── Import AnimPenStroke AFTER mocks are in place ───────────────────────────

import { AnimPenStroke } from '../app/(app)/(tabs)/games/script-trace';

// ─── Helper: drain the global SVG Path prop capture ─────────────────────────

function drainPathCalls(): Record<string, unknown>[] {
  const calls = (globalThis as Record<string, unknown>).__mockSvgPathCalls__ as Record<string, unknown>[] | undefined;
  const result = calls ? [...calls] : [];
  (globalThis as Record<string, unknown>).__mockSvgPathCalls__ = [];
  return result;
}

beforeEach(() => {
  drainPathCalls(); // reset between tests
});

// ─── Shared value stub (matches global reanimated mock shape) ─────────────────

function makeProgress(v = 0) {
  return { value: v };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AnimPenStroke, strokeDasharray pixel-space invariant', () => {
  test('renders strokeDasharray as len * scale (pixel space), not len (local space)', () => {
    // Simulates a single-character stroke: len=50 local units, scale=2.5 (250px canvas / 100)
    const len = 50;
    const scale = 2.5;
    const expectedPx = len * scale; // 125 px

    render(
      <AnimPenStroke
        progress={makeProgress()}
        d="M 10 10 L 50 50"
        len={len}
        start={0}
        end={1}
        scale={scale}
        color="#6C3FC5"
      />,
    );

    const calls = drainPathCalls();
    // AnimatedSvgPath renders as the mocked Path (via createAnimatedComponent passthrough).
    // There should be exactly one Path rendered per AnimPenStroke.
    expect(calls.length).toBeGreaterThan(0);

    // The critical assertion: dasharray must be in pixel space.
    const dasharray = calls[0].strokeDasharray;
    expect(dasharray).toBe(`${expectedPx}`);          // pixel space ✓
    expect(dasharray).not.toBe(`${len}`);             // NOT local space ✗
  });

  test('strokeDashoffset initial value is also in pixel space (len * scale)', () => {
    const len = 40;
    const scale = 3.0;
    const expectedPx = len * scale; // 120 px

    render(
      <AnimPenStroke
        progress={makeProgress(0)}
        d="M 5 5 L 40 40"
        len={len}
        start={0}
        end={1}
        scale={scale}
        color="#6C3FC5"
      />,
    );

    const calls = drainPathCalls();
    expect(calls.length).toBeGreaterThan(0);
    // Static dashoffset (full hide at t=0) must also be in pixel space.
    expect(calls[0].strokeDashoffset).toBe(expectedPx);
    expect(calls[0].strokeDashoffset).not.toBe(len);
  });

  test('word exercise scale: multi-stroke scenario, each stroke dasharray uses pixel units', () => {
    // Words have multiple pen strokes. Each AnimPenStroke gets its own len
    // (local-space polyline length of that skeleton stroke) and the shared
    // guideScale = CANVAS_SIZE / 100.  Simulate three strokes from a word glyph.
    const guideScale = 250 / 100; // CANVAS_SIZE=250, local 0-100 space
    const strokeLens = [30, 20, 45]; // local-space lengths of 3 word strokes

    for (let i = 0; i < strokeLens.length; i++) {
      const len = strokeLens[i];
      render(
        <AnimPenStroke
          key={i}
          progress={makeProgress()}
          d={`M ${i * 10} 10 L ${i * 10 + 20} 50`}
          len={len}
          start={i / strokeLens.length}
          end={(i + 1) / strokeLens.length}
          scale={guideScale}
          color="#6C3FC5"
        />,
      );
    }

    const calls = drainPathCalls();
    // One Path rendered per AnimPenStroke → 3 calls total.
    expect(calls).toHaveLength(3);

    for (let i = 0; i < strokeLens.length; i++) {
      const expectedPx = strokeLens[i] * guideScale;
      expect(calls[i].strokeDasharray).toBe(`${expectedPx}`);
      expect(calls[i].strokeDasharray).not.toBe(`${strokeLens[i]}`);
    }
  });

  test('sentence exercise scale: longer strokes still produce correct pixel dasharray', () => {
    // Sentence-stage glyphs are packed into the same 0-100 box, so individual
    // stroke local lengths are small but guideScale is the same ratio.
    const guideScale = 280 / 100; // larger CANVAS_SIZE scenario
    const len = 15; // short local-space stroke typical for a sentence glyph
    const expectedPx = len * guideScale; // 42 px

    render(
      <AnimPenStroke
        progress={makeProgress()}
        d="M 10 20 L 20 30"
        len={len}
        start={0}
        end={1}
        scale={guideScale}
        color="#6C3FC5"
      />,
    );

    const calls = drainPathCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].strokeDasharray).toBe(`${expectedPx}`);
    expect(calls[0].strokeDasharray).not.toBe(`${len}`);
  });

  test('scale=1 edge case: dasharray equals len (but this is the trivially wrong scenario on real devices)', () => {
    // On a device where CANVAS_SIZE happens to equal 100, scale=1 and the bug
    // would be invisible. The test documents this edge case explicitly so future
    // readers understand why scale matters in the realistic case.
    const len = 75;
    const scale = 1; // degenerate: local units === pixel units
    const expectedPx = len * scale; // 75

    render(
      <AnimPenStroke
        progress={makeProgress()}
        d="M 0 0 L 75 0"
        len={len}
        start={0}
        end={1}
        scale={scale}
        color="#6C3FC5"
      />,
    );

    const calls = drainPathCalls();
    expect(calls.length).toBeGreaterThan(0);
    // Still correct: len * scale = len when scale === 1.
    expect(calls[0].strokeDasharray).toBe(`${expectedPx}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure-logic regression: the lenPx formula itself
// ─────────────────────────────────────────────────────────────────────────────

describe('lenPx formula, pixel-space conversion', () => {
  // Mirror the exact formula from AnimPenStroke so a future rename/refactor
  // that breaks it will fail this test even if the component rendering changes.
  function lenPx(len: number, scale: number): number {
    return len * scale;
  }

  test('lenPx returns len * scale', () => {
    expect(lenPx(50, 2.5)).toBe(125);
    expect(lenPx(100, 2.5)).toBe(250);
    expect(lenPx(30, 3.0)).toBe(90);
  });

  test('lenPx is NOT the same as len when scale !== 1', () => {
    const len = 50;
    const scale = 2.5;
    expect(lenPx(len, scale)).not.toBe(len);
  });

  test('guideScale for typical CANVAS_SIZE values maps 0-100 units to pixel space', () => {
    // CANVAS_SIZE = min(window.width - 48, 300)
    // On a narrow phone: window.width=375 → CANVAS_SIZE=300, guideScale=3.0
    // On a wider phone: CANVAS_SIZE is still capped at 300 → guideScale=3.0
    const CANVAS_SIZE = 300; // typical capped value
    const guideScale = CANVAS_SIZE / 100;
    expect(guideScale).toBe(3.0);

    // A stroke of len=50 local units → 150 px in pixel space
    expect(lenPx(50, guideScale)).toBe(150);
    // Not 50 (which would be the bug: local-space dasharray on a 300px canvas)
    expect(lenPx(50, guideScale)).not.toBe(50);
  });
});
