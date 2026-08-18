import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Script Trace rebuilt on stroke scoring.
//
// The behaviour worth pinning is not the drawing (that is covered where the
// scorer and the sandbox are tested) but the two product rules:
//
//   1. GATED ON CONTENT. With no authored alphabet the game says so instead of
//      dealing a three-letter round. That is the same failure mode as an empty
//      journey, and it must be impossible to ship by accident.
//   2. THE GUIDE IS NOT SHOWN WHILE TRACING. A visible guide turns the game
//      into colouring in; it appears with the verdict, which is when it
//      teaches.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  lang: "hi",
  glyphs: [] as unknown[],
  ready: false,
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: h.lang,
    activeLanguage: { code: h.lang, name: "Hindi" },
    languages: [],
  }),
}));

vi.mock("@/lib/scripts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scripts")>("@/lib/scripts");
  return {
    ...actual,
    glyphsForLanguage: () => h.glyphs,
    traceReadyFor: () => h.ready,
  };
});

import ScriptTraceGame from "@/pages/games/script-trace-game";

function stubBox(el: Element) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}
const at = (p: { x: number; y: number }) => ({ clientX: p.x * 2, clientY: p.y * 2 });
function drawStroke(canvas: Element, pts: { x: number; y: number }[]) {
  fireEvent.pointerDown(canvas, { pointerId: 1, ...at(pts[0]!) });
  for (const p of pts.slice(1)) fireEvent.pointerMove(canvas, { pointerId: 1, ...at(p) });
  fireEvent.pointerUp(canvas, { pointerId: 1, ...at(pts[pts.length - 1]!) });
}

const BAR = [
  { x: 30, y: 20 },
  { x: 30, y: 80 },
];
const TOP = [
  { x: 15, y: 22 },
  { x: 85, y: 22 },
];

/** A dozen identical two-stroke glyphs: enough to clear the playable floor. */
function fakeAlphabet(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `x-${i}`,
    char: "क",
    label: `k${i}`,
    strokes: [BAR, TOP],
  }));
}

function renderGame() {
  const { hook } = memoryLocation({ path: "/games/script-trace-game" });
  return render(
    <Router hook={hook}>
      <ScriptTraceGame />
    </Router>,
  );
}

beforeEach(() => {
  h.lang = "hi";
  h.glyphs = [];
  h.ready = false;
});

describe("THE GATE: no alphabet, no game", () => {
  test("it says so plainly instead of dealing a short round", () => {
    h.glyphs = fakeAlphabet(3);
    h.ready = false;
    renderGame();

    expect(screen.getByTestId("trace-not-ready")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-canvas")).not.toBeInTheDocument();
    // And it says how far off it is, rather than just refusing.
    expect(screen.getByTestId("trace-not-ready")).toHaveTextContent("3 of 12");
  });

  test("with an alphabet, the game runs", () => {
    h.glyphs = fakeAlphabet(12);
    h.ready = true;
    renderGame();

    expect(screen.queryByTestId("trace-not-ready")).not.toBeInTheDocument();
    expect(screen.getByTestId("trace-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("1 of 6");
  });
});

describe("a round", () => {
  beforeEach(() => {
    h.glyphs = fakeAlphabet(12);
    h.ready = true;
  });

  test("Check is refused until something is drawn", () => {
    renderGame();
    expect(screen.getByTestId("trace-check")).toBeDisabled();

    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    expect(screen.getByTestId("trace-check")).toBeEnabled();
  });

  test("THE GUIDE IS HIDDEN while tracing and shown with the verdict", () => {
    const { container } = renderGame();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);

    // Numbered stroke starts are the guide's tell; none before checking.
    expect(container.querySelectorAll("circle")).toHaveLength(0);

    drawStroke(canvas, BAR);
    drawStroke(canvas, TOP);
    expect(container.querySelectorAll("circle")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("trace-check"));
    expect(container.querySelectorAll("circle").length).toBeGreaterThan(0);
  });

  test("a correct trace reads clean", () => {
    renderGame();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    drawStroke(canvas, TOP);
    fireEvent.click(screen.getByTestId("trace-check"));

    expect(screen.getByTestId("trace-verdict")).toHaveTextContent("Clean");
  });

  test("wrong order is named, not just marked down", () => {
    renderGame();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, TOP);
    drawStroke(canvas, BAR);
    fireEvent.click(screen.getByTestId("trace-check"));

    const verdict = screen.getByTestId("trace-verdict");
    expect(verdict).toHaveTextContent("Right shapes, wrong order.");
  });

  test("drawing is locked once checked, so a verdict cannot be edited", () => {
    const { container } = renderGame();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    fireEvent.click(screen.getByTestId("trace-check"));

    const before = container.querySelectorAll("path").length;
    drawStroke(canvas, TOP);
    expect(container.querySelectorAll("path")).toHaveLength(before);
  });
});

describe("a run", () => {
  beforeEach(() => {
    h.glyphs = fakeAlphabet(12);
    h.ready = true;
  });

  test("advances letter by letter and finishes with an average", () => {
    renderGame();
    for (let round = 1; round <= 6; round++) {
      expect(screen.getByTestId("trace-progress")).toHaveTextContent(`${round} of 6`);
      const canvas = screen.getByTestId("trace-canvas");
      stubBox(canvas);
      drawStroke(canvas, BAR);
      drawStroke(canvas, TOP);
      fireEvent.click(screen.getByTestId("trace-check"));
      fireEvent.click(screen.getByTestId("trace-next"));
    }

    // Six clean letters, so the run averages 100.
    expect(screen.getByTestId("trace-total")).toHaveTextContent("100");
    expect(screen.getByText("6 of 6 letters clean")).toBeInTheDocument();
  });

  test("a run is never longer than the alphabet behind it", () => {
    // Four authored glyphs would otherwise repeat letters to fill six rounds.
    h.glyphs = fakeAlphabet(4);
    renderGame();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("1 of 4");
  });
});
