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
//   3. WATCH, THEN TRACE. Hiding the guide on a letter nobody has ever seen
//      written is testing something never taught, so every letter opens with
//      the pen demo and the attempt starts when the learner says so.
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

/** Every letter opens on the demo; the attempt starts on My turn. */
function myTurn() {
  fireEvent.click(screen.getByTestId("trace-my-turn"));
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
    myTurn();
    expect(screen.getByTestId("trace-check")).toBeDisabled();

    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    expect(screen.getByTestId("trace-check")).toBeEnabled();
  });

  test("THE GUIDE IS HIDDEN while tracing and shown with the verdict", () => {
    const { container } = renderGame();
    myTurn();
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
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    drawStroke(canvas, TOP);
    fireEvent.click(screen.getByTestId("trace-check"));

    expect(screen.getByTestId("trace-verdict")).toHaveTextContent("Clean");
  });

  test("wrong order is named, not just marked down", () => {
    renderGame();
    myTurn();
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
    myTurn();
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
      myTurn();
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

describe("WATCH, THEN TRACE", () => {
  beforeEach(() => {
    h.glyphs = fakeAlphabet(12);
    h.ready = true;
  });

  test("a letter opens on the demo, not on a blank canvas", () => {
    renderGame();
    // The demo's controls are the tell, and Check is not among them: the
    // learner cannot be scored on a letter they have not been shown.
    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
    expect(screen.getByTestId("trace-watch-again")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-check")).not.toBeInTheDocument();
  });

  test("THE PEN IS DEAD while the demo plays, so watching cannot be scored", () => {
    const { container } = renderGame();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);

    const before = container.querySelectorAll("path").length;
    drawStroke(canvas, BAR);
    // Nothing banked: strokes drawn over the demo would otherwise arrive as the
    // learner's own the moment they pressed My turn.
    expect(container.querySelectorAll("path")).toHaveLength(before);

    myTurn();
    expect(screen.getByTestId("trace-check")).toBeDisabled();
  });

  test("My turn clears the demo away", () => {
    const { container } = renderGame();
    myTurn();
    expect(container.querySelectorAll('[data-testid^="trace-demo-stroke-"]')).toHaveLength(0);
    expect(screen.queryByTestId("trace-my-turn")).not.toBeInTheDocument();
  });

  test("Watch again returns to the demo without losing the letter", () => {
    renderGame();
    const letter = screen.getByTestId("trace-progress").textContent;
    fireEvent.click(screen.getByTestId("trace-watch-again"));
    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent(letter!);
  });

  test("every letter gets its own demo, not just the first", () => {
    renderGame();
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    drawStroke(canvas, TOP);
    fireEvent.click(screen.getByTestId("trace-check"));
    fireEvent.click(screen.getByTestId("trace-next"));

    expect(screen.getByTestId("trace-progress")).toHaveTextContent("2 of 6");
    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
  });
});

describe("THE MNEMONIC: a letter is taught with a word", () => {
  test("the example word is shown when the glyph carries one", () => {
    h.ready = true;
    // Every glyph carries one, because the run is shuffled and a conditional
    // assertion here would pass whether or not the feature works.
    h.glyphs = fakeAlphabet(12).map((g) => ({
      ...g,
      example: { word: "कमल", roman: "kamal", gloss: "lotus" },
    }));
    renderGame();

    const shown = screen.getByTestId("trace-example");
    expect(shown).toHaveTextContent("कमल");
    expect(shown).toHaveTextContent("kamal");
    expect(shown).toHaveTextContent("lotus");
  });

  test("a glyph with no example still plays, it just teaches less", () => {
    h.ready = true;
    h.glyphs = fakeAlphabet(12); // none carry an example
    renderGame();
    expect(screen.queryByTestId("trace-example")).not.toBeInTheDocument();
    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
  });
});
