import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Script Trace on stroke scoring, with the letters/words/sentences ladder.
//
// The behaviour worth pinning is not the drawing (that is covered where the
// scorer and the sandbox are tested) but the product rules:
//
//   1. GATED ON CONTENT. With no authored alphabet the game says so instead of
//      dealing a three-letter round. Same failure mode as an empty journey.
//   2. GATED ON PLAN. It is paid, and an unpaid caller lands on /upgrade.
//   3. THE GUIDE IS NOT SHOWN WHILE TRACING. A visible guide turns the game
//      into colouring in; it appears with the verdict, which is when it
//      teaches.
//   4. WATCH, THEN TRACE. Hiding the guide on a letter nobody has ever seen
//      written tests something never taught, so every letter opens with the
//      pen demo.
//   5. A WORD IS ITS LETTERS. The words level costs no new stroke data, and a
//      word round walks the same authored glyphs one at a time.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  lang: "hi",
  glyphs: [] as unknown[],
  isPlus: true,
  entLoading: false,
  phrases: [] as unknown[],
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: h.lang,
    activeLanguage: { code: h.lang, name: "Hindi" },
    languages: [],
  }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: h.entLoading }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListCategories: () => ({ data: [{ id: 1 }] }),
  useListCategoryPhrases: () => ({ data: h.phrases }),
  getListCategoriesQueryKey: () => ["categories"],
  getListCategoryPhrasesQueryKey: () => ["phrases"],
}));

vi.mock("@workspace/script-trace", async () => {
  const actual = await vi.importActual<typeof import("@workspace/script-trace")>("@workspace/script-trace");
  return { ...actual, glyphsForLanguage: () => h.glyphs };
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

/** Two-stroke glyphs with distinct characters, so words can be composed. */
function fakeAlphabet(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `x-${i}`,
    char: String.fromCharCode(0x0915 + i),
    label: `k${i}`,
    strokes: [BAR, TOP],
  }));
}

/** The same, but each letter carries a one-letter mnemonic so words compose. */
function withWords(n: number) {
  return fakeAlphabet(n).map((g) => ({
    ...g,
    example: { word: `${g.char}${g.char}`, roman: `${g.label}${g.label}`, gloss: "a thing" },
  }));
}

let loc: ReturnType<typeof memoryLocation>;
function renderGame(path = "/games/script-trace-game") {
  loc = memoryLocation({ path, record: true });
  return render(
    <Router hook={loc.hook}>
      <ScriptTraceGame />
    </Router>,
  );
}

/** Every letter opens on the demo; the attempt starts on My turn. */
function myTurn() {
  fireEvent.click(screen.getByTestId("trace-my-turn"));
}

/** Trace the current letter cleanly and move on. */
function traceClean() {
  myTurn();
  const canvas = screen.getByTestId("trace-canvas");
  stubBox(canvas);
  drawStroke(canvas, BAR);
  drawStroke(canvas, TOP);
  fireEvent.click(screen.getByTestId("trace-check"));
  fireEvent.click(screen.getByTestId("trace-next"));
}

beforeEach(() => {
  h.lang = "hi";
  h.glyphs = [];
  h.isPlus = true;
  h.entLoading = false;
  h.phrases = [];
});

describe("THE PLAN GATE: this one is paid", () => {
  test("an unpaid caller is sent to upgrade, not shown the ladder", () => {
    h.glyphs = fakeAlphabet(12);
    h.isPlus = false;
    renderGame();

    expect(loc.history[loc.history.length - 1]).toBe("/upgrade");
    expect(screen.queryByTestId("trace-level-letters")).not.toBeInTheDocument();
  });

  test("nothing is decided while the snapshot is still loading", () => {
    // Redirecting on a not-yet-known plan would bounce paying subscribers.
    h.glyphs = fakeAlphabet(12);
    h.isPlus = false;
    h.entLoading = true;
    renderGame();

    expect(loc.history[loc.history.length - 1]).not.toBe("/upgrade");
  });
});

