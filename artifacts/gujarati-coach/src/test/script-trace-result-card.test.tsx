import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Tracing is MARKED like a voice lesson now.
//
// It used to show one line: "Great trace! 62%". The practice screen, for the
// same act of being scored, shows a five-band ladder with the achieved rung lit
// and a sentence explaining what went wrong. Reported 2026-08-23: the two
// should read the same, because they are the same thing happening.
//
// Pins:
// (1) a finished trace produces a card, not a line;
// (2) the card carries the shared five-band ladder, labelled for tracing;
// (3) it explains what cost the marks, from what the scorer actually measured.

const h = vi.hoisted(() => ({ isPlus: true }));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEntitlements: () => ({
    isPlus: h.isPlus,
    isAllAccess: h.isPlus,
    isLoading: false,
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
}));

vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

import ScriptTracePage, { getInteriorPoints } from "@/pages/games/script-trace";
import { traceStopFor } from "@workspace/script-trace";

/** jsdom gives every element a zero box, and the page maps pointers through it. */
const BOX = 256;
function stubBox(el: Element) {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: BOX,
      height: BOX,
      right: BOX,
      bottom: BOX,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** Glyph space is 0-100 across the stubbed box. */
const client = (p: { x: number; y: number }) => ({
  clientX: (p.x / 100) * BOX,
  clientY: (p.y / 100) * BOX,
});

function renderGame() {
  const loc = memoryLocation({ path: "/games/script-trace?journey=1&zone=1", record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook}>
        <ScriptTracePage />
      </Router>
    </QueryClientProvider>,
  );
  const canvas = view.container.querySelector("canvas")!;
  stubBox(canvas);
  return { ...view, canvas };
}

/** Draw a stroke through the given glyph-space points and let the scorer run. */
function trace(canvas: Element, pts: { x: number; y: number }[]) {
  act(() => {
    canvas.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, ...client(pts[0]!) }),
    );
    for (const p of pts.slice(1)) {
      canvas.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, ...client(p) }),
      );
    }
    canvas.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, ...client(pts[pts.length - 1]!) }),
    );
  });
  // The page debounces scoring 1.2 s after the last lift.
  act(() => {
    vi.advanceTimersByTime(1300);
  });
}

beforeEach(() => {
  h.isPlus = true;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the tracing result card", () => {
  test("an honest trace is marked with the shared ladder and an explanation", () => {
    const first = traceStopFor("gu", 1, 1)!.characters[0]!;
    const interior = getInteriorPoints(first.guide);
    expect(interior.length).toBeGreaterThan(10);

    const { canvas } = renderGame();
    // Follow the character's own interior points: the closest a test can get
    // to a learner who traces it properly.
    trace(canvas, interior);

    const card = screen.getByTestId("trace-result-card");
    expect(card).toHaveTextContent(/% accuracy/);
    // The five-band ladder, labelled for what it is marking. Sharing the
    // component rather than copying it is why the noun is a prop.
    expect(
      card.querySelector('ol[aria-label^="Tracing result"]'),
      "the card must carry the shared band ladder",
    ).not.toBeNull();
    // And a sentence a learner can act on, rather than a bare number.
    expect(screen.getByTestId("trace-result-feedback").textContent?.length ?? 0)
      .toBeGreaterThan(10);
  });

  test("a tap is marked 'too small' rather than left unexplained", () => {
    const first = traceStopFor("gu", 1, 1)!.characters[0]!;
    const interior = getInteriorPoints(first.guide);
    const spot = interior[Math.floor(interior.length / 2)]!;

    const { canvas } = renderGame();
    // A stationary tap: all the ink in one place. The scorer's spread factor
    // exists for exactly this, and the card can now say so.
    trace(canvas, [spot, { x: spot.x + 0.4, y: spot.y }, { x: spot.x + 0.8, y: spot.y }]);

    expect(screen.getByTestId("trace-result-feedback")).toHaveTextContent(/too small/i);
  });
});