describe("THE CONTENT GATE: no alphabet, no game", () => {
  test("it says so plainly instead of dealing a short round", () => {
    h.glyphs = fakeAlphabet(3);
    renderGame();

    expect(screen.getByTestId("trace-not-ready")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-canvas")).not.toBeInTheDocument();
    // And it says how far off it is, rather than just refusing.
    expect(screen.getByTestId("trace-not-ready")).toHaveTextContent("3 of 12");
  });

  test("with an alphabet, the ladder appears", () => {
    h.glyphs = fakeAlphabet(12);
    renderGame();

    expect(screen.queryByTestId("trace-not-ready")).not.toBeInTheDocument();
    expect(screen.getByTestId("trace-level-letters")).toBeInTheDocument();
  });
});

describe("THE LADDER", () => {
  test("a locked level is shown with its shortfall, not hidden", () => {
    // Hiding it reads as a missing feature; naming the shortfall is a roadmap.
    h.glyphs = fakeAlphabet(12); // no mnemonics, so no words
    renderGame();

    const locked = screen.getByTestId("trace-level-locked-words");
    expect(locked).toHaveTextContent("0 of 8");
  });

  test("mnemonics unlock the words level with no new stroke data", () => {
    h.glyphs = withWords(12);
    renderGame();

    expect(screen.getByTestId("trace-level-words")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-level-locked-words")).not.toBeInTheDocument();
  });

  test("sentences stay locked until phrases actually compose", () => {
    h.glyphs = withWords(12);
    renderGame();
    expect(screen.getByTestId("trace-level-locked-sentences")).toBeInTheDocument();
  });

  test("composable phrases unlock sentences", () => {
    const glyphs = withWords(12);
    h.glyphs = glyphs;
    // Two-letter sentences built only from authored characters.
    h.phrases = glyphs.slice(0, 6).map((g, i) => ({
      nativeScript: `${g.char} ${glyphs[i + 1]!.char}`,
      romanized: `${g.label} x`,
      english: "something",
    }));
    renderGame();

    expect(screen.getByTestId("trace-level-sentences")).toBeInTheDocument();
  });

  test("picking a level starts a run", () => {
    h.glyphs = fakeAlphabet(12);
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-letters"));

    expect(screen.getByTestId("trace-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("1 of 6");
  });
});

describe("a round", () => {
  beforeEach(() => {
    h.glyphs = fakeAlphabet(12);
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-letters"));
  });

  test("Check is refused until something is drawn", () => {
    myTurn();
    expect(screen.getByTestId("trace-check")).toBeDisabled();

    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    expect(screen.getByTestId("trace-check")).toBeEnabled();
  });

  test("a correct trace reads clean", () => {
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    drawStroke(canvas, TOP);
    fireEvent.click(screen.getByTestId("trace-check"));

    expect(screen.getByTestId("trace-verdict")).toHaveTextContent("Clean");
  });

  test("wrong order is named, not just marked down", () => {
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, TOP);
    drawStroke(canvas, BAR);
    fireEvent.click(screen.getByTestId("trace-check"));

    expect(screen.getByTestId("trace-verdict")).toHaveTextContent("Right shapes, wrong order.");
  });

  test("drawing is locked once checked, so a verdict cannot be edited", () => {
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    fireEvent.click(screen.getByTestId("trace-check"));

    const before = document.querySelectorAll("path").length;
    drawStroke(canvas, TOP);
    expect(document.querySelectorAll("path")).toHaveLength(before);
  });
});

describe("WATCH, THEN TRACE", () => {
  beforeEach(() => {
    h.glyphs = fakeAlphabet(12);
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-letters"));
  });

  test("a letter opens on the demo, not on a blank canvas", () => {
    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
    expect(screen.getByTestId("trace-watch-again")).toBeInTheDocument();
    // The learner cannot be scored on a letter they have not been shown.
    expect(screen.queryByTestId("trace-check")).not.toBeInTheDocument();
  });

  test("THE PEN IS DEAD while the demo plays, so watching cannot be scored", () => {
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);

    myTurn();
    // Strokes drawn over the demo would otherwise arrive as the learner's own.
    expect(screen.getByTestId("trace-check")).toBeDisabled();
  });

  test("THE GUIDE IS HIDDEN while tracing and shown with the verdict", () => {
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);

    // Numbered stroke starts are the guide's tell; none during the attempt.
    expect(document.querySelectorAll("circle")).toHaveLength(0);
    drawStroke(canvas, BAR);
    drawStroke(canvas, TOP);
    expect(document.querySelectorAll("circle")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("trace-check"));
    expect(document.querySelectorAll("circle").length).toBeGreaterThan(0);
  });

  test("My turn clears the demo away", () => {
    myTurn();
    expect(document.querySelectorAll('[data-testid^="trace-demo-stroke-"]')).toHaveLength(0);
    expect(screen.queryByTestId("trace-my-turn")).not.toBeInTheDocument();
  });

  test("Watch again returns to the demo without losing the letter", () => {
    const where = screen.getByTestId("trace-progress").textContent;
    fireEvent.click(screen.getByTestId("trace-watch-again"));

    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent(where!);
  });

  test("every letter gets its own demo, not just the first", () => {
    traceClean();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("2 of 6");
    expect(screen.getByTestId("trace-my-turn")).toBeInTheDocument();
  });
});

describe("A WORD IS ITS LETTERS", () => {
  beforeEach(() => {
    h.glyphs = withWords(12); // each mnemonic is two letters long
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-words"));
  });

  test("a word round shows the whole word and which letter is current", () => {
    expect(screen.getByTestId("trace-word")).toBeInTheDocument();
    expect(screen.getByTestId("trace-letter-of")).toHaveTextContent("letter 1 of 2");
  });

  test("it walks the letters before advancing the word", () => {
    traceClean();
    // Same word, second letter: the run counter has not moved.
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("1 of 6");
    expect(screen.getByTestId("trace-letter-of")).toHaveTextContent("letter 2 of 2");

    traceClean();
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("2 of 6");
    expect(screen.getByTestId("trace-letter-of")).toHaveTextContent("letter 1 of 2");
  });

  test("the button says which of the two it is about to do", () => {
    myTurn();
    const canvas = screen.getByTestId("trace-canvas");
    stubBox(canvas);
    drawStroke(canvas, BAR);
    fireEvent.click(screen.getByTestId("trace-check"));

    expect(screen.getByTestId("trace-next")).toHaveTextContent("Next letter");
  });

  test("a word carries its English, which a bare letter does not", () => {
    expect(screen.getByTestId("trace-example")).toHaveTextContent("a thing");
  });
});

describe("a run", () => {
  test("advances letter by letter and finishes with an average", () => {
    h.glyphs = fakeAlphabet(12);
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-letters"));

    for (let round = 1; round <= 6; round++) {
      expect(screen.getByTestId("trace-progress")).toHaveTextContent(`${round} of 6`);
      traceClean();
    }

    // Six clean letters, so the run averages 100.
    expect(screen.getByTestId("trace-total")).toHaveTextContent("100");
    expect(screen.getByText("6 of 6 letters clean")).toBeInTheDocument();
  });

  test("a run is never longer than the level behind it", () => {
    // Four items would otherwise repeat to fill six rounds.
    h.glyphs = fakeAlphabet(12);
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-letters"));
    expect(screen.getByTestId("trace-progress")).toHaveTextContent("1 of 6");
  });

  test("finishing returns to the ladder, so the next level is one tap away", () => {
    h.glyphs = fakeAlphabet(12);
    renderGame();
    fireEvent.click(screen.getByTestId("trace-level-letters"));
    for (let round = 1; round <= 6; round++) traceClean();

    fireEvent.click(screen.getByTestId("trace-again"));
    expect(screen.getByTestId("trace-level-letters")).toBeInTheDocument();
  });
});
